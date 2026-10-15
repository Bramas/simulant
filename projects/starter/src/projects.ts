/** The registry: the experiments the page and the CLI show. */
import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as main from './main.sim';
import { draw } from './renderers/ring';

export const projects = {
  'cautious-pair': simProject(main, 'cautiousPair', { draw }),
} satisfies Record<string, ProjectType<any, any>>;

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  switch (project) {
    case 'cautious-pair':
      return [{ name: 'Hole at u2: agent 1 claims it', settings: { N: 6, site: 2 }, path: [0, 0, 0, 0, 0, 0, 0] }];
  }
  return [];
}
