import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { simProject, type SimSources } from '@bramas/simulant-ui/sim/project';
import { definition, parameterDomainViolations } from '@bramas/simulant-engine/system';
import type { Experiment } from '@bramas/simulant-lang/ir';
import * as h3 from '../sim/h-plus-three.sim';
import * as h1 from '../sim/h-plus-one.sim';
import * as colors from '../sim/two-colors.sim';
import { draw } from './renderer';
import { crashPreset, faultFreePreset } from './presets';

type Settings = { positions: string; phi: number; crashNode: number };

function lineProject(module: SimSources, experiment: string, extraVisibility: number, examples: number[][]) {
  const base = simProject(module, experiment, {
    draw,
    defaults: { positions: [0, 2, 4] },
    checkSettings: function* () {
      for (const positions of examples) {
        for (let crashNode = positions[0]; crashNode <= positions[positions.length - 1] + 1; crashNode++) {
          yield normalize({ positions, crashNode });
        }
      }
    },
  });
  const ir = () => base.experiment!().ir as Experiment;
  const requiredVisibility = (ps: number[]) => definition(ir(), 'requiredVisibility')(ps, extraVisibility) as number;
  // Keep JSON fields textual in saved settings (see the generic editor's known issue).
  const normalize = (given: Record<string, unknown> = {}): Settings => {
    const raw = given.positions ?? base.editorSchema!.fields.find(f => f.key === 'positions')!.defaultValue;
    const positions: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(positions) || positions.length < 2 || !positions.every(p => Number.isSafeInteger(p))) {
      throw new Error('positions must be a JSON array of at least two integer coordinates.');
    }
    const ps = [...positions as number[]].sort((a, b) => a - b);
    const phi = Number(given.phi ?? requiredVisibility(ps));
    if (!Number.isSafeInteger(phi) || phi < 0) {
      throw new Error('Visibility φ must be a nonnegative integer.');
    }
    const crashNode = Number(given.crashNode ?? ps[0]);
    if (!Number.isSafeInteger(crashNode)) {
      throw new Error('The crash node must be an integer coordinate.');
    }
    return { positions: JSON.stringify(ps), phi, crashNode };
  };
  return {
    ...base,
    normalizeSettings: normalize,
    setup: settings => base.setup(normalize(settings ?? {})),
    settingsWarnings: settings => {
      const s = normalize(settings ?? {});
      const ps: number[] = JSON.parse(s.positions);
      const params = { ...s, positions: ps };
      const required = requiredVisibility(ps);
      return parameterDomainViolations(ir(), params).map(name => {
        if (name === 'phi' && s.phi < required) {
          const hole = definition(ir(), 'initialHole')(ps);
          return `Visibility φ = ${s.phi} is too small for this configuration: φ must be at least ${required} (H_init = ${hole}).`;
        }
        return `${name} = ${JSON.stringify(params[name as keyof typeof params])} is outside its declared parameter domain.`;
      });
    },
    check: (settings, options) => base.check!(normalize(settings ?? {}), options),
    checkFirstBranch: (settings, options) => base.checkFirstBranch!(normalize(settings ?? {}), options),
    stateGraph: (settings, options) => base.stateGraph!(normalize(settings ?? {}), options),
    get editorSchema() {
      return { fields: base.editorSchema!.fields.map(f => ({
        ...f, label: ({ positions: 'Initial robot coordinates (JSON)', phi: 'Visibility φ', crashNode: 'Crash node' } as Record<string, string>)[f.key] ?? f.label,
      })) };
    },
    describe: () => {
      const description = base.describe!();
      return {
        ...description,
        caveats: [...description.caveats, 'The where predicates describe the general initial domain; check-all explores only the finite settings supplied by project.ts and does not prove the unbounded theorem.'],
      };
    },
  } satisfies ProjectType<any, any>;
}

export const projects = {
  'standup-gathering-h-plus-three': lineProject(h3, 'hPlusThree', 3, [[0, 2, 4], [0, 1, 2, 4, 6], [0, 1, 3, 4]]),
  'standup-gathering-h-plus-one': lineProject(h1, 'hPlusOne', 1, [[0, 2, 4], [0, 1, 2, 3, 4], [0, 3, 4, 5, 7]]),
  'standup-gathering-two-colors': lineProject(colors, 'twoColors', 0, [[0, 2, 4], [0, 1, 3, 4], [0, 0, 1, 2]]),
};

export function getPredefinedSettings(project: string): PredefinedSetting[] {
  const extra = project.endsWith('h-plus-three') ? 3 : project.endsWith('h-plus-one') ? 1 : 0;
  const preset = (name: string, positions: number[]): PredefinedSetting =>
    faultFreePreset(projects[project as keyof typeof projects], name, positions);
  if (!(project in projects)) return [];
  return [
    preset('Odd occupied nodes · no faults', [0, 2, 4]),
    crashPreset(projects[project as keyof typeof projects], 'Left-border crash · round 1', [0, 2, 4], 0, 1),
    crashPreset(projects[project as keyof typeof projects], 'Interior crash · round 2', [0, 3, 6], 3, 2),
    ...(extra === 1 ? [preset('Five-node block · parity-preserving merges', [0, 1, 2, 3, 4])]
      : [preset('Even occupied nodes · odd span', [0, 1, 3, 4])]),
    crashPreset(projects[project as keyof typeof projects], `Partial crash · round 1${extra === 0 ? ' after Compute' : ''}`, [0, 0, 1, 2], 0, 1, true),
    ...(extra === 0 ? [
      preset('Paper example · odd occupied count', [0, 2, 3, 5, 8, 9, 11, 16, 17]),
      preset('Paper example · even occupied count', [0, 2, 4, 8, 13, 14]),
    ] : []),
  ];
}
