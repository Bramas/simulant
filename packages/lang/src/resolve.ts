/**
 * Replaces the literals of type `infer` (`.ctor`, `none`, `[]` from the front
 * end) by literals of the types the checker found, and folds lists of
 * literals into a single literal. The result is plain IR: the interpreter
 * and the Lean generator never see `infer`.
 */
import type { Experiment, Expr, Json, Type } from './ir';
import { T } from './types';

export function resolveTypes(exp: Experiment, resolutions: Map<Expr, Type>, onCopy?: (from: Expr, to: Expr) => void): Experiment {
  const copy = (x: unknown): unknown => {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(copy);
    const o = x as Record<string, unknown>;
    if (typeof o.e === 'string') {
      const e = o as Expr;
      let out: Expr;
      if (e.e === 'lit' && e.type.k === 'infer') {
        const t = resolutions.get(e);
        if (!t) throw new Error(`a literal was not resolved: ${JSON.stringify(e.value)}`);
        out = { e: 'lit', type: t, value: e.value };
      } else {
        out = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, copy(v)])) as Expr;
        if (out.e === 'call' && out.fn === 'list' && out.args.every(a => a.e === 'lit')) {
          const items = out.args as Extract<Expr, { e: 'lit' }>[];
          out = { e: 'lit', type: T.list(items[0].type), value: items.map(a => a.value) as Json[] };
        }
      }
      onCopy?.(e, out);
      return out;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, copy(v)]));
  };
  return copy(exp) as Experiment;
}
