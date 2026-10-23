/**
 * The model builder: a draft experiment assembled from standard-library pieces,
 * written out as a `.sim` file. The form is derived from the library's own
 * signatures; only the built-in model-level constructors are listed here.
 * The user's own declarations (custom components, sensors, tasks, helpers) and the
 * algorithm's items are written in the page and inserted into the file.
 */
import { showType } from '../../../packages/lang/src/types';
import type { Experiment } from '../../../packages/lang/src/ir';
import { compileText, ENTRY, type Compiled, type SiteDiagnostic } from './compile';
import { parse, ParseError } from '../../../packages/lang/src/parse/parser';
import { readLibrary, type Entry, type Field, type Library, type Param } from './stdlib';

export type Use = { name: string; args: string[] };

export type Draft = {
  model: string;
  /** Source text of each scalar model argument, by parameter name. */
  args: Record<string, string>;
  /** Components of each `List Component` model argument, and sensors of each `List Sensor` one. */
  lists: Record<string, Use[]>;
  task: string;
  agents: string;
  placement: 'same' | 'spread';
  /** The `in` clause of each experiment parameter; empty for none. */
  domains: Record<string, string>;
  experiment: string;
  algorithm: string;
  /** The user's own declarations, inserted after the imports. */
  custom: string;
  /**
   * The algorithm's items after the generated ones (procedures and `main`), written at
   * column 0; absent for the skeleton. `Pub :=`, `init` or `output x` here replace the
   * generated item.
   */
  body?: string;
};

export type Option = { value: string; label: string; detail?: string };

export type Widget =
  | { kind: 'select'; options: Option[] }
  | { kind: 'sensor'; options: Entry[] }
  | { kind: 'components' }
  | { kind: 'sensors' }
  | { kind: 'nat' }
  | { kind: 'bool' }
  | { kind: 'text' };

/** Model-level built-ins (implemented by the semantic core, not by `.sim` sources). */
export const builtinOptions: Record<string, Option[]> = {
  Observation: [
    { value: 'Observe.radius 1', label: 'Radius 1', detail: 'An agent sees its position and its neighbors.' },
    { value: 'Observe.radius 2', label: 'Radius 2', detail: 'The positions at most two hops away, and the edges between them that it can explore.' },
    { value: 'Observe.full', label: 'Full', detail: 'Every position and edge (finite spaces).' },
  ],
  Frames: [
    { value: 'Frames.identity', label: 'Identity', detail: 'The ports as they are: on a cycle, a common sense of direction.' },
    { value: 'Frames.isomorphisms', label: 'Isomorphisms', detail: 'The adversary presents the view through any of its symmetries, at each Look.' },
    { value: 'Frames.portPermutations .perRobot', label: 'Own port numbering', detail: 'Each robot keeps its own numbering of the ports, chosen by the adversary.' },
    { value: 'Frames.portPermutations .perLook', label: 'Port numbering per Look', detail: 'The adversary renumbers the ports at each Look.' },
  ],
  Memory: [
    { value: '.oblivious', label: 'Oblivious', detail: 'Robots keep nothing between activations.' },
    { value: '.persistent', label: 'Persistent', detail: 'Robots keep a program counter and their locals.' },
  ],
  Movement: [
    { value: '.alongEdges', label: 'Along edges', detail: 'An agent moves to its position or a neighbor.' },
  ],
  Fairness: [
    { value: '.activation', label: 'Activation', detail: 'Only executions in which every agent that keeps acting takes events infinitely often.' },
    { value: '.none', label: 'None', detail: 'Every execution the scheduler allows.' },
  ],
  Instant: [
    { value: '.look', label: 'Look', detail: 'The snapshot, and the decision computed from it, which stays pending.' },
    { value: '.compute', label: 'Compute', detail: 'The decision’s public state, memory, light and pebbles take effect.' },
    { value: '.move', label: 'Move', detail: 'The agent moves to the decision’s target.' },
  ],
  Symmetries: [
    { value: '.derived', label: 'Derived', detail: 'Reduce the state space by the symmetries the pieces declare.' },
    { value: '.none', label: 'None', detail: 'Explore without symmetry reduction.' },
  ],
};

/** Algorithm outputs and public fields read by library tasks, with their types and initial values. */
export const outputTypes: Record<string, { type: string; init: string }> = {
  bh: { type: 'Option Nat', init: 'none' },
  claim: { type: 'Option Nat', init: 'none' },
  claimPort: { type: 'Option Nat', init: 'none' },
  claimSteps: { type: 'Nat', init: '0' },
};

export const byName = (lib: Library, name: string) => lib.entries.find((e) => e.name === name);
const head = (value: string) => value.trim().split(/\s+/)[0];

export const models = (lib: Library) => lib.entries.filter((e) => e.kind === 'model');
export const tasks = (lib: Library) => lib.entries.filter((e) => e.kind === 'task');
export const components = (lib: Library) => lib.entries.filter((e) => e.kind === 'component');
export const spaces = (lib: Library) => lib.entries.filter((e) => e.kind === 'space');

/** A space as a model argument: its parameters of type `Nat` are the experiment's size `N`. */
const spaceUse = (space: Entry) => [space.name, ...space.params.map((p) => (p.type === 'Nat' ? 'N' : '_'))].join(' ');

/** Library spaces, and a dynamic cycle. */
export function spaceOptions(lib: Library): Option[] {
  const options = spaces(lib).map((s) => ({ value: spaceUse(s), label: spaceUse(s), detail: s.doc?.split('\n')[0] }));
  const cycle = options.find((o) => o.value.startsWith('Graphs.Cycle'));
  return cycle
    ? [...options, { value: `Graphs.Dynamic (${cycle.value}) 1`, label: `Graphs.Dynamic (${cycle.value}) 1`, detail: 'The cycle, where the adversary removes at most one edge each step.' }]
    : options;
}

/**
 * Library schedulers, with arguments: `Schedulers.Bounded 2`, and the asynchronous cuts of the
 * cycle (ASYNC by default, LC-atomic, CM-atomic).
 */
export function schedulerOptions(lib: Library): Option[] {
  const first = (e: Entry) => e.doc?.split('\n')[0];
  return lib.entries.filter((e) => e.kind === 'scheduler').flatMap((s) => {
    const args = s.params.filter((p) => p.default === undefined).map((p) => (p.type === 'Nat' ? '2' : '_'));
    const value = [s.name, ...args].join(' ');
    if (s.name !== 'Schedulers.Async') return [{ value, label: value, detail: first(s) }];
    return [
      { value, label: 'Schedulers.Async (ASYNC)', detail: first(s) },
      { value: `${s.name} [[.look, .compute], [.move]]`, label: 'Schedulers.Async (LC-atomic)', detail: 'Look and Compute together, then Move.' },
      { value: `${s.name} [[.look], [.compute, .move]]`, label: 'Schedulers.Async (CM-atomic)', detail: 'Look, then Compute and Move together.' },
    ];
  });
}

/** Whether the draft's space is infinite (its positions are integers, without a finite list). */
export const infiniteSpace = (lib: Library, draft: Draft) =>
  Object.values(draft.args).some((value) => /^\(?Graphs\.Line\b/.test(value.trim()));

/** Sensors usable as a model's view: library sensors not owned by a component. */
export function viewSensors(lib: Library): Entry[] {
  const owners = components(lib).map((c) => `${c.name}.`);
  return lib.entries.filter((e) => e.kind === 'sensor' && !owners.some((o) => e.name.startsWith(o)));
}

/** Value parameters of a sensor, before the Look it observes. */
export const sensorArgs = (sensor: Entry): Param[] => sensor.params.slice(0, sensor.params.findIndex((p) => p.type === 'Look'));

export function widget(lib: Library, type: string, draft?: Draft): Widget {
  const inductive = lib.entries.find((e) => e.kind === 'type' && e.name === type && e.ctors);
  if (inductive) return { kind: 'select', options: inductive.ctors!.map((c) => ({ value: `.${c}`, label: `.${c}` })) };
  if (type === 'List Component') return { kind: 'components' };
  if (type === 'List Sensor') return { kind: 'sensors' };
  if (type === 'Sensor') return { kind: 'sensor', options: viewSensors(lib) };
  if (type === 'Space') return { kind: 'select', options: spaceOptions(lib) };
  if (type === 'Scheduler') return { kind: 'select', options: schedulerOptions(lib) };
  if (builtinOptions[type]) return { kind: 'select', options: builtinOptions[type] };
  if (type === 'Nat') return { kind: 'nat' };
  if (type === 'Bool') return { kind: 'bool' };
  return { kind: 'text' };
}

/** The value a fresh argument starts with: its declared default, or the first option. */
export function initialValue(lib: Library, param: Param): string {
  if (param.default !== undefined) return param.default;
  const w = widget(lib, param.type);
  if (w.kind === 'select') return w.options[0]?.value ?? '';
  if (w.kind === 'sensor') return w.options[0]?.name ?? '';
  if (w.kind === 'nat') return '1';
  if (w.kind === 'bool') return 'false';
  return '';
}

/** A fresh use of a component or sensor; a sensor's arguments are those before its Look. */
export function useOf(lib: Library, entry: Entry): Use {
  const params = entry.kind === 'sensor' ? sensorArgs(entry) : entry.params;
  return { name: entry.name, args: params.map((p) => initialValue(lib, p)) };
}

export function newDraft(lib: Library, model = models(lib)[0]?.name ?? ''): Draft {
  const family = byName(lib, model);
  const args: Draft['args'] = {};
  const lists: Draft['lists'] = {};
  for (const p of family?.params ?? []) {
    if (p.type === 'List Component') lists[p.name] = [];
    // A model sees something by default: the first view sensor (whether a location is occupied).
    else if (p.type === 'List Sensor') lists[p.name] = viewSensors(lib).slice(0, 1).map((s) => useOf(lib, s));
    else args[p.name] = initialValue(lib, p);
  }
  const task = tasks(lib).find((t) => (t.requires ?? []).every((c) => family?.includes?.includes(c))) ?? tasks(lib)[0];
  return { model, args, lists, task: task?.name ?? '', agents: '2', placement: 'same', domains: {}, experiment: 'myExperiment', algorithm: 'MyAlgorithm', custom: '' };
}

/** Whether a declaration comes from the user's code rather than the library. */
export const isCustom = (entry: Entry) => entry.module === ENTRY;

/**
 * The library together with the user's declarations, read like the library's own
 * sources, so their pieces join the pickers. Undefined while the text does not parse.
 */
export function withCustom(librarySources: Record<string, string>, custom: string): Library | undefined {
  try {
    return readLibrary(custom.trim() ? { ...librarySources, [ENTRY]: custom } : librarySources);
  } catch {
    return undefined;
  }
}

const wrap = (value: string) => (/\s/.test(value.trim()) && !/^[[({]/.test(value.trim()) ? `(${value.trim()})` : value.trim());
export const useText = (use: Use) => [use.name, ...use.args.filter((a) => a.trim()).map(wrap)].join(' ');

/** Components the model contains: the family's own and the chosen ones. */
export function selectedComponents(lib: Library, draft: Draft): string[] {
  const family = byName(lib, draft.model);
  const own = (family?.includes ?? []).filter((n) => byName(lib, n)?.kind === 'component');
  return [...new Set([...own, ...Object.values(draft.lists).flat().map((u) => u.name)])];
}

/** Sensors chosen as model arguments (by the name algorithms use). */
function chosenSensors(lib: Library, draft: Draft): Entry[] {
  const family = byName(lib, draft.model);
  return (family?.params ?? []).flatMap((p) =>
    p.type === 'Sensor' ? byName(lib, head(draft.args[p.name] ?? '')) ?? []
      : p.type === 'List Sensor' ? (draft.lists[p.name] ?? []).flatMap((u) => byName(lib, u.name) ?? [])
      : []);
}

export function modelText(lib: Library, draft: Draft): string {
  const family = byName(lib, draft.model);
  if (!family) return draft.model;
  const positional: string[] = [];
  const named: string[] = [];
  for (const p of family.params) {
    const value = p.type === 'List Component' || p.type === 'List Sensor'
      ? `[${(draft.lists[p.name] ?? []).map(useText).join(', ')}]`
      : (draft.args[p.name] ?? '').trim();
    if (p.default === undefined) positional.push(wrap(value || '_'));
    else if (value !== p.default) named.push(`(${p.name} := ${value})`);
  }
  const line = [family.name, ...positional, ...named].join(' ');
  if (line.length <= 72) return line;
  return [[family.name, ...positional].join(' '), ...named.map((n) => `    ${n}`)].join('\n');
}

export type Warning = { message: string; fix?: { list: string; component: string } };

/**
 * The syntax error of the user's declarations read on their own, at its line in their text.
 * In the whole file, an unclosed bracket is only noticed at the generated code that follows.
 */
export function syntaxError(custom: string): { line: number; column: number; message: string } | undefined {
  try {
    parse(custom, ENTRY);
    return undefined;
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    return { line: error.span.start.line, column: error.span.start.col, message: error.message };
  }
}

/** Uses of components or sensors that are no longer declared, such as a deleted custom one. */
export const undeclared = (lib: Library, uses: Use[]) =>
  uses.filter((u) => !['component', 'sensor'].includes(byName(lib, u.name)?.kind ?? ''));

export type Analysis = {
  params: (Field & { domain: string })[];
  components: string[];
  warnings: Warning[];
  /** Public fields and outputs the task reads. */
  pub: Field[];
  outputs: string[];
  actions: string[];
};

export function defaultDomain(field: Field, infinite = false): string {
  if (field.name === 'N') return '(range 9).filter (· ≥ 3)';
  if (field.type === 'Pos') return infinite ? '[pos 1, pos 2]' : '(range N).map pos';
  if (field.type === 'Nat') return '[1, 2]';
  if (field.type === 'Bool') return '[false, true]';
  return '';
}

export function analyze(lib: Library, draft: Draft): Analysis {
  const family = byName(lib, draft.model);
  const selected = selectedComponents(lib, draft);
  const list = family?.params.find((p) => p.type === 'List Component')?.name;
  const warnings: Warning[] = [];
  const need = (who: string, required: string[] | undefined) => {
    for (const component of required ?? []) {
      if (selected.includes(component)) continue;
      warnings.push({ message: `${who} needs the ${component} component.`, ...(list ? { fix: { list, component } } : {}) });
    }
  };
  const provided = new Map<string, string>();
  for (const sensor of chosenSensors(lib, draft)) {
    need(sensor.name, sensor.requires);
    // A variant such as `lossyOccupied` provides the sensor it implements, under that name.
    const name = sensor.implements ?? sensor.name;
    const other = provided.get(name);
    if (other) warnings.push({ message: `${other} and ${sensor.name} both provide the sensor ${name}: keep one of them.` });
    else provided.set(name, sensor.name);
  }
  const task = byName(lib, draft.task);
  need(draft.task, task?.requires);

  // `N` is the size of the space, when the space has one (the line has none).
  const sized = Object.values(draft.args).some((value) => /\bN\b/.test(value));
  const fields: Field[] = sized ? [{ name: 'N', type: 'Nat' }] : [];
  for (const name of selected) {
    for (const read of byName(lib, name)?.reads ?? []) {
      if (!fields.some((f) => f.name === read.name)) fields.push(read);
    }
  }
  const params = fields.map((f) => ({ ...f, domain: draft.domains[f.name] ?? defaultDomain(f, infiniteSpace(lib, draft)) }));

  const pub: Field[] = [];
  const outputs: string[] = [];
  for (const output of task?.outputs ?? []) {
    const name = output.replace(/^pub\./, '');
    if (!output.startsWith('pub.')) outputs.push(name);
    if (!pub.some((f) => f.name === name)) pub.push({ name, type: outputTypes[name]?.type ?? 'Option Nat' });
  }
  const actions = selected.flatMap((c) => byName(lib, c)?.actions ?? []);
  return { params, components: selected, warnings, pub, outputs, actions };
}

/** The sensors an algorithm may use, from a compiled experiment. */
export const modelSensors = (experiment: Experiment) => experiment.model.sensors.map((s) => ({ name: s.name, type: showType(s.type) }));

/** Lines of the file the user wrote: `start` is the file line of their line 1, `indent` the columns added. */
export type Region = { name: 'custom' | 'algorithm'; start: number; lines: number; indent: number };

/** The algorithm items left for the user: a `main` that stays, with what an agent sees and can do. */
export function skeleton(lib: Library, draft: Draft, sensors: { name: string; type?: string }[]): string {
  const hints = [
    ...sensors.map((s) => `-- ${s.name}${s.type ? ` : ${s.type}` : ''}`),
    ...analyze(lib, draft).actions.map((action) => `-- stay with { ${action.split(' ')[0]} := ... }   (${action})`),
  ];
  return [`main :=`, ...(hints.length ? [`  -- What an agent sees and can do:`, ...hints.map((h) => `  ${h}`)] : []), `  stay`].join('\n');
}

const defines = (body: string, item: string) => new RegExp(`^${item}(?![\\w.])`, 'm').test(body);

export function layout(lib: Library, draft: Draft, sensors: { name: string; type?: string }[]): { text: string; regions: Region[] } {
  const a = analyze(lib, draft);
  const body = (draft.body ?? skeleton(lib, draft, sensors)).replace(/\s+$/, '');
  const ownPub = defines(body, 'Pub');
  const pub = ownPub ? [] : a.pub;
  const pubType = `{ ${pub.map((f) => `${f.name} : ${f.type}`).join(', ')} }`;
  const pubInit = `{ ${pub.map((f) => `${f.name} := ${outputTypes[f.name]?.init ?? 'none'}`).join(', ')} }`;
  const uses = sensors.length ? ` uses ${sensors.map((s) => s.name).join(', ')}` : '';
  const header = [
    ...(pub.length ? [`  Pub := ${pubType}`] : []),
    ...a.outputs.filter((o) => !defines(body, `output\\s+${o}`)).map((o) => `  output ${o} := pub.${o}`),
    ...(pub.length && !defines(body, 'init') ? [`  init i := { pub := ${pubInit} }`] : []),
  ];
  const custom = (draft.custom ?? '').replace(/\s+$/, '');

  const lines = [
    `/-! ${draft.experiment}: say which paper, algorithm and model this file encodes. -/`,
    '',
    `import "std/models.sim"`,
    '',
  ];
  const regions: Region[] = [];
  if (custom) {
    regions.push({ name: 'custom', start: lines.length + 1, lines: custom.split('\n').length, indent: 0 });
    lines.push(...custom.split('\n'), '');
  }
  lines.push(`/-- Describe what the agents do. -/`, `algorithm ${draft.algorithm}${uses} where`, ...header, ...(header.length ? [''] : []));
  regions.push({ name: 'algorithm', start: lines.length + 1, lines: body.split('\n').length, indent: 2 });
  lines.push(...body.split('\n').map((l) => (l.trim() ? `  ${l}` : '')), '');

  const model = modelText(lib, draft).split('\n');
  lines.push(
    `experiment ${draft.experiment} where`,
    `  model := ${model[0]}`,
    ...model.slice(1).map((l) => `  ${l}`),
    `  algorithm := ${draft.algorithm}`,
    `  task := ${draft.task}`,
    ...a.params.map((p) => `  param ${p.name} : ${p.type}${p.domain.trim() ? ` in ${p.domain.trim()}` : ''}`),
    `  agents := ${draft.agents.trim() || '1'}`,
    `  position i := ${draft.placement === 'same' ? 'pos 0' : infiniteSpace(lib, draft) ? 'pos (toInt i)' : 'pos i'}`,
    '',
  );
  return { text: lines.join('\n'), regions };
}

export const generate = (lib: Library, draft: Draft, sensors: { name: string; type?: string }[]) => layout(lib, draft, sensors).text;

/** Where a diagnostic of the file falls in the user's text, if it does. */
export function locate(regions: Region[], d: SiteDiagnostic): { region: Region['name']; line: number; column?: number } | undefined {
  if (d.file !== ENTRY || d.line === undefined) return undefined;
  const r = regions.find((r) => d.line! >= r.start && d.line! < r.start + r.lines);
  return r && { region: r.name, line: d.line - r.start + 1, column: d.column === undefined ? undefined : Math.max(1, d.column - r.indent) };
}

export type Built = { text: string; regions: Region[]; skeleton: string; compiled: Compiled; experiment?: Experiment };

/**
 * Generates and compiles a draft. A first compilation, with a skeleton algorithm that uses
 * no sensor, tells which sensors the model provides; the algorithm then uses them all.
 */
export function build(lib: Library, sources: Record<string, string>, draft: Draft): Built {
  const probe = compileText(generate(lib, { ...draft, body: undefined }, []), sources).experiments[draft.experiment];
  const sensors = probe
    ? modelSensors(probe)
    : [...new Set(chosenSensors(lib, draft).map((s) => s.implements ?? s.name))].map((name) => ({ name }));
  const { text, regions } = layout(lib, draft, sensors);
  const compiled = compileText(text, sources);
  return { text, regions, skeleton: skeleton(lib, draft, sensors), compiled, experiment: compiled.experiments[draft.experiment] };
}
