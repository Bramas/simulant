import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as algorithm from '../sim/three-robots.sim';

function* settings() {
  for (let N = 4; N <= 12; N++) {
    for (let b = 0; b < N; b++) {
      for (let c = b; c < N; c++) {
        if (b > 0 && 3 * b === N && c === 2 * b) continue;
        yield { N, positions: [0, b, c] };
      }
    }
  }
}

export const projects = {
  'synthesized-ring-gathering-three-fsync': simProject(algorithm, 'threeRobotFSync', {
    defaults: { N: 7, positions: [0, 1, 3] },
    checkSettings: settings,
  }),
  'synthesized-ring-gathering-literal-final-paragraph': simProject(algorithm, 'literalFinalParagraph', {
    defaults: { N: 4, positions: [0, 0, 2] },
    checkSettings: function* () { yield { N: 4, positions: [0, 0, 2] }; },
  }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  if (project === 'synthesized-ring-gathering-literal-final-paragraph') {
    return [{ name: 'Source discrepancy · antipodal tower stays forever', settings: { N: 4, positions: '[0,0,2]' }, path: [0, 0] }];
  }
  if (project !== 'synthesized-ring-gathering-three-fsync') return [];
  return [
    { name: 'Rigid configuration · both extreme-view robots move', settings: { N: 7, positions: '[0,1,3]' } },
    { name: 'Symmetric configuration · adversarial direction', settings: { N: 8, positions: '[0,3,5]' } },
    { name: 'Disoriented tower · isolated robot chooses either shortest path', settings: { N: 4, positions: '[0,0,2]' } },
  ];
}
