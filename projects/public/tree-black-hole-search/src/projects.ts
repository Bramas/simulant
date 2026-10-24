import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as tree from '../sim/tree.sim';

/** Every increasing parent encoding of the given size; verification inputs, not agent code. */
export function* parentTrees(n: number, prefix = [0]): Generator<number[]> {
  if (prefix.length === n) { yield prefix; return; }
  for (let p = 0; p < prefix.length; p++) yield* parentTrees(n, [...prefix, p]);
}

export const projects = {
  'tree-black-hole-search-two-agents': simProject(tree, 'treeWithHole', {
    defaults: { parents: [0, 0, 0, 1, 1, 2, 5], site: 5 },
    checkSettings: function* () {
      for (let n = 2; n <= 6; n++) {
        for (const parents of parentTrees(n)) {
          for (let site = 1; site < n; site++) yield { parents, site };
        }
      }
    },
  }),
  'tree-black-hole-search-no-hole': simProject(tree, 'treeWithoutHole', {
    defaults: { parents: [0, 0, 0, 1, 1, 2, 5], site: 1 },
    checkSettings: function* () {
      for (let n = 2; n <= 6; n++) for (const parents of parentTrees(n)) yield { parents, site: 1 };
    },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project === 'tree-black-hole-search-no-hole') return [
    { name: 'No black hole · explore and return home', settings: { parents: '[0,0,0,1,1,2,5]', site: 1 } },
  ];
  if (project !== 'tree-black-hole-search-two-agents') return [];
  return [
    { name: 'Branching tree · black hole below the root', settings: { parents: '[0,0,0,1,1,2,5]', site: 5 } },
    { name: 'Star · parallel split detects the missing agent', settings: { parents: '[0,0,0,0,0]', site: 2 } },
    { name: 'Path · single-edge probes', settings: { parents: '[0,0,1,2,3]', site: 4 } },
  ];
}
