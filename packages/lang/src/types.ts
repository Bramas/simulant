import type { Field, Space, Type } from './ir';

export const T = {
  unit: { k: 'unit' } as Type,
  bool: { k: 'bool' } as Type,
  nat: { k: 'nat' } as Type,
  int: { k: 'int' } as Type,
  string: { k: 'string' } as Type,
  pos: { k: 'pos' } as Type,
  loc: { k: 'loc' } as Type,
  look: { k: 'look' } as Type,
  agent: { k: 'agent' } as Type,
  config: { k: 'config' } as Type,
  effect: { k: 'effect' } as Type,
  decision: { k: 'decision' } as Type,
  verdict: { k: 'verdict' } as Type,
  pub: { k: 'pub' } as Type,
  infer: { k: 'infer' } as Type,
  enum: (name: string, ctors: string[]): Type => ({ k: 'enum', name, ctors }),
  option: (of: Type): Type => ({ k: 'option', of }),
  record: (fields: Record<string, Type> | Field[]): Type =>
    ({ k: 'record', fields: Array.isArray(fields) ? fields : Object.entries(fields).map(([name, type]) => ({ name, type })) }),
  list: (of: Type): Type => ({ k: 'list', of }),
  multiset: (of: Type): Type => ({ k: 'multiset', of }),
  fn: (params: Type[], ret: Type): Type => ({ k: 'fn', params, ret }),
};

export const VERDICTS = ['success', 'failure', 'inProgress'] as const;

export function typeEq(a: Type, b: Type): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'enum': {
      const o = b as typeof a;
      return a.name === o.name && a.ctors.length === o.ctors.length && a.ctors.every((c, i) => c === o.ctors[i]);
    }
    case 'option': case 'list': case 'multiset':
      return typeEq(a.of, (b as typeof a).of);
    case 'record': {
      const o = b as typeof a;
      // Fields are matched by name, as in Lean structure instances.
      return a.fields.length === o.fields.length
        && a.fields.every(f => o.fields.some(g => g.name === f.name && typeEq(f.type, g.type)));
    }
    case 'fn': {
      const o = b as typeof a;
      return a.params.length === o.params.length && a.params.every((p, i) => typeEq(p, o.params[i])) && typeEq(a.ret, o.ret);
    }
    default:
      return true;
  }
}

export function showType(t: Type): string {
  switch (t.k) {
    case 'enum': return t.name;
    case 'option': return `Option ${wrap(t.of)}`;
    case 'list': return `List ${wrap(t.of)}`;
    case 'multiset': return `Multiset ${wrap(t.of)}`;
    case 'record': return `{ ${t.fields.map(f => `${f.name} : ${showType(f.type)}`).join(', ')} }`;
    case 'fn': return `(${t.params.map(showType).join(' → ')} → ${showType(t.ret)})`;
    default: return t.k[0].toUpperCase() + t.k.slice(1);
  }
}

function wrap(t: Type) {
  const s = showType(t);
  return /\s/.test(s) && !s.startsWith('{') ? `(${s})` : s;
}

/** Types whose values can be compared, stored in configurations and encoded. */
export function isData(t: Type): boolean {
  switch (t.k) {
    case 'fn': case 'config': case 'look': case 'effect': case 'decision': return false;
    case 'option': case 'list': case 'multiset': return isData(t.of);
    case 'record': return t.fields.every(f => isData(f.type));
    default: return true;
  }
}

/** Whether `t` mentions a type of kind `k`. */
export function mentions(t: Type, k: Type['k']): boolean {
  if (t.k === k) return true;
  switch (t.k) {
    case 'option': case 'list': case 'multiset': return mentions(t.of, k);
    case 'record': return t.fields.some(f => mentions(f.type, k));
    case 'fn': return t.params.some(p => mentions(p, k)) || mentions(t.ret, k);
    default: return false;
  }
}

/** Data that can be kept in a configuration: agents and locations are only valid within a round. */
export function isStorable(t: Type): boolean {
  return isData(t) && !mentions(t, 'agent') && !mentions(t, 'loc');
}

export function isCollection(t: Type): t is { k: 'list' | 'multiset'; of: Type } {
  return t.k === 'list' || t.k === 'multiset';
}

export function fieldType(t: Type, name: string): Type | undefined {
  return t.k === 'record' ? t.fields.find(f => f.name === name)?.type : undefined;
}

/** Replaces the `pub` placeholder by the public state of the composition. */
export function resolvePub(t: Type, pub: Type): Type {
  switch (t.k) {
    case 'pub': return pub;
    case 'option': case 'list': case 'multiset': return { k: t.k, of: resolvePub(t.of, pub) } as Type;
    case 'record': return { k: 'record', fields: t.fields.map(f => ({ name: f.name, type: resolvePub(f.type, pub) })) };
    case 'fn': return { k: 'fn', params: t.params.map(p => resolvePub(p, pub)), ret: resolvePub(t.ret, pub) };
    default: return t;
  }
}

/** The graph under a space (a dynamic graph's base), or undefined for a Euclidean space. */
export function graphOf(s: Space): Extract<Space, { kind: 'graph' }> | undefined {
  return s.kind === 'graph' ? s : s.kind === 'dynamic' ? graphOf(s.base) : undefined;
}
