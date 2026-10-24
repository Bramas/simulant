import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import { draw } from './renderer';
import * as algorithm from '../sim/algorithm2.sim';

const initialColors = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]];

export const projects = {
  'myopic-luminous-exploration-three-fsync': simProject(algorithm, 'threeRobotFSync', {
    draw,
    defaults: { N: 7, initialColors: [0, 0, 0] },
    checkSettings: function* () {
      for (let N = 3; N <= 12; N++) {
        for (const colors of initialColors) yield { N, initialColors: colors };
      }
    },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project !== 'myopic-luminous-exploration-three-fsync') return [];
  return initialColors.map(colors => ({
    name: colors.map(c => c === 0 ? 'W' : 'G').join('') + ' · three consecutive starts',
    settings: { N: 7, initialColors: JSON.stringify(colors) },
  }));
}
