/**
 * Runtime values (plan, Section 6.4). Values are immutable JavaScript data:
 *
 *   Unit, none            null
 *   Bool                  boolean
 *   Nat, Int, Node        number
 *   Agent                 number (index in the configuration of the round)
 *   Frame (ring)          boolean (mirrored)
 *   Move, enums, Verdict  string (constructor name)
 *   String                string
 *   Option T              null or the value (options of options are not supported)
 *   records               plain objects
 *   List                  arrays
 *   Multiset              arrays sorted by encoding, so no order leaks
 *
 * Every type has a canonical, injective string encoding, used for state
 * equality and hashing.
 */
import type { Type } from '@bramas/simulant-lang/ir';

export type V = any;
export type Encoder = (v: V) => string;

const encoders = new WeakMap<Type, Encoder>();

export function encoder(t: Type): Encoder {
  let e = encoders.get(t);
  if (!e) {
    e = makeEncoder(t);
    encoders.set(t, e);
  }
  return e;
}

function makeEncoder(t: Type): Encoder {
  switch (t.k) {
    case 'unit': return () => '';
    case 'bool': return v => v ? '1' : '0';
    case 'frame': return v => v ? 'm' : 'i';
    case 'nat': case 'int': case 'node': case 'agent': return v => String(v);
    case 'move': case 'enum': case 'verdict': return v => v;
    case 'string': return v => JSON.stringify(v);
    case 'option': {
      const inner = encoder(t.of);
      return v => v === null ? '-' : `+${inner(v)}`;
    }
    case 'list': case 'multiset': {
      const inner = encoder(t.of);
      return v => {
        let s = '[';
        for (let i = 0; i < v.length; i++) s += (i ? ',' : '') + inner(v[i]);
        return s + ']';
      };
    }
    case 'record': {
      const fields = t.fields.map(f => [f.name, encoder(f.type)] as const);
      return v => {
        let s = '{';
        for (let i = 0; i < fields.length; i++) s += (i ? ',' : '') + fields[i][1](v[fields[i][0]]);
        return s + '}';
      };
    }
    default:
      return () => { throw new Error(`values of type ${t.k} cannot be encoded`); };
  }
}

function isAtomic(t: Type) {
  return !['option', 'list', 'multiset', 'record'].includes(t.k);
}

export function equality(t: Type): (a: V, b: V) => boolean {
  if (isAtomic(t)) return (a, b) => a === b;
  if (t.k === 'option' && isAtomic(t.of)) return (a, b) => a === b;
  const enc = encoder(t);
  return (a, b) => a === b || enc(a) === enc(b);
}

/** Sorts the elements of a multiset into canonical order. */
export function canonicalSort(elem: Type): (xs: V[]) => V[] {
  if (elem.k === 'nat' || elem.k === 'int' || elem.k === 'node' || elem.k === 'agent') {
    return xs => xs.slice().sort((a, b) => a - b);
  }
  const enc = encoder(elem);
  return xs => xs.map(x => [enc(x), x] as const).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(p => p[1]);
}

/**
 * `show`, or, with `compact` (explanations of steps, for reading), lists of booleans as one
 * word: `[XX.X.]` for `[true, true, false, true, false]`.
 */
export function show(t: Type, compact = false): (v: V) => string {
  switch (t.k) {
    case 'unit': return () => '()';
    case 'agent': return v => `a${v}`;
    case 'node': return v => `u${v}`;
    case 'frame': return v => v ? 'mirrored' : 'as is';
    case 'string': return v => v;
    case 'option': {
      const inner = show(t.of, compact);
      return v => v === null ? 'none' : `some ${inner(v)}`;
    }
    case 'list': case 'multiset': {
      if (compact && t.of.k === 'bool') return v => `[${v.map((b: boolean) => b ? 'X' : '.').join('')}]`;
      const inner = show(t.of, compact);
      return v => `[${v.map(inner).join(', ')}]`;
    }
    case 'record': {
      const fields = t.fields.map(f => [f.name, show(f.type, compact)] as const);
      return v => `{ ${fields.map(([n, s]) => `${n} := ${s(v[n])}`).join(', ')} }`;
    }
    default: return v => String(v);
  }
}

/** How an automorphism acts on the values of a type: nodes are mapped, frames composed. */
export type Action = { node: (n: number) => number; frame: (f: V) => V };

/** The action on values of type `t`, or `undefined` when it is the identity. */
export function mapper(t: Type): ((v: V, g: Action) => V) | undefined {
  switch (t.k) {
    case 'node': return (v, g) => g.node(v);
    case 'frame': return (v, g) => g.frame(v);
    case 'option': {
      const inner = mapper(t.of);
      return inner && ((v, g) => v === null ? null : inner(v, g));
    }
    case 'list': {
      const inner = mapper(t.of);
      return inner && ((v, g) => v.map((x: V) => inner(x, g)));
    }
    case 'multiset': {
      const inner = mapper(t.of);
      const sort = canonicalSort(t.of);
      return inner && ((v, g) => sort(v.map((x: V) => inner(x, g))));
    }
    case 'record': {
      const fields = t.fields.map(f => [f.name, mapper(f.type)] as const).filter(([, m]) => m);
      if (!fields.length) return undefined;
      return (v, g) => {
        const out = { ...v };
        for (const [n, m] of fields) out[n] = m!(v[n], g);
        return out;
      };
    }
    default: return undefined;
  }
}
