import type { PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import type { Successor } from '@bramas/simulant-engine/system';

/** Round 0 is initial. Branches are selected by effects, so recordings survive
 * changes to the ordering of adversary choices. */
function recordedPreset(
  project: ProjectType,
  name: string,
  positions: number[],
  select: (successor: Successor, round: number, origin: number) => boolean,
  lastEvent = 0,
): PredefinedSetting {
  const settings = project.normalizeSettings!({ positions });
  const { system }: SimModel = project.setup(settings);
  let config = system.initial()[0].config;
  const path = [0];
  for (let round = 1; round <= 50; round++) {
    const next = system.successors(config);
    const branch = next.findIndex(s => select(s, round, Number(settings.phi) + 1));
    if (branch < 0) throw new Error(`${name}: no matching branch at round ${round}`);
    path.push(branch);
    config = next[branch].config;
    if (round >= lastEvent && system.verdict(config) === 'success') return { name, settings, path };
  }
  throw new Error(`${name}: the recorded execution did not gather`);
}

export function faultFreePreset(project: ProjectType, name: string, positions: number[]): PredefinedSetting {
  return recordedPreset(project, name, positions, s => s.config.agents.every(a => !a.f.crashed));
}

/** The crash coordinate and time select an execution, rather than restricting the model. */
export function crashPreset(
  project: ProjectType,
  name: string,
  positions: number[],
  coordinate: number,
  round: number,
  partial = false,
  afterCompute = false,
): PredefinedSetting {
  const count = partial ? 1 : positions.filter(p => p === coordinate).length;
  if (!count) throw new Error(`${name}: no robot starts at the crash coordinate`);
  return recordedPreset(project, name, positions, (s, r, origin) => {
    const crashed = s.config.agents.filter(a => a.f.crashed);
    if (r < round) return crashed.length === 0;
    if (crashed.length !== count || !crashed.every(a => a.pos === origin + coordinate)) return false;
    return r !== round || !afterCompute || s.witness.some(w => w.label.startsWith('crash after Compute:'));
  }, round);
}
