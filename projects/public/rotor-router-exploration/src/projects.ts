import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as rotor from '../sim/rotor.sim';

export const graphExamples = {
  path: [[1], [0, 2], [1, 3], [2, 4], [3]],
  star: [[1, 2, 3, 4], [0], [0], [0], [0]],
  tree: [[1, 2], [0, 3, 4], [0, 5], [1], [1], [2]],
  ring: [[1, 3], [2, 0], [3, 1], [0, 2]],
  diamond: [[1, 2], [0, 2, 3], [0, 1, 3], [1, 2]],
} satisfies Record<string, number[][]>;

/** Every valid pointer initialization for a fixed graph; enumeration is verification only. */
export function* rotorAssignments(graph: number[][], prefix: number[] = []): Generator<number[]> {
  if (prefix.length === graph.length) { yield prefix; return; }
  for (let p = 0; p < graph[prefix.length].length; p++) yield* rotorAssignments(graph, [...prefix, p]);
}

export const projects = {
  'rotor-router-exploration-graph': simProject(rotor, 'graphCoverage', {
    defaults: { graph: graphExamples.tree, initialRotors: [0, 0, 0, 0, 0, 0], start: 0 },
    checkSettings: function* () {
      for (const graph of Object.values(graphExamples)) {
        for (const initialRotors of rotorAssignments(graph)) {
          for (let start = 0; start < graph.length; start++) yield { graph, initialRotors, start };
        }
      }
    },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project !== 'rotor-router-exploration-graph') return [];
  return Object.entries(graphExamples).map(([name, graph]) => ({
    name: `${name} · node pointers initially zero`,
    settings: { graph: JSON.stringify(graph), initialRotors: JSON.stringify(graph.map(() => 0)), start: 0 },
  }));
}
