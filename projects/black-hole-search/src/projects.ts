import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject, type SimProjectOptions } from '@bramas/simulant-ui/sim/project';
import * as algo0Sim from '../sim/algo0.sim';
import * as algo1Sim from '../sim/algo1.sim';
import * as algo2Sim from '../sim/algo2.sim';
import * as algo3Sim from '../sim/algo3.sim';
import * as algo4Sim from '../sim/algo4.sim';
import * as algo5Sim from '../sim/algo5.sim';
import * as algo6Sim from '../sim/algo6.sim';
const options: SimProjectOptions = {
  agentName: (id: number) => `a₍${id + 1}₎`,
  // The TypeScript simulations called the hole's node `BH_node`: links and saved settings still use it.
  aliases: { BH_node: 'site' },
};

/**
 * The algorithms of the paper, from `sim/*.sim` (migrated from the TypeScript simulations in
 * Phase 7); the page shows their source.
 */
export const projects = {
  'black-hole-search-algo0': simProject(algo0Sim, 'algo0', options),
  'black-hole-search-algo1': simProject(algo1Sim, 'algo1', options),
  'black-hole-search-algo2': simProject(algo2Sim, 'algo2', options),
  'black-hole-search-algo3': simProject(algo3Sim, 'algo3', options),
  'black-hole-search-algo4': simProject(algo4Sim, 'algo4', options),
  /** With the TypeScript simulation's pseudo-random idling; `algo5Sync` is the paper's algorithm without it. */
  'black-hole-search-algo5': simProject(algo5Sim, 'algo5', options),
  /** With the TypeScript simulation's pseudo-random idling (see sim/algo6.sim). */
  'black-hole-search-algo6': simProject(algo6Sim, 'algo6', options),
} satisfies Record<string, ProjectType<any, any>>;

/**
 * Translated from the presets of the TypeScript simulations (tests/presets.test.ts): a path that
 * was invalid there keeps its longest valid prefix.
 */
export function getPredefinedSettings(project: string): PredefinedSetting[] {
  switch (project) {
    case 'black-hole-search-algo0':
      return [
        { name: 'Standard Ring (N=10)', settings: { N: 10, site: 3 } },
      ];
    case 'black-hole-search-algo1':
      return [
        { name: 'Black hole at u3 round 7', settings: { N: 10, site: 3 }, path: [0, 0, 0, 0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo2':
      return [
        { name: 'Case 1', settings: { N: 10, site: 0 }, path: [0, 0, 0, 0, 1] },
        { name: 'Case 2', settings: { N: 10, site: 2 }, path: [0, 0, 0, 0, 1] },
        { name: 'Case 3', settings: { N: 10, site: 1 }, path: [0, 0, 0, 0, 0, 1] },
        { name: 'Case 4', settings: { N: 10, site: 3 }, path: [0, 0, 0, 0, 0, 1] },
        { name: 'Case 5', settings: { N: 10, site: 0 }, path: [0, 0, 0, 0, 0, 0, 1] },
        { name: 'Case 6', settings: { N: 10, site: 2 }, path: [0, 0, 0, 0, 0, 0, 1] },
        { name: 'Case 7', settings: { N: 10, site: 3 }, path: [0, 0, 0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo3':
      return [
        { name: 'Black hole on traveler', settings: { N: 10, site: 4 }, path: [0, 0] },
        { name: 'Black hole on waiter', settings: { N: 10, site: 9 }, path: [0, 0, 1] },
        { name: 'Black hole on 2 agents', settings: { N: 10, site: 0 }, path: [0, 1] },
      ];
    case 'black-hole-search-algo4':
      return [
        { name: 'Black hole on a_3', settings: { N: 10, site: 4 }, path: [0, 0] },
        { name: 'Black hole on a_1', settings: { N: 10, site: 8 }, path: [0, 0, 0, 0] },
        { name: 'Black hole on a_1 and a_2', settings: { N: 10, site: 9 }, path: [0, 0, 0, 0, 1] },
        { name: 'Black hole on a_2 and a_3', settings: { N: 10, site: 0 }, path: [0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo5':
      return [
        { name: 'Black hole on u_4', settings: { N: 10, site: 4 }, path: [0, 0] },
      ];
    case 'black-hole-search-algo6':
      return [
        { name: 'Black hole on u_4', settings: { N: 10, site: 4 }, path: [0, 0] },
      ];
  }
  return [];
}
