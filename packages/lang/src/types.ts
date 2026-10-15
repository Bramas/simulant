import type { Field, Type } from './ir';

export const T = {
  unit: { k: 'unit' } as Type,
  bool: { k: 'bool' } as Type,
  nat: { k: 'nat' } as Type,
  int: { k: 'int' } as Type,
  string: { k: 'string' } as Type,
  node: { k: 'node' } as Type,
  move: { k: 'move' } as Type,
  frame: { k: 'frame' } as Type,
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

export const MOVES = ['stay', 'cw', 'ccw'] as const;
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
    case 'fn': case 'config': case 'effect': case 'decision': return false;
    case 'option': case 'list': case 'multiset': return isData(t.of);
    case 'record': return t.fields.every(f => isData(f.type));
    default: return true;
  }
}

/** Data that can be kept in a configuration: agents are only references within a round. */
export function isStorable(t: Type): boolean {
  switch (t.k) {
    case 'agent': return false;
    case 'option': case 'list': case 'multiset': return isStorable(t.of);
    case 'record': return t.fields.every(f => isStorable(f.type));
    default: return isData(t);
  }
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
