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
  /** Components of each `List Component` model argument. */
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
  | { kind: 'nat' }
  | { kind: 'bool' }
  | { kind: 'text' };

/** Model-level built-ins (implemented by the semantic core, not by `.sim` sources). */
export const builtinOptions: Record<string, Option[]> = {
  Topology: [
    { value: 'Ring', label: 'Ring', detail: 'A static ring of the experiment size N.' },
    { value: 'DynamicRing 1', label: 'DynamicRing 1', detail: 'At most one edge is absent each round, chosen by the adversary.' },
    { value: 'DynamicRing 2', label: 'DynamicRing 2', detail: 'At most two edges are absent each round.' },
  ],
  Round: [
    { value: '.fsync', label: 'FSYNC', detail: 'Every agent is activated in every round.' },
    { value: '.ssync', label: 'SSYNC', detail: 'A fair nonempty subset of agents is activated each round.' },
    { value: '.sequential', label: 'Sequential', detail: 'One agent at a time, fairly.' },
  ],
  Symmetries: [
    { value: '.derived', label: 'Derived', detail: 'Reduce the state space by the symmetries the pieces declare.' },
    { value: '.none', label: 'None', detail: 'Explore without symmetry reduction.' },
  ],
};

export const frameOptions: Option[] = [
  { value: 'Frames.common', label: 'Common', detail: 'All agents share chirality.' },
  { value: 'Frames.dynamicReflection', label: 'Dynamic reflection', detail: 'The adversary chooses each activated agent’s orientation.' },
];

/** Algorithm outputs and public fields read by library tasks, with their types and initial values. */
export const outputTypes: Record<string, { type: string; init: string }> = {
  bh: { type: 'Option Move', init: 'none' },
  claim: { type: 'Option Move', init: 'none' },
  claimDir: { type: 'Option Move', init: 'none' },
  claimSteps: { type: 'Nat', init: '0' },
};

export const byName = (lib: Library, name: string) => lib.entries.find((e) => e.name === name);
const head = (value: string) => value.trim().split(/\s+/)[0];

export const models = (lib: Library) => lib.entries.filter((e) => e.kind === 'model');
export const tasks = (lib: Library) => lib.entries.filter((e) => e.kind === 'task');
export const components = (lib: Library) => lib.entries.filter((e) => e.kind === 'component');

/** Sensors usable as a model's view: library sensors not owned by a component. */
export function viewSensors(lib: Library): Entry[] {
  const owners = components(lib).map((c) => `${c.name}.`);
  return lib.entries.filter((e) => e.kind === 'sensor' && !owners.some((o) => e.name.startsWith(o)));
}

/** Value parameters of a sensor, before the configuration it observes. */
export const sensorArgs = (sensor: Entry): Param[] => sensor.params.slice(0, sensor.params.findIndex((p) => p.type === 'Config'));

export function widget(lib: Library, type: string, draft?: Draft): Widget {
  const inductive = lib.entries.find((e) => e.kind === 'type' && e.name === type && e.ctors);
  if (inductive) return { kind: 'select', options: inductive.ctors!.map((c) => ({ value: `.${c}`, label: `.${c}` })) };
  if (type === 'List Component') return { kind: 'components' };
  if (type === 'Sensor') return { kind: 'sensor', options: viewSensors(lib) };
  if (type === 'FrameModel') {
    const persistent = draft ? selectedComponents(lib, draft).flatMap((c) => byName(lib, c)?.agent?.filter((f) => f.type === 'Frame') ?? []) : [];
    return {
      kind: 'select',
      options: [
        ...frameOptions,
        ...persistent.map((f) => ({ value: `Frames.persistent ${f.name}`, label: `Persistent (${f.name})`, detail: 'Each agent keeps the orientation stored in this field.' })),
      ],
    };
  }
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

export function useOf(lib: Library, entry: Entry): Use {
  return { name: entry.name, args: entry.params.map((p) => initialValue(lib, p)) };
}

export function newDraft(lib: Library, model = models(lib)[0]?.name ?? ''): Draft {
  const family = byName(lib, model);
  const args: Draft['args'] = {};
  const lists: Draft['lists'] = {};
  for (const p of family?.params ?? []) {
    if (p.type === 'List Component') lists[p.name] = [];
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
export const useText = (use: Use) => [use.name, ...use.args.map(wrap)].join(' ');

/** Components the model contains: the family's own and the chosen ones. */
export function selectedComponents(lib: Library, draft: Draft): string[] {
  const family = byName(lib, draft.model);
  const own = (family?.includes ?? []).filter((n) => byName(lib, n)?.kind === 'component');
  return [...new Set([...own, ...Object.values(draft.lists).flat().map((u) => u.name)])];
}

/** Sensors chosen as model arguments (by the name algorithms use). */
function chosenSensors(lib: Library, draft: Draft): Entry[] {
  const family = byName(lib, draft.model);
  return (family?.params ?? [])
    .filter((p) => p.type === 'Sensor')
    .flatMap((p) => byName(lib, head(draft.args[p.name] ?? '')) ?? []);
}

export function modelText(lib: Library, draft: Draft): string {
  const family = byName(lib, draft.model);
  if (!family) return draft.model;
  const positional: string[] = [];
  const named: string[] = [];
  for (const p of family.params) {
    const value = p.type === 'List Component'
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

/** Uses of components that are no longer declared, such as a deleted custom one. */
export const undeclared = (lib: Library, uses: Use[]) => uses.filter((u) => byName(lib, u.name)?.kind !== 'component');

export type Analysis = {
  params: (Field & { domain: string })[];
  components: string[];
  warnings: Warning[];
  /** Public fields and outputs the task reads. */
  pub: Field[];
  outputs: string[];
  actions: string[];
};

export function defaultDomain(field: Field): string {
  if (field.name === 'N') return '(range 9).filter (· ≥ 3)';
  if (field.type === 'Node') return '(range N).map node';
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
  for (const sensor of chosenSensors(lib, draft)) need(sensor.name, sensor.requires);
  const task = byName(lib, draft.task);
  need(draft.task, task?.requires);

  const fields: Field[] = [{ name: 'N', type: 'Nat' }];
  for (const name of selected) {
    for (const read of byName(lib, name)?.reads ?? []) {
      if (!fields.some((f) => f.name === read.name)) fields.push(read);
    }
  }
  const params = fields.map((f) => ({ ...f, domain: draft.domains[f.name] ?? defaultDomain(f) }));

  const pub: Field[] = [];
  const outputs: string[] = [];
  for (const output of task?.outputs ?? []) {
    const name = output.replace(/^pub\./, '');
    if (!output.startsWith('pub.')) outputs.push(name);
    if (!pub.some((f) => f.name === name)) pub.push({ name, type: outputTypes[name]?.type ?? 'Option Move' });
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
    ...analyze(lib, draft).actions.map((action) => `-- move .cw with { ${action.split(' ')[0]} := ... }   (${action})`),
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
    `import "std/tasks.sim"`,
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
    `  position i := ${draft.placement === 'same' ? 'node 0' : 'node i'}`,
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
    : chosenSensors(lib, draft).map((s) => ({ name: s.implements ?? s.name }));
  const { text, regions } = layout(lib, draft, sensors);
  const compiled = compileText(text, sources);
  return { text, regions, skeleton: skeleton(lib, draft, sensors), compiled, experiment: compiled.experiments[draft.experiment] };
}
