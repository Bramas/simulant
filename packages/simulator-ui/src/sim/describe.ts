/**
 * The model view's description of an experiment (see `ModelDescription`): its semantics in words,
 * derived from the IR, and the declarations it is built from as written in their files, so that a
 * reader can compare the experiment with the paper it comes from.
 */
import type { Component, Experiment, Expr, Json, Type } from '@bramas/simulant-lang/ir';
import { derivedGroup } from '@bramas/simulant-engine/symmetry';
import { parameterValues } from '@bramas/simulant-engine/system';
import type { LeanDescription, ModelDescription, ModelFact, SourceExcerpt, SourceRef } from '@bramas/simulant-core/types/project';
import type { LeanOrigin } from '@bramas/simulant-lean-gen/model';
import type { SimLean } from '@bramas/simulant-vite-plugin/module';

type Line = { number: number; text: string };

/** `std/models.sim` for the standard library; otherwise the file's name. */
export function displayPath(file: string): string {
  const std = /[\\/]stdlib[\\/]sim[\\/](.*)$/.exec(file);
  return std ? `std/${std[1]}` : file.split(/[\\/]/).pop()!;
}

/**
 * Lines `line` to `endLine` of a file, with the doc comment (`/-- ... -/`) and attributes
 * (`@[...]`) written just before them: what a reader of the file sees as the declaration.
 */
export function excerpt(text: string, line: number, endLine: number): Line[] {
  const all = text.split('\n');
  let from = line;
  for (let i = line - 2; i >= 0;) {
    const t = all[i].trimEnd();
    if (t.startsWith('@[')) { from = i + 1; i--; continue; }
    if (!t.endsWith('-/')) break;
    let start = i;
    while (start >= 0 && !all[start].includes('/-')) start--;
    if (start < 0 || !all[start].trimStart().startsWith('/--')) break;
    from = start + 1;
    i = start - 1;
  }
  const out: Line[] = [];
  for (let n = from; n <= endLine; n++) out.push({ number: n, text: (all[n - 1] ?? '').trimEnd() });
  while (out.length && !out[out.length - 1].text) out.pop();
  return out;
}

/** The text of a module comment (`/-! ... -/`) at the start of a file, in paragraphs. */
function about(text: string): string | undefined {
  const m = /^\s*\/-!([\s\S]*?)-\//.exec(text);
  return m ? m[1].trim().split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ')).join('\n\n') : undefined;
}

/** An item of a declaration (`param N : Nat := ...`, `agents := 4`): its value as written, and its line. */
function item(lines: Line[], name: RegExp): { text: string; line: number } | undefined {
  const i = lines.findIndex(l => name.test(l.text));
  if (i < 0) return undefined;
  const indent = (s: string) => s.length - s.trimStart().length;
  const own = indent(lines[i].text);
  const parts = [lines[i].text.slice(lines[i].text.indexOf(':=') + 2).trim()];
  for (let j = i + 1; j < lines.length && lines[j].text.trim() && indent(lines[j].text) > own; j++) parts.push(lines[j].text.trim());
  return { text: parts.join(' ').replace(/\s+--.*$/, ''), line: lines[i].number };
}

export function showType(t: Type): string {
  const inner = (x: Type) => {
    const s = showType(x);
    return /\s/.test(s) && !s.startsWith('{') ? `(${s})` : s;
  };
  switch (t.k) {
    case 'enum': return t.name;
    case 'option': return `Option ${inner(t.of)}`;
    case 'list': return `List ${inner(t.of)}`;
    case 'multiset': return `Multiset ${inner(t.of)}`;
    case 'record': return t.fields.length ? `{ ${t.fields.map(f => `${f.name} : ${showType(f.type)}`).join(', ')} }` : 'Unit';
    case 'fn': return `(${t.params.map(showType).join(', ')}) → ${showType(t.ret)}`;
    default: return t.k === 'pub' ? 'Pub' : t.k[0].toUpperCase() + t.k.slice(1);
  }
}

function showValue(v: Json, t?: Type): string {
  if (t?.k === 'enum' && typeof v === 'string') return `.${v}`;
  return JSON.stringify(v);
}

/** The adversary's choice sites in expressions: `choose` names each one. */
function choices(...exprs: (Expr | Expr[] | undefined)[]): string[] {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const o = x as Record<string, unknown>;
    if (o.e === 'choose') out.add(o.site as string);
    for (const [k, v] of Object.entries(o)) if (k !== 'type') walk(v);
  };
  exprs.forEach(walk);
  return [...out];
}

const componentName = (c: Component) =>
  c.args && Object.keys(c.args).length
    ? `${c.name} (${Object.entries(c.args).map(([k, v]) => `${k} := ${showValue(v, c.params?.find(p => p.name === k)?.type)}`).join(', ')})`
    : c.name;

const GOALS = {
  eventually: {
    formula: '◇ success',
    text: 'every execution eventually reaches a configuration with verdict success, and none reaches failure',
  },
  eventuallyAlways: {
    formula: '◇□ success',
    text: 'every execution eventually stays forever in configurations with verdict success, and none reaches failure',
  },
  safety: { formula: '□ ¬failure', text: 'no execution reaches a configuration with verdict failure' },
} as const;

const HOOKS = ['beforeLook', 'beforeMove', 'afterMove'] as const;
/** Above this many definitions, the algorithm's facts give their number rather than their names. */
const MANY_DEFS = 6;

/** Counts the settings of `check-all`, up to `cap`. */
function countSettings(settings: () => Iterable<unknown>, cap = 10_000): string {
  let n = 0;
  try {
    for (const _ of settings()) if (++n >= cap) return `more than ${cap}`;
  } catch {
    return 'unknown (a domain cannot be enumerated)';
  }
  return String(n);
}

/** The source line of each program-counter value, from the lowered algorithm's line table. */
function lineTable(exp: Experiment): Record<string, number> {
  const l = exp.algorithm.line;
  if (l?.e !== 'match') return {};
  return Object.fromEntries(Object.entries(l.cases).flatMap(([pc, e]) => e.e === 'lit' && typeof e.value === 'number' ? [[pc, e.value]] : []));
}

export function describeExperiment(exp: Experiment, sources: Record<string, string>, revision?: string, lean?: SimLean, checkSettings?: () => Iterable<unknown>): ModelDescription {
  const { model, algorithm, task } = exp;
  const key = (kind: string, name: string) => `${kind} ${name}`;

  // The declarations as written. Without recorded uses (IR built otherwise), the algorithm alone.
  const uses = exp.source?.uses ?? (algorithm.source ? [{ kind: 'algorithm' as const, name: algorithm.name, ...algorithm.source }] : []);
  const excerpts: SourceExcerpt[] = uses
    .filter(u => sources[u.file] !== undefined)
    .map(u => ({ kind: u.kind, name: u.name, file: u.file, lines: excerpt(sources[u.file], u.line, u.endLine) }));
  const expLines = excerpts.find(s => s.kind === 'experiment')?.lines ?? [];
  /** A declaration shown, by kind and name (a component's declaration is `Hazards.BlackHole`, its IR name `BlackHole`). */
  const shown = (kind: string, name: string) => excerpts.find(s => s.kind === kind && (s.name === name || s.name.split('.').pop() === name));
  const refTo = (kind: string, name: string, line?: number): SourceRef[] => {
    const s = shown(kind, name);
    return s ? [{ source: key(s.kind, s.name), ...(line !== undefined ? { line } : {}) }] : [];
  };
  const expItem = (name: RegExp) => item(expLines, name);
  const expRef = (i?: { line: number }) => refTo('experiment', exp.name, i?.line);
  /** Where a field of the model is set: the first model definition of the chain that sets it, or the model itself. */
  const modelRef = (field: string): SourceRef[] => {
    const models = excerpts.filter(s => s.kind === 'model');
    for (const m of models) {
      const i = item(m.lines, new RegExp(`^\\s+${field}\\s*:=`));
      if (i) return [{ source: key(m.kind, m.name), line: i.line }];
    }
    return models.slice(0, 1).map(m => ({ source: key(m.kind, m.name) }));
  };

  const sensors = [
    ...model.sensors.map(s => ({ s, owner: undefined as string | undefined })),
    ...model.components.flatMap(c => (c.sensors ?? []).map(s => ({ s, owner: c.name }))),
  ];
  const actions = model.components.flatMap(c => c.actions ?? []);
  const flags = model.components.flatMap(c => c.flags ?? []);
  const size = model.topology.size.e === 'param' ? model.topology.size.name : 'the size expression';
  const group = derivedGroup(exp);
  const symmetry = group.rotations ? (group.reflections ? 'rotations and reflections' : 'rotations') : 'none';

  const frame = {
    common: { value: 'Common chirality', note: 'All agents share the orientation of the ring: a local cw is the same direction for every agent.' },
    dynamicReflection: { value: 'Chosen at each activation', note: "The adversary chooses, at each activation, whether the agent's view is mirrored." },
    persistent: { value: 'Fixed per agent', note: "Each agent's orientation is chosen at initialisation and kept for the whole execution." },
  }[model.frame.kind];

  const modelFacts: ModelFact[] = [
    {
      label: 'Topology',
      value: model.topology.kind === 'ring' ? `Ring of ${size} nodes` : `Dynamic ring of ${size} nodes`,
      note: model.topology.kind === 'ring'
        ? 'Every edge is present in every round.'
        : `In every round, the adversary removes up to ${model.topology.k} edge${model.topology.k === 1 ? '' : 's'}; missing edges are chosen anew each round and forgotten afterwards.`,
      refs: modelRef('topology'),
    },
    {
      label: 'Synchrony',
      value: model.round === 'fsync' ? 'FSYNC (fully synchronous)' : model.round === 'sequential' ? 'Sequential (fair)' : 'SSYNC (semi-synchronous)',
      note: model.round === 'fsync'
        ? 'Every agent able to act is activated in every round.'
        : (model.round === 'sequential'
          ? 'In every round, the adversary activates exactly one agent able to act (or none if no agent can act). '
          : 'In every round, the adversary activates a nonempty set of the agents able to act. ')
          + 'Only fair executions count: every agent that keeps acting is activated infinitely often.',
      refs: modelRef('round'),
    },
    {
      label: 'Memory',
      value: model.memory === 'persistent' ? 'Persistent' : 'Oblivious',
      note: model.memory === 'persistent'
        ? 'Agents keep a program counter and their local values between activations.'
        : 'No program counter or local value is kept between activations; storage supplied by components (read by sensors, written by actions) is separate.',
      refs: modelRef('memory'),
    },
    { label: 'Orientation', value: frame.value, note: frame.note + (model.frame.kind === 'persistent' ? ` (agent field ${model.frame.field})` : ''), refs: modelRef('frame') },
    { label: 'Movement', value: 'Rigid', note: 'A move follows the edge to the adjacent node within the round, when that edge is present.' },
    {
      label: 'Sensors',
      value: sensors.length ? sensors.map(x => x.s.name).join(', ') : 'none',
      note: 'What algorithms can know of the configuration: each activated agent evaluates each sensor once per activation.',
      details: sensors.map(({ s, owner }) =>
        `${s.name} : ${showType(s.type)}${owner ? ` (from ${owner})` : ''}${algorithm.uses.includes(s.name) ? '' : ' — not used by the algorithm'}`),
      refs: [...modelRef('sensors'), ...sensors.flatMap(x => refTo('sensor', x.s.name))],
    },
  ];

  const componentFacts: ModelFact[] = model.components.map(c => {
    const details: string[] = [];
    if (c.world?.length) details.push(`world: ${c.world.map(f => `${f.name} : ${showType(f.type)}`).join(', ')}`);
    if (c.agent?.length) details.push(`per agent: ${c.agent.map(f => `${f.name} : ${showType(f.type)}`).join(', ')}`);
    for (const f of c.flags ?? []) {
      details.push(`flag ${f.name}: ${f.visibility === 'hidden' ? 'the agent disappears from every sensor' : 'visible'}, ${f.acts === 'never' ? 'it no longer decides or moves' : 'the adversary decides its moves'}`);
    }
    for (const a of c.actions ?? []) details.push(`action ${a.name} : ${showType(a.type)} (default ${showValue(a.default, a.type)})`);
    const hooks = HOOKS.filter(h => c[h]);
    if (hooks.length) details.push(`acts in ${hooks.join(', ')}`);
    const chosen = choices(c.init?.world && Object.values(c.init.world), c.init?.agent && Object.values(c.init.agent), ...HOOKS.map(h => c[h]));
    if (chosen.length) details.push(`adversary chooses: ${chosen.join(', ')}`);
    return { label: c.name, value: componentName(c), details, refs: refTo('component', c.name) };
  });

  const params = exp.params.map(p => {
    const i = expItem(new RegExp(`^\\s+param\\s+${p.name}\\b`));
    return {
      label: `param ${p.name}`,
      value: p.domain || p.accepts ? i?.text ?? 'a domain' : `all values of ${showType(p.type)}`,
      code: !!p.domain || !!p.accepts,
      note: `of type ${showType(p.type)}${p.accepts ? '; where restricts the domain' : ''}`,
      refs: expRef(i),
    };
  });
  const agents = expItem(/^\s+agents\b/);
  const position = expItem(/^\s+position\b/);
  const limits = expItem(/^\s+limits\b/);

  const sections: ModelDescription['sections'] = [
    {
      title: 'Experiment',
      facts: [
        { label: 'Agents', value: agents?.text ?? 'see the experiment', code: true, refs: expRef(agents) },
        { label: 'Positions', value: position?.text ?? 'see the experiment', code: true, note: 'Initial position of agent i.', refs: expRef(position) },
        ...params,
        { label: 'Settings checked', value: countSettings(checkSettings ?? (() => parameterValues(exp))), note: checkSettings ? 'Finite settings supplied by project.ts, filtered through the model domains.' : 'Parameter values enumerated by check-all, from the domains above.' },
        {
          label: 'Limits',
          value: exp.limits ? Object.entries(exp.limits).map(([k, v]) => `${k} ${v}`).join(', ') : 'none',
          note: exp.limits ? 'A check that reaches a limit is incomplete unless it found a counterexample.' : 'Checks explore every reachable configuration.',
          refs: exp.limits ? expRef(limits) : [],
        },
      ],
    },
    { title: `Model ${model.name}`, facts: modelFacts },
    ...(componentFacts.length ? [{ title: 'Components', facts: componentFacts }] : []),
    {
      title: 'Algorithm',
      facts: [
        { label: 'Name', value: algorithm.name, note: algorithm.native ? `native TypeScript step ${algorithm.native}` : undefined, refs: refTo('algorithm', algorithm.name) },
        { label: 'Reads', value: algorithm.uses.length ? algorithm.uses.join(', ') : 'no sensor' },
        { label: 'Public state', value: showType(algorithm.pub), code: true, note: 'Visible to other agents through sensors.' },
        {
          label: 'Memory',
          value: showType(algorithm.mem),
          code: true,
          note: algorithm.source?.calls !== undefined || algorithm.mem.k === 'record' ? 'Derived from the algorithm: its program counter and the locals kept across activations.' : undefined,
        },
        // A few definitions by name; many, by number (they are listed, folded, beside the declarations).
        ...(algorithm.defs?.length ? [algorithm.defs.length <= MANY_DEFS
          ? { label: 'Definitions', value: algorithm.defs.map(d => d.name).join(', '), refs: algorithm.defs.flatMap(d => refTo('definition', d.name)) }
          : { label: 'Definitions', value: `${algorithm.defs.length} definitions`, note: 'Listed under Definitions, beside the declarations; a click on a name in the algorithm opens its definition.' }] : []),
      ],
    },
    {
      title: 'Task',
      facts: [
        { label: 'Verdict', value: task.name, note: 'Each configuration is judged success, failure or not yet.', refs: refTo('task', task.name) },
        {
          label: 'Goal',
          value: GOALS[task.goal].formula,
          note: `${model.round !== 'fsync' ? 'Over every fair execution' : 'Over every execution'}: ${GOALS[task.goal].text}.`,
          refs: refTo('goal', task.name),
        },
        {
          label: 'Adversary',
          value: 'Unrestricted',
          note: 'No fairness assumption forces an adversary choice (a hazard to appear, a missing edge to return)'
            + (model.round !== 'fsync' ? ', apart from fair activation.' : '.'),
        },
      ],
    },
    {
      title: 'Symmetry reduction',
      facts: [{
        label: 'Up to',
        value: symmetry,
        note: model.symmetries === 'none'
          ? 'Disabled by the model (symmetries := none).'
          : 'Configurations equal up to these automorphisms are merged. Derived from the equivariance declarations of the components, sensors and task.',
        details: group.reasons,
      }],
    },
  ];

  const initChoices = choices(exp.agents.count, exp.agents.pos, ...model.components.flatMap(c => [
    ...Object.values(c.init?.world ?? {}), ...Object.values(c.init?.agent ?? {}),
  ]));
  const acting = (h: typeof HOOKS[number]) => model.components.filter(c => c[h]).map(c => c.name);
  /** A hook phase: what it does, or that no component acts in it. */
  const hook = (h: typeof HOOKS[number], what: string) =>
    ({ phase: h, what: acting(h).length ? what : 'No component acts in this phase.', by: acting(h), choices: hookChoices(h) });
  const hookChoices = (h: typeof HOOKS[number]) => choices(...model.components.map(c => c[h]));
  const adversaryFlags = flags.filter(f => f.acts === 'adversary').map(f => f.name);
  const round: ModelDescription['round'] = [
    {
      phase: 'Initialisation',
      what: 'Once: the agents are placed and the components set their initial values from the parameters.',
      ...(model.components.some(c => c.init) ? { by: model.components.filter(c => c.init).map(c => c.name) } : {}),
      choices: initChoices,
    },
    {
      phase: 'Topology',
      what: model.topology.kind === 'ring' ? 'Every edge is present.' : `The adversary removes up to ${model.topology.k} edge${model.topology.k === 1 ? '' : 's'} for this round.`,
      choices: model.topology.kind === 'dynamicRing' ? ['missing edges'] : [],
    },
    hook('beforeLook', 'Components update their state, all reading the same configuration.'),
    {
      phase: 'Activation',
      what: (model.round === 'fsync' ? 'Every agent able to act is activated.'
        : model.round === 'sequential' ? 'Exactly one agent able to act is activated (none if no agent can act).'
          : 'A nonempty set of the agents able to act is activated.')
        + (model.frame.kind === 'dynamicReflection' ? " Each activated agent's orientation is chosen." : ''),
      choices: [
        ...(model.round !== 'fsync' ? ['activated agents (fair)'] : []),
        ...(model.frame.kind === 'dynamicReflection' ? ['orientations'] : []),
      ],
    },
    {
      phase: 'Look & Compute',
      what: `Each activated agent evaluates ${algorithm.uses.length ? algorithm.uses.join(', ') : 'its sensors'} once, then ${algorithm.name} decides its move${actions.length ? ` and actions (${actions.map(a => a.name).join(', ')})` : ''}.`
        + (adversaryFlags.length ? ` The adversary decides for agents flagged ${adversaryFlags.join(', ')}.` : ''),
      choices: [...choices(...sensors.map(x => x.s.body)), ...(adversaryFlags.length ? ['moves of agents flagged ' + adversaryFlags.join(', ')] : [])],
    },
    hook('beforeMove', 'Components read the decisions and update their state.'),
    { phase: 'Move', what: 'Agents that decided and still act move, rigidly, along present edges.' },
    hook('afterMove', 'Components update their state after the moves.'),
  ];

  // What each region of the Lean model translates, and where that is written.
  const pcLines = lineTable(exp);
  const origin = (o: LeanOrigin): { label: string; refs: SourceRef[] } => {
    switch (o.kind) {
      case 'composition': return { label: 'composition of the components', refs: modelRef('components') };
      case 'model': return { label: `model ${model.name}`, refs: modelRef('topology') };
      case 'component': return { label: `component ${o.name}`, refs: refTo('component', o.name!) };
      case 'sensor': return { label: `sensor ${o.name}`, refs: refTo('sensor', o.name!) };
      case 'definition': return { label: `definition ${o.name}`, refs: refTo('definition', o.name!) };
      case 'task': return { label: `task ${task.name}`, refs: refTo('task', task.name) };
      case 'goal': return { label: `goal ${GOALS[task.goal].formula}`, refs: refTo('goal', task.name) };
      case 'param': return { label: `param ${o.name}`, refs: expRef(expItem(new RegExp(`^\\s+param\\s+${o.name}\\b`))) };
      case 'experiment': return o.name
        ? { label: o.name === 'agents' ? 'number of agents' : 'initial configurations', refs: expRef(expItem(new RegExp(`^\\s+${o.name}\\b`))) }
        : { label: 'statements to prove', refs: [...expRef(), ...refTo('goal', task.name)] };
      case 'algorithm': {
        if (o.pc === undefined) return { label: o.name === 'line' ? 'line table (display only)' : `algorithm ${algorithm.name}`, refs: refTo('algorithm', algorithm.name) };
        const line = pcLines[o.pc];
        return { label: o.pc === 'start' ? 'start of main' : `resumes after line ${line}`, refs: refTo('algorithm', algorithm.name, line) };
      }
    }
  };
  const leanDescription: LeanDescription | undefined = !lean ? undefined : 'error' in lean ? lean : {
    module: lean.module,
    text: lean.text,
    blocks: lean.regions.map(r => ({ line: r.line, endLine: r.endLine, ...origin(r.origin) })),
    library: lean.library.map(l => ({ module: l.module, text: l.text, refs: refTo('component', l.component) })),
  };

  const caveats = [
    checkSettings
      ? 'Checks are bounded: they cover the finite settings supplied by project.ts, not every admissible parameter value.'
      : 'Checks are bounded: they cover the settings enumerated from the parameter domains, not every ring size.',
    ...(exp.limits ? ['Exploration limits can leave a check incomplete.'] : []),
    ...(algorithm.native ? [`The algorithm's step is native TypeScript (${algorithm.native}): it is not written in .sim and is not translated to Lean.`] : []),
    ...(group.rotations ? ['Symmetry reduction relies on equivariance declarations, which are claims tested on bounded instances.'] : []),
  ];

  const expFile = exp.source?.file ?? algorithm.source?.file;
  return {
    experiment: exp.name,
    about: expFile && sources[expFile] !== undefined ? about(sources[expFile]) : undefined,
    summary: [
      model.topology.kind === 'ring' ? 'ring' : `dynamic ring (${model.topology.k})`,
      model.round.toUpperCase(),
      model.memory === 'persistent' ? 'persistent memory' : 'oblivious',
      model.frame.kind === 'common' ? 'common chirality' : model.frame.kind === 'dynamicReflection' ? 'dynamic orientation' : 'fixed orientation',
      sensors.length ? `${sensors.length === 1 ? 'sensor' : 'sensors'}: ${sensors.map(x => x.s.name).join(', ')}` : 'no sensor',
      ...model.components.map(componentName),
      `${task.name}: ${GOALS[task.goal].formula}`,
    ],
    sections,
    round,
    sources: excerpts,
    caveats,
    ir: exp,
    lean: leanDescription,
    revision,
  };
}
