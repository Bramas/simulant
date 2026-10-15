/**
 * The state of a preview across hot updates (plan, Section 6.7):
 * - a successful update replaces the experiments, keeps the selected
 *   experiment and the parameter values that are still valid, says which
 *   were reset, and restarts at the initial configuration;
 * - an update with errors keeps the last good experiments and marks them
 *   out of date.
 */
import type { Experiment } from '@bramas/simulant-lang/ir';
import { parameterValues } from '@bramas/simulant-engine/system';
import type { SimModule } from '@bramas/simulant-vite-plugin/module';

export type Session = {
  module: SimModule;
  /** The last module without errors: what is shown. */
  good?: SimModule;
  outOfDate: boolean;
  experiment?: string;
  params?: Record<string, unknown>;
  /** Notes about the last update (values reset, experiment gone). */
  notes: string[];
};

export function choices(exp: Experiment, max = 500): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const p of parameterValues(exp)) {
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function update(prev: Session | undefined, module: SimModule): Session {
  const failed = module.diagnostics.length > 0;
  if (failed) return { ...(prev ?? { notes: [] }), module, outOfDate: true, notes: [] } as Session;
  const notes: string[] = [];
  const names = Object.keys(module.experiments);
  let experiment = prev?.experiment;
  if (experiment && !names.includes(experiment)) {
    notes.push(`experiment ${experiment} no longer exists`);
    experiment = undefined;
  }
  experiment ??= names[0];
  let params: Record<string, unknown> | undefined;
  if (experiment) {
    const all = choices(module.experiments[experiment]);
    const kept = prev?.experiment === experiment && prev.params && all.find(c => same(c, prev.params));
    if (kept) params = kept;
    else {
      // The allowed combination that keeps the most previous values (the first among equals).
      const kept = (c: Record<string, unknown>) => Object.entries(prev?.params ?? {}).filter(([k, v]) => same(c[k], v)).length;
      params = all.reduce<Record<string, unknown> | undefined>((best, c) => !best || kept(c) > kept(best) ? c : best, undefined);
      if (prev?.params && prev.experiment === experiment) {
        for (const [k, v] of Object.entries(prev.params)) {
          if (!params || !same(params[k], v)) notes.push(`${k} reset from ${JSON.stringify(v)} to ${JSON.stringify(params?.[k])}`);
        }
      }
    }
  }
  return { module, good: module, outOfDate: false, experiment, params, notes };
}
