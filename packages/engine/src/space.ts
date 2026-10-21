/**
 * Spaces of the semantic core (docs/core-redesign.md, sections 2, 3 and 7): graphs whose
 * vertices and ordered neighbors (ports) are IR expressions, the per-round state of a dynamic
 * graph, the visible domain of an agent, its locations under the declared frames, and the
 * automorphisms used for symmetry reduction.
 */
import type { Frames } from '@bramas/simulant-lang/ir';
import { vertexKey, type V } from './values';

export type Vertex = V;

/** An automorphism of the space: a map of vertices and, when ports are consistent with it, of port numbers. */
export type Automorphism = {
  label: string;
  vertex: (v: Vertex) => Vertex;
  /** Port `p` of a vertex `v` is port `ports[p]` of `vertex(v)`; undefined when it differs between vertices. */
  ports?: number[];
};

/** The group the explorer quotients by: finitely many automorphisms, or the translations (and reflection) of the line. */
export type Group =
  | { kind: 'finite'; elements: Automorphism[] }
  | { kind: 'line'; reflection: boolean };

export class SpaceRuntime {
  readonly finite: boolean;
  readonly vertices?: Vertex[];
  private readonly keys?: Set<string>;
  private readonly nbrCache = new Map<string, Vertex[]>();
  /** The edges of a finite graph, in vertex then port order, as `key|key|k` (k-th parallel edge). */
  private edgeList?: { id: string; a: Vertex; b: Vertex }[];
  private readonly missingSets: { state: string[]; label: string }[];

  constructor(
    readonly name: string,
    vertices: Vertex[] | undefined,
    private readonly nbrs: (v: Vertex) => Vertex[],
    readonly automorphismSpec: AutomorphismSpec,
    /** The most edges the adversary removes each round (0: a static graph). */
    readonly missing = 0,
  ) {
    this.finite = !!vertices;
    if (vertices) {
      this.vertices = vertices;
      this.keys = new Set(vertices.map(vertexKey));
      if (this.keys.size !== vertices.length) throw new Error(`${name}: repeated vertices`);
      // A finite graph is checked when it is built: neighbors are vertices, and there is no self-loop.
      for (const v of vertices) this.neighbors(v);
    }
    this.missingSets = missing > 0 ? this.removals(missing) : [{ state: [], label: '' }];
  }

  has(v: Vertex): boolean {
    return this.keys ? this.keys.has(vertexKey(v)) : true;
  }

  /** The ordered neighbors of `v` (its ports); a vertex may appear twice (parallel edges). */
  neighbors(v: Vertex): Vertex[] {
    const k = vertexKey(v);
    let out = this.nbrCache.get(k);
    if (!out) {
      out = this.nbrs(v);
      if (this.keys) for (const w of out) if (!this.has(w)) throw new Error(`${this.name}: neighbor ${vertexKey(w)} of ${k} is not a vertex`);
      if (out.some(w => vertexKey(w) === k)) throw new Error(`${this.name}: vertex ${k} is its own neighbor (self-loops are not supported)`);
      this.nbrCache.set(k, out);
    }
    return out;
  }

  /** The states the adversary may choose at the start of a round: the sets of missing edges. */
  states(): { state: string[]; label: string }[] {
    return this.missingSets;
  }

  /** Whether some edge between `u` and `w` is present in `state` (the list of missing edges). */
  edgePresent(state: string[], u: Vertex, w: Vertex): boolean {
    if (!state.length) return true;
    const [a, b] = [vertexKey(u), vertexKey(w)].sort();
    const parallel = this.neighbors(u).filter(x => vertexKey(x) === vertexKey(w)).length;
    for (let k = 0; k < parallel; k++) if (!state.includes(`${a}|${b}|${k}`)) return true;
    return false;
  }

  edges(): { id: string; a: Vertex; b: Vertex }[] {
    if (this.edgeList) return this.edgeList;
    if (!this.vertices) throw new Error(`${this.name} is infinite: its edges cannot be listed`);
    const seen = new Set<string>();
    const out: { id: string; a: Vertex; b: Vertex }[] = [];
    for (const u of this.vertices) {
      const count = new Map<string, number>();
      for (const w of this.neighbors(u)) {
        const kw = vertexKey(w);
        const k = count.get(kw) ?? 0;
        count.set(kw, k + 1);
        const [a, b] = [vertexKey(u), kw].sort();
        const id = `${a}|${b}|${k}`;
        if (!seen.has(id)) { seen.add(id); out.push({ id, a: u, b: w }); }
      }
    }
    return this.edgeList = out;
  }

  private removals(k: number): { state: string[]; label: string }[] {
    const edges = this.edges();
    const sets: number[][] = [[]];
    const extend = (from: number, current: number[]) => {
      for (let e = from; e < edges.length; e++) {
        const next = [...current, e];
        if (next.length > k) continue;
        sets.push(next);
        extend(e + 1, next);
      }
    };
    extend(0, []);
    const show = (v: Vertex) => `u${vertexKey(v)}`;
    return sets.map(s => ({
      state: s.map(e => edges[e].id),
      label: s.length ? `missing ${s.map(e => `${show(edges[e].a)}–${show(edges[e].b)}`).join(', ')}` : 'all edges present',
    }));
  }

  /** The largest degree: of the finite graph, or of the given vertices of an infinite one. */
  maxDegree(sample: Vertex[] = []): number {
    return Math.max(0, ...(this.vertices ?? sample).map(v => this.neighbors(v).length));
  }

  /** The automorphism group, with the port permutation each element induces when ports are consistent. */
  group(): Group {
    const spec = this.automorphismSpec;
    if (spec.kind === 'translationsAndReflection') return { kind: 'line', reflection: true };
    if (spec.kind === 'dihedral') {
      const n = spec.n;
      const mod = (x: number) => ((x % n) + n) % n;
      const elements: Automorphism[] = [];
      for (let k = 0; k < n; k++) elements.push({ label: `rotation ${k}`, vertex: v => mod(v + k), ports: [0, 1] });
      for (let k = 0; k < n; k++) elements.push({ label: `reflection ${k}`, vertex: v => mod(k - v), ports: [1, 0] });
      return { kind: 'finite', elements };
    }
    return { kind: 'finite', elements: this.computedAutomorphisms() };
  }

  /** Every automorphism of the finite graph (adjacency with multiplicity), by backtracking. */
  private computedAutomorphisms(): Automorphism[] {
    const vs = this.vertices ?? (() => { throw new Error(`${this.name} is infinite: give its automorphisms`); })();
    const n = vs.length;
    const index = new Map(vs.map((v, i) => [vertexKey(v), i]));
    const mult: number[][] = vs.map(() => new Array(n).fill(0));
    vs.forEach((v, i) => { for (const w of this.neighbors(v)) mult[i][index.get(vertexKey(w))!]++; });
    const degree = mult.map(row => row.reduce((a, b) => a + b, 0));
    const maps: number[][] = [];
    const sigma = new Array<number>(n).fill(-1);
    const used = new Array<boolean>(n).fill(false);
    const go = (i: number) => {
      if (i === n) { maps.push(sigma.slice()); return; }
      for (let c = 0; c < n; c++) {
        if (used[c] || degree[c] !== degree[i] || mult[i][i] !== mult[c][c]) continue;
        let ok = true;
        for (let j = 0; j < i && ok; j++) ok = mult[i][j] === mult[c][sigma[j]] && mult[j][i] === mult[sigma[j]][c];
        if (!ok) continue;
        sigma[i] = c; used[c] = true;
        go(i + 1);
        sigma[i] = -1; used[c] = false;
      }
    };
    go(0);
    return maps.map((m, j) => {
      const vertex = (v: Vertex) => vs[m[index.get(vertexKey(v))!]];
      return { label: j === 0 && m.every((x, i) => x === i) ? 'identity' : `automorphism ${j}`, vertex, ports: this.inducedPorts(vertex) };
    });
  }

  /** The port permutation induced by a vertex map, matching parallel edges in order; undefined when it differs between vertices. */
  private inducedPorts(g: (v: Vertex) => Vertex): number[] | undefined {
    let common: number[] | undefined;
    for (const v of this.vertices!) {
      const from = this.neighbors(v).map(w => vertexKey(g(w)));
      const to = this.neighbors(g(v)).map(vertexKey);
      const taken = new Array<boolean>(to.length).fill(false);
      const perm = from.map(k => {
        const j = to.findIndex((x, i) => !taken[i] && x === k);
        taken[j] = true;
        return j;
      });
      if (common && (common.length !== perm.length || common.some((p, i) => p !== perm[i]))) return undefined;
      common ??= perm;
    }
    return common;
  }
}

export type AutomorphismSpec =
  | { kind: 'computed' }
  | { kind: 'dihedral'; n: number }
  | { kind: 'translationsAndReflection' };

// ---------------------------------------------------------------------------
// Views and locations

/** The visible domain around a vertex: its vertices, distances, and the view's edges by port. */
export type View = {
  vertices: Vertex[];
  index: Map<string, number>;
  dist: number[];
  /** For each vertex of the view, its visible edges: the port and the neighbor's index in the view. */
  edges: { port: number; to: number }[][];
};

/** The r-hop view (positions at distance ≤ r, edges with an endpoint at distance < r); `r = Infinity` for the full view. */
export function viewAround(space: SpaceRuntime, center: Vertex, r: number): View {
  const vertices: Vertex[] = [center];
  const index = new Map([[vertexKey(center), 0]]);
  const dist = [0];
  for (let q = 0; q < vertices.length; q++) {
    if (dist[q] >= r) continue;
    for (const w of space.neighbors(vertices[q])) {
      const k = vertexKey(w);
      if (index.has(k)) continue;
      index.set(k, vertices.length);
      vertices.push(w);
      dist.push(dist[q] + 1);
    }
  }
  const edges = vertices.map((v, i) => space.neighbors(v).flatMap((w, port) => {
    const to = index.get(vertexKey(w));
    return to !== undefined && (dist[i] < r || dist[to] < r) ? [{ port, to }] : [];
  }));
  return { vertices, index, dist, edges };
}

/**
 * The isomorphisms of a view fixing its center: permutations of its vertices preserving
 * distances and the multiset of edges. Backtracking in breadth-first order.
 */
export function rootedAutomorphisms(view: View): number[][] {
  const n = view.vertices.length;
  const mult: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  view.edges.forEach((es, i) => { for (const e of es) mult[i][e.to]++; });
  const degree = mult.map(row => row.reduce((a, b) => a + b, 0));
  const out: number[][] = [];
  const sigma = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  sigma[0] = 0; used[0] = true;
  const go = (i: number) => {
    if (i === n) { out.push(sigma.slice()); return; }
    for (let c = 1; c < n; c++) {
      if (used[c] || view.dist[c] !== view.dist[i] || degree[c] !== degree[i] || mult[c][c] !== mult[i][i]) continue;
      let ok = true;
      for (let j = 0; j < i && ok; j++) ok = mult[i][j] === mult[c][sigma[j]] && mult[j][i] === mult[sigma[j]][c];
      if (!ok) continue;
      sigma[i] = c; used[c] = true;
      go(i + 1);
      sigma[i] = -1; used[c] = false;
    }
  };
  go(1);
  return out;
}

/** A presentation of a view: which vertex each location is, and each location's neighbors, in the frame's order. */
export type Presentation = { order: number[]; nbrs: number[][]; label: string };

/**
 * Under `Frames.isomorphisms`: the reference ordering (here, the physical order of the vertices)
 * followed by a rooted isomorphism `sigma`; neighbor lists in location order.
 */
export function isomorphicPresentation(view: View, sigma: number[], label: string): Presentation {
  const n = view.vertices.length;
  const ref = [...view.vertices.keys()].sort((a, b) => physicalCompare(view.vertices[a], view.vertices[b]));
  const refIndex = new Array<number>(n);
  ref.forEach((v, i) => { refIndex[v] = i; });
  const loc = (v: number) => refIndex[sigma[v]];
  const order = new Array<number>(n);
  for (let v = 0; v < n; v++) order[loc(v)] = v;
  const nbrs = order.map(v => view.edges[v].map(e => loc(e.to)).sort((a, b) => a - b));
  return { order, nbrs, label };
}

/**
 * Under port-based frames: locations numbered breadth-first from the observer, following each
 * vertex's ports through the permutation `local` (local port i is the space's port local[i]);
 * neighbor lists in that local port order.
 */
export function portPresentation(view: View, local: number[], label: string): Presentation {
  const n = view.vertices.length;
  const visibleIn = (v: number) => local.flatMap(p => view.edges[v].filter(e => e.port === p).map(e => e.to));
  const locOf = new Array<number>(n).fill(-1);
  const order: number[] = [0];
  locOf[0] = 0;
  for (let q = 0; q < order.length; q++) {
    for (const w of visibleIn(order[q])) {
      if (locOf[w] >= 0) continue;
      locOf[w] = order.length;
      order.push(w);
    }
  }
  // Vertices unreachable through the permuted ports (a port beyond the permutation) come last, in view order.
  for (let v = 0; v < n; v++) if (locOf[v] < 0) { locOf[v] = order.length; order.push(v); }
  const nbrs = order.map(v => visibleIn(v).map(w => locOf[w]));
  return { order, nbrs, label };
}

function physicalCompare(a: Vertex, b: Vertex): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const [x, y] = [vertexKey(a), vertexKey(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The permutations of `0 .. d-1`, identity first, in lexicographic order. */
export function permutations(d: number): number[][] {
  const out: number[][] = [];
  const go = (current: number[], rest: number[]) => {
    if (!rest.length) { out.push(current); return; }
    rest.forEach((x, i) => go([...current, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  go([], Array.from({ length: d }, (_, i) => i));
  return out;
}

/** The port permutations a port-based frame may use, as local → space port arrays. */
export function framePermutations(space: SpaceRuntime, frames: Frames, degree: number): number[][] {
  if (frames.kind === 'identity') return [Array.from({ length: degree }, (_, i) => i)];
  if (frames.kind !== 'portPermutations') return [];
  if (frames.among === 'all') return permutations(degree);
  const group = space.group();
  const perms = group.kind === 'line' ? [[0, 1], [1, 0]] : group.elements.map(g => {
    if (!g.ports) throw new Error(`${space.name}: ports are not consistent with its symmetries (needed by among := .symmetries)`);
    return g.ports;
  });
  const seen = new Set<string>();
  // As local → space arrays: local port i is the space's port that the symmetry maps to i.
  return perms.map(inverse).filter(p => { const k = p.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function inverse(p: number[]): number[] {
  const out = new Array<number>(p.length);
  p.forEach((x, i) => { out[x] = i; });
  return out;
}
