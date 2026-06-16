import type { PredefinedSetting } from '@mobile-entities/simulator-ui/SimulatorApp';
import type { ProjectType } from '@mobile-entities/core/types/project';

import * as BHSearchAlgo6 from './algo6';
import * as BHSearchAlgo5 from './algo5';
import * as BHSearchAlgo4 from './algo4';
import * as BHSearchAlgo3 from './algo3';
import * as BHSearchAlgo2 from './algo2';
import * as BHSearchAlgo1 from './algo1';
import * as BHSearchAlgo0 from './algo0';

export const projects = {
  'black-hole-search-algo0': BHSearchAlgo0,
  'black-hole-search-algo1': BHSearchAlgo1,
  'black-hole-search-algo2': BHSearchAlgo2,
  'black-hole-search-algo3': BHSearchAlgo3,
  'black-hole-search-algo4': BHSearchAlgo4,
  'black-hole-search-algo5': BHSearchAlgo5,
  'black-hole-search-algo6': BHSearchAlgo6,
} as unknown as Record<string, ProjectType<any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  switch (project) {
    case 'black-hole-search-algo0':
      return [
        { name: 'Standard Ring (N=10)', settings: { N: 10, BH_node: 3 } },
      ];
    case 'black-hole-search-algo1':
      return [
        { name: 'Black hole at u3 round 7', settings: { N: 10, BH_node: 3 }, path: [0, 0, 0, 0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo2':
      return [
        { name: 'Case 1', settings: { N: 10, BH_node: 0 }, path: [0, 0, 0, 0, 1] },
        { name: 'Case 2', settings: { N: 10, BH_node: 2 }, path: [0, 0, 0, 0, 1] },
        { name: 'Case 3', settings: { N: 10, BH_node: 1 }, path: [0, 0, 0, 0, 0, 1] },
        { name: 'Case 4', settings: { N: 10, BH_node: 3 }, path: [0, 0, 0, 0, 0, 1] },
        { name: 'Case 5', settings: { N: 10, BH_node: 0 }, path: [0, 0, 0, 0, 0, 0, 1] },
        { name: 'Case 6', settings: { N: 10, BH_node: 2 }, path: [0, 0, 0, 0, 0, 0, 1] },
        { name: 'Case 7', settings: { N: 10, BH_node: 3 }, path: [0, 0, 0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo3':
      return [
        { name: 'Black hole on traveler', settings: { N: 10, BH_node: 4 }, path: [0, 0, 1] },
        { name: 'Black hole on waiter', settings: { N: 10, BH_node: 9 }, path: [0, 0, 1] },
        { name: 'Black hole on 2 agents', settings: { N: 10, BH_node: 0 }, path: [0, 1] },
      ];
    case 'black-hole-search-algo4':
      return [
        { name: 'Black hole on a_3', settings: { N: 10, BH_node: 4 }, path: [0, 0, 1] },
        { name: 'Black hole on a_1', settings: { N: 10, BH_node: 8 }, path: [0, 0, 0, 0, 1] },
        { name: 'Black hole on a_1 and a_2', settings: { N: 10, BH_node: 9 }, path: [0, 0, 0, 0, 1] },
        { name: 'Black hole on a_2 and a_3', settings: { N: 10, BH_node: 0 }, path: [0, 0, 0, 0, 1] },
      ];
    case 'black-hole-search-algo5':
      return [
        { name: 'Black hole on u_4', settings: { N: 10, BH_node: 4 }, path: [0, 0, 1] }
      ];
    case 'black-hole-search-algo6':
      return [
        { name: 'Black hole on u_4', settings: { N: 10, BH_node: 4 }, path: [0, 0, 1] },
      ];
  }
  return [];
}
