/**
 * The execution interface of the UI (plan, Section 6.5) over the new engine:
 * a tree of paths. The first index chooses an initial configuration (`[0]`
 * when there is one, the common case), each further index a successor.
 * Successors are ordered by witness, so paths are deterministic, and the
 * explorer's counterexamples are paths too (`packages/engine/src/check.ts`);
 * `getEdgeLabel` gives the witness of the last step.
 */
import type { Choice, Explanation, Successor, System } from '@bramas/simulant-engine/system';
import { Snapshot } from './snapshot';

export interface Execution<S = Snapshot> {
  get(path: number[]): S;
  getChildrenCount(path: number[]): number;
  getSiblingCount(path: number[]): number;
  getRandomChildIndex(path: number[]): number;
  /** The witness of the step that leads to the configuration at `path`. */
  getEdgeLabel(path: number[]): string;
  /** The choices of that step, with the index of the option taken. */
  getEdgeWitness(path: number[]): Choice[];
  /** Why each agent of the configuration at `path` took its decision in the step that led there. */
  explain(path: number[]): (Explanation | undefined)[];
}

type Node = { successor: Successor; snapshot?: Snapshot; children?: Node[]; explanations?: (Explanation | undefined)[] };

export function label(witness: Choice[]): string {
  return witness.map(c => c.label).join('; ');
}

export function simExecution(system: System): Execution & { node(path: number[]): Successor } {
  const initial = system.initial();
  if (!initial.length) throw new Error('the experiment has no initial configuration');
  const roots: Node[] = initial.map(successor => ({ successor }));
  const nodeAt = (path: number[]): Node => {
    if (!(path[0] >= 0 && path[0] < roots.length)) throw new Error(`no initial configuration ${path[0]} (there are ${roots.length})`);
    let node = roots[path[0]];
    for (const i of path.slice(1)) {
      const children = childrenOf(node);
      if (i < 0 || i >= children.length) throw new Error(`no child ${i} (there are ${children.length})`);
      node = children[i];
    }
    return node;
  };
  const childrenOf = (node: Node): Node[] =>
    node.children ??= system.successors(node.successor.config).map(successor => ({ successor }));
  return {
    node: path => nodeAt(path).successor,
    get: path => {
      const node = nodeAt(path);
      return node.snapshot ??= new Snapshot(node.successor.config, system);
    },
    getChildrenCount: path => childrenOf(nodeAt(path)).length,
    getSiblingCount: path => path.length <= 1 ? roots.length : childrenOf(nodeAt(path.slice(0, -1))).length,
    getRandomChildIndex: path => Math.floor(Math.random() * Math.max(1, childrenOf(nodeAt(path)).length)),
    getEdgeLabel: path => label(nodeAt(path).successor.witness),
    getEdgeWitness: path => nodeAt(path).successor.witness,
    explain: path => {
      const node = nodeAt(path);
      if (path.length < 2) return [];
      // Replayed once per configuration: the explanation only depends on the step.
      return node.explanations ??= system.explainAll(nodeAt(path.slice(0, -1)).successor.config, node.successor.key);
    },
  };
}
