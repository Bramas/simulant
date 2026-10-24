import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import { draw } from './renderer';
import * as algorithm from '../sim/algorithm1.sim';

export const projects = {
  'myopic-async-gathering-phi-one': simProject(algorithm, 'oddBlockPhiOne', {
    draw,
    defaults: { N: 5, positions: [0, 1, 2] },
    checkSettings: function* () {
      for (const N of [5, 6, 7]) yield { N, positions: [0, 1, 2] };
      yield { N: 5, positions: [0, 0, 1, 2] };
      yield { N: 5, positions: [0, 1, 1, 2] };
    },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project !== 'myopic-async-gathering-phi-one') return [];
  return [
    { name: 'Three white robots · independent L/C/M events', settings: { N: 5, positions: '[0,1,2]' } },
    { name: 'Tower at the left border · no multiplicity sensor', settings: { N: 5, positions: '[0,0,1,2]' } },
    { name: 'Five-node odd block · larger exploration', settings: { N: 7, positions: '[0,1,2,3,4]' } },
  ];
}
