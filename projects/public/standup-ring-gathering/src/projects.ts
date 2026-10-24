import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as rendezvous from '../sim/rendezvous.sim';

export const projects = {
  'standup-ring-gathering-two-fsync': simProject(rendezvous, 'twoRobotFSync', {
    defaults: { N: 10, offset: 4 },
    checkSettings: function* () {
      for (let N = 6; N <= 20; N += 2) {
        for (let offset = 2; offset < N; offset += 2) {
          if (2 * offset !== N) yield { N, offset };
        }
      }
    },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project !== 'standup-ring-gathering-two-fsync') return [];
  return [
    { name: 'Two robots · unequal even arcs', settings: { N: 10, offset: 4 } },
    { name: 'Smallest admitted cycle', settings: { N: 6, offset: 2 } },
    { name: 'Longer approach · crashes may occur each round', settings: { N: 18, offset: 8 } },
  ];
}
