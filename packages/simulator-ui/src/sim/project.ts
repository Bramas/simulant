/**
 * A new-engine experiment as a project of the existing UI (plan, Section
 * 6.5): `SimulatorApp`, `ConfigGraphGenerator` and the CLI use it as they use
 * the current projects. The settings form comes from the experiment's
 * parameters, drawing from the default ring renderer or the project's own
 * `draw`, the algorithm view from the algorithm's source and line table.
 */
import type { Experiment, Type } from '@bramas/simulant-lang/ir';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import { checkFirstBranch, checkSetting, checkSettings, stateGraph, type CheckResult } from '@bramas/simulant-engine/check';
import type { EditorField, EditorSchema } from '@bramas/simulant-core/types/editor-schema';
import type { AlgorithmSource, CheckOptions, ModelDescription, ProjectType, ProjectUpdate } from '@bramas/simulant-core/types/project';
import { formatDiagnostic, type SimDiagnostic, type SimLean } from '@bramas/simulant-vite-plugin/module';
import { isRenderer } from '../renderers/define';
import { agentColor, drawRing, ringLayout } from '../renderers/ring';
import { describeExperiment } from './describe';
import { simExecution } from './execution';
import { Snapshot } from './snapshot';
import type { DrawFunction, Layout, ModelInfo } from './types';

/** What `setup` returns: the running system, and what renderers know of it. */
export type SimModel = { system: System; params: Record<string, unknown>; info: ModelInfo };

/** The parts of a compiled `.sim` module a project needs (see packages/vite-plugin/src/module.ts). */
export type SimSources = {
  experiments: Record<string, Experiment>;
  sources?: Record<string, string>;
  lean?: Record<string, SimLean>;
  diagnostics?: SimDiagnostic[];
  revision?: string;
  subscribe?: (listener: (next: SimSources) => void) => () => void;
};

export type SimProjectOptions = {
  /** A custom renderer; by default, `drawRing`. Returning its layout gives hit testing. */
  draw?: DrawFunction;
  /** How the algorithm view names agents (default `a<id>`). */
  agentName?: (id: number) => string;
  /**
   * Older names of parameters, accepted in settings (shared links, saved settings, the CLI):
   * `{ BH_node: 'site' }` reads `BH_node` as `site` when `site` is not given.
   */
  aliases?: Record<string, string>;
};

/** Settings with older parameter names renamed (see `SimProjectOptions.aliases`). */
export function renameSettings(settings: any, aliases: Record<string, string> = {}): any {
  if (!settings || typeof settings !== 'object') return settings;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    const name = aliases[k];
    if (name === undefined) out[k] = v;
    else if (!(name in settings)) out[name] = v;
  }
  return out;
}

/** Settings from the editor (or a URL) to parameter values of the right types. */
function coerce(value: unknown, t: Type): unknown {
  switch (t.k) {
    case 'nat': case 'int': case 'node': return typeof value === 'string' ? Number(value) : value;
    case 'bool': return value === true || value === 'true';
    case 'list': case 'multiset': case 'record': case 'option': return typeof value === 'string' ? JSON.parse(value) : value;
    default: return value;
  }
}

/** Whether a setting is a value of the declared type (after coercion). */
function fits(value: unknown, t: Type): boolean {
  let v: unknown;
  try {
    v = coerce(value, t);
  } catch {
    return false;
  }
  switch (t.k) {
    case 'nat': case 'node': return Number.isInteger(v) && (v as number) >= 0;
    case 'int': return Number.isInteger(v);
    case 'bool': return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'enum': return t.ctors.includes(v as string);
    case 'string': return typeof v === 'string';
    case 'list': case 'multiset': return Array.isArray(v);
    case 'option': return true;
    case 'record': return typeof v === 'object' && v !== null && !Array.isArray(v);
    default: return true;
  }
}

/** The first parameter values of an experiment's domains (the form's defaults). */
function firstValues(exp: Experiment): Record<string, unknown> | undefined {
  try {
    return parameterValues(exp).next().value as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Settings for a new definition of the experiment (plan, Section 6.7): values
 * of parameters that still exist with a compatible type are kept; the others
 * are reset to their defaults, and each reset is noted.
 */
export function adjustSettings(exp: Experiment, settings: Record<string, unknown> | null): { settings: Record<string, unknown> | null; notes: string[] } {
  if (!settings) return { settings, notes: [] };
  const first = firstValues(exp) ?? {};
  const notes: string[] = [];
  const out: Record<string, unknown> = {};
  for (const p of exp.params) {
    if (!(p.name in settings)) {
      out[p.name] = first[p.name];
      notes.push(`new parameter ${p.name} = ${JSON.stringify(first[p.name])}`);
    } else if (fits(settings[p.name], p.type)) {
      out[p.name] = settings[p.name];
    } else {
      out[p.name] = first[p.name];
      notes.push(`${p.name} reset from ${JSON.stringify(settings[p.name])} to ${JSON.stringify(first[p.name])}`);
    }
  }
  for (const k of Object.keys(settings)) {
    if (!exp.params.some(p => p.name === k)) notes.push(`parameter ${k} no longer exists`);
  }
  return { settings: out, notes };
}

function field(name: string, t: Type, value: unknown): EditorField {
  switch (t.k) {
    case 'nat': case 'int': case 'node': return { type: 'number', key: name, label: name, defaultValue: Number(value ?? 0), ...(t.k === 'int' ? {} : { min: 0 }) };
    case 'bool': return { type: 'boolean', key: name, label: name, defaultValue: !!value };
    case 'enum': return { type: 'select', key: name, label: name, defaultValue: String(value ?? t.ctors[0]), options: t.ctors.map(c => ({ value: c, label: c })) };
    default: return { type: 'text', key: name, label: `${name} (JSON)`, defaultValue: JSON.stringify(value ?? null) };
  }
}

/** The algorithm's definition as written in its file (the viewer shows it as is, with its line numbers). */
export function algorithmSource(exp: Experiment, sources: Record<string, string>): AlgorithmSource {
  const src = exp.algorithm.source;
  const text = src && sources[src.file];
  const linesOf = (file: string, from: number, to: number) => {
    const all = (sources[file] ?? '').split('\n');
    const lines: AlgorithmSource['lines'] = [];
    for (let n = from; n <= to; n++) lines.push({ number: n, text: (all[n - 1] ?? '').trimEnd() });
    while (lines.length && !lines[lines.length - 1].text) lines.pop();
    return lines;
  };
  const lines = src && text ? linesOf(src.file, src.line, src.endLine) : [];
  // The definitions the algorithm uses, in file order.
  const definitions = (src?.defs ?? [])
    .filter(d => sources[d.file] !== undefined)
    .sort((a, b) => a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1)
    .map(d => ({ name: d.name, file: d.file, lines: linesOf(d.file, d.line, d.endLine) }));
  return { name: exp.algorithm.name, file: src?.file, lines, ...(definitions.length ? { definitions } : {}) };
}

export function simProject(module: SimSources, experiment: string, opts: SimProjectOptions = {}): ProjectType<any, any> {
  const draw = opts.draw ?? drawRing;

  // What the project runs: the last definition that compiled, replaced on hot updates.
  type Current = {
    exp: Experiment; key: string;
    /** The defaults, computed when first needed (a domain may take time to enumerate). */
    first: () => Record<string, unknown> | undefined; editorSchema: () => EditorSchema;
    source: AlgorithmSource;
    description: () => ModelDescription;
  };
  const lazy = <X>(f: () => X): (() => X) => {
    let done = false, value: X;
    return () => { if (!done) { value = f(); done = true; } return value; };
  };
  const load = (m: SimSources): Current | undefined => {
    const exp = m.experiments[experiment];
    if (!exp) return undefined;
    const first = lazy(() => firstValues(exp));
    // Line information only affects the algorithm and model views: an edit that only moves lines redraws.
    const { line: _line, source: _source, ...algorithm } = exp.algorithm;
    const { source: _expSource, ...rest } = exp;
    return {
      // Lines of expressions (`at`) are display only, like the line table.
      exp, key: JSON.stringify({ ...rest, algorithm }, (k, v) => k === 'at' ? undefined : v), first,
      source: algorithmSource(exp, m.sources ?? {}),
      description: lazy(() => describeExperiment(exp, m.sources ?? {}, m.revision, m.lean?.[experiment])),
      editorSchema: lazy(() => ({ fields: exp.params.map(p => field(p.name, p.type, first()?.[p.name])) })),
    };
  };
  const errors = (m: SimSources) => {
    const own = (m.diagnostics ?? []).filter(d => !d.experiment || d.experiment === experiment).map(formatDiagnostic);
    return own.length ? own : [`no experiment ${experiment} in the module`];
  };
  let current = load(module);
  let initialErrors = current ? [] : errors(module);
  let revision = module.revision ?? '';

  const listeners = new Set<(u: ProjectUpdate) => void>();
  const emit = (u: ProjectUpdate) => { for (const l of listeners) l(u); };
  module.subscribe?.(next => {
    revision = next.revision ?? revision;
    const loaded = load(next);
    if (!loaded) {
      emit({ kind: 'failed', revision, diagnostics: errors(next) });
      return;
    }
    const before = current;
    initialErrors = [];
    current = loaded;
    // Same semantics (at most lines moved): the execution goes on; the algorithm view takes the new lines.
    if (before && before.key === loaded.key) {
      emit({ kind: 'redraw' });
      return;
    }
    else emit({ kind: 'replaced', revision, adjust: settings => adjustSettings(loaded.exp, renameSettings(settings, opts.aliases)) });
  });
  if (isRenderer(draw)) draw.subscribe(() => emit({ kind: 'redraw' }));

  const need = (): Current => {
    if (!current) throw new Error(initialErrors.join('\n'));
    return current;
  };
  const layouts = new WeakMap<Snapshot, Layout>();

  // Lines of agents of a system built before a line-only edit, from the current line table.
  const lineSystems = new Map<string, System>();
  const lineOf = (snapshot: Snapshot, index: number): number | undefined => {
    const cur = need();
    if (snapshot.system.exp === cur.exp) return snapshot.agents[index].line;
    const key = `${cur.key.length}:${JSON.stringify(snapshot.system.params)}`;
    let sys = lineSystems.get(key);
    if (!sys || sys.exp !== cur.exp) {
      lineSystems.clear();
      sys = new System(cur.exp, snapshot.system.params);
      lineSystems.set(key, sys);
    }
    return sys.line(snapshot.config.agents[index]);
  };

  const inSource = (line: number | undefined) => {
    const src = need().exp.algorithm.source;
    return line !== undefined && (!src || (line >= src.line && line <= src.endLine)) ? line : undefined;
  };
  const normalizeSettings =(settings: any) => renameSettings(settings, opts.aliases);
  const paramsOf = (given: Record<string, unknown> | null) => {
    const { exp, first } = need();
    const settings = normalizeSettings(given);
    return Object.fromEntries(exp.params.map(p => [p.name, coerce(settings?.[p.name] ?? first()?.[p.name], p.type)]));
  };
  // Results carry the revision they were computed for, and their traces adapter paths.
  const report = (r: CheckResult & { settings?: unknown }, rev: string) => ({
    status: r.status, reason: r.reason, stats: r.stats, revision: rev,
    ...(typeof r.settings === 'number' ? { settings: r.settings, graphs: (r as { graphs?: number }).graphs } : {}),
    trace: r.trace && {
      kind: r.trace.kind, settings: r.trace.settings, path: r.trace.path, cycleStart: r.trace.cycleStart,
      steps: r.trace.steps.map(s => ({ label: s.label, verdict: s.verdict })),
    },
  });
  const limits = (o: CheckOptions = {}) => ({ maxDepth: o.maxDepth, maxStates: o.maxStates });

  const setup = (settings: Record<string, unknown> | null): SimModel => {
    const { exp } = need();
    const params = paramsOf(settings);
    const system = new System(exp, params);
    return {
      system, params,
      info: {
        experiment, algorithm: exp.algorithm.name, size: system.topo.size, params,
        components: exp.model.components.map(c => c.name),
      },
    };
  };

  return {
    setup: setup as ProjectType<any, any>['setup'],
    execute: (model: SimModel) => simExecution(model.system),
    normalizeSettings,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    revision: () => revision,
    experiment: () => ({ name: experiment, ir: need().exp }),
    check: async (settings, o = {}) => {
      const rev = revision;
      return report(await checkSetting(need().exp, paramsOf(settings), limits(o), o.signal && { signal: o.signal }), rev);
    },
    checkAll: async (o = {}, onProgress) => {
      const rev = revision;
      const { exp } = need();
      return report(await checkSettings(exp, parameterValues(exp), {
        ...limits(o), shared: !o.perSetting, maxConfigs: o.maxConfigs,
      }, o.signal && { signal: o.signal }, onProgress), rev);
    },
    checkFirstBranch: (settings, o = {}) => report(checkFirstBranch(need().exp, paramsOf(settings), limits(o)), revision),
    stateGraph: (settings, o = {}) => {
      const { exp } = need();
      const params = paramsOf(settings);
      const g = stateGraph(exp, params, limits(o));
      // States as snapshots, so that `debugConfig` and renderers take them.
      const system = new System(exp, params);
      return { ...g, states: g.states.map(s => ({ ...s, config: new Snapshot(s.config, system) })) };
    },
    drawConfig: (ctx: CanvasRenderingContext2D, snapshot: Snapshot, model: SimModel, options) => {
      // The viewer owns the canvas: draw within the given placement, restoring its state.
      ctx.save();
      try {
        const layout = draw(ctx, snapshot, model.info, options);
        if (layout) layouts.set(snapshot, layout);
      } finally {
        ctx.restore();
      }
    },
    getAgentsRenderInfo: (snapshot: Snapshot, _model: SimModel, centerX: number, centerY: number, radius: number) =>
      opts.draw ? layouts.get(snapshot)?.agents ?? [] : ringLayout(snapshot, { centerX, centerY, radius }).agents,
    debugConfig: (snapshot: Snapshot) => {
      const nodes = Array.from({ length: snapshot.size }, (_, n) => {
        const here = snapshot.get(n).agents.map(a => `${a.id}${a.correct ? '' : '!'}`);
        return here.length ? here.join(',') : '.';
      });
      return `${nodes.join('|')} ${JSON.stringify(snapshot.world)}`;
    },
    // The current UI stops at `success` and `failure`. Only under the goal `eventually` is a
    // success final; under the other goals, executions go on (the explorer decides them).
    stateKey: (snapshot: Snapshot) => snapshot.system.key(snapshot.config),
    verdict: (snapshot: Snapshot, model: SimModel) =>({ verdict: model.system.verdict(snapshot.config), goal: model.system.exp.task.goal }),
    executionStatusChecker: (snapshot: Snapshot, model: SimModel) => {
      const v = model.system.verdict(snapshot.config);
      return v === 'success' && model.system.exp.task.goal !== 'eventually' ? 'inProgress' : v;
    },
    settingsGenerator: function* () {
      if (current) yield* parameterValues(current.exp);
    },
    get editorSchema() {
      return current?.editorSchema() ?? { fields: [] };
    },
    inspect: (snapshot: Snapshot, model: SimModel) => ({
      world: { ...snapshot.world },
      params: { ...model.params },
      agents: snapshot.agents
        .map((a, i) => ({ a, i }))
        .sort((x, y) => x.a.id - y.a.id)
        .map(({ a, i }) => ({
          id: a.id,
          name: opts.agentName?.(a.id) ?? `a${a.id}`,
          color: agentColor(a.id),
          status: !a.present ? 'hidden' as const : a.correct ? 'correct' as const : 'faulty' as const,
          value: {
            position: a.pos,
            // Outside the algorithm's definition (the idling of a lag), the agent is idle; without a
            // line table (no memory), the algorithm view shows where the last step decided.
            ...(a.present && lineOf(snapshot, i) !== undefined ? { line: inSource(lineOf(snapshot, i)) ?? 'idle' } : {}),
            flags: a.flags,
            ...a.fields,
            pub: a.pub,
            mem: a.mem,
          },
        })),
    }),
    describe: () => need().description(),
    getAlgorithmViewInfo: (snapshot: Snapshot) => ({
      source: need().source,
      // Hidden agents (such as those the black hole destroyed) run no line; the others by id.
      agents: snapshot.agents
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.present)
        .sort((x, y) => x.a.id - y.a.id)
        .map(({ a, i }) => ({
          agentId: opts.agentName?.(a.id) ?? `a${a.id}`,
          index: i,
          line: lineOf(snapshot, i) ?? 0,
          // From the current definition: program-counter values survive an edit that only moves lines.
          calls: need().exp.algorithm.source?.calls?.[(snapshot.config.agents[i].mem as { pc?: string } | null)?.pc ?? 'start'] ?? [],
          color: agentColor(a.id),
        })),
    }),
  } as ProjectType<any, any>;
}
