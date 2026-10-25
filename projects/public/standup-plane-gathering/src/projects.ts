import type { AlgorithmSource, CheckReport, ModelDescription, PredefinedSetting, ProjectType } from '@bramas/simulant-core/types/project';
import { agentColor } from '@bramas/simulant-ui/renderers/marks';
import { diameter } from './geometry';
import { makePreview, numericallyGathered, type Preview, type RobotInput, type Scene, type Settings } from './numerical';
import { drawPlane, placement } from './renderer';

export const robot = (x: number, y: number, unit = 1, angle = 0, handedness: 1 | -1 = 1): RobotInput =>
  ({ position: { x, y }, unit, angle, handedness });
export const defaults: Settings = {
  robots: [robot(-4, -2), robot(4, -2, 2, 120, -1), robot(0, 4, 0.5, 250)],
  delta: 0.8, stop: 'minimum', epsilon: 1e-9, crashRobots: [0], crashRound: 0,
};

/** Strict input validation is needed because these settings bypass the .sim typechecker. */
export function normalize(raw: Record<string, unknown> | null | undefined): Settings {
  const values = { ...defaults, ...raw };
  const read = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
  const robots: unknown = read(values.robots), crashes: unknown = read(values.crashRobots);
  if (!Array.isArray(robots) || robots.length < 2 || robots.length > 16) throw new Error('Supply 2–16 robots as a JSON array.');
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (const r of robots) {
    if (!r || !r.position || !finite(r.position.x) || !finite(r.position.y) ||
      Math.abs(r.position.x) > 1e6 || Math.abs(r.position.y) > 1e6 || !finite(r.unit) || r.unit < 1e-9 || r.unit > 1e9 ||
      !finite(r.angle) || Math.abs(r.angle) > 1e6 || ![1, -1].includes(r.handedness)) {
      throw new Error('Each robot needs finite position {x,y} (|coordinate| ≤ 10⁶), unit in [10⁻⁹,10⁹], angle in degrees, and handedness 1 or -1.');
    }
  }
  if (!Array.isArray(crashes) || crashes.some(i => !Number.isInteger(i) || i < 0 || i >= robots.length) || new Set(crashes).size !== crashes.length) {
    throw new Error('crashRobots must contain distinct valid robot indices.');
  }
  const numeric = (value: unknown, label: string) => {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) throw new Error(`${label} must be a number.`);
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${label} must be finite.`);
    return n;
  };
  const delta = numeric(values.delta, 'delta'), epsilon = numeric(values.epsilon, 'epsilon'), crashRound = numeric(values.crashRound, 'crashRound');
  if (!(delta >= 1e-9 && delta <= 1e9)) throw new Error('delta must be between 10⁻⁹ and 10⁹.');
  if (!(epsilon >= 1e-12 && epsilon <= 1e-4)) throw new Error('epsilon must be between 10⁻¹² and 10⁻⁴ (relative to the initial diameter).');
  if (!Number.isInteger(crashRound) || crashRound < 0 || crashRound > 255) throw new Error('crashRound must be an integer from 0 to 255.');
  if (!['rigid', 'minimum', 'alternating'].includes(values.stop)) throw new Error('Unknown stop policy.');
  return { robots, crashRobots: crashes, delta, epsilon, crashRound, stop: values.stop } as Settings;
}

export const source: AlgorithmSource = {
  name: 'SUIG · numerical', file: 'paper, Algorithm 3',
  lines: [
    'one observed point: remain there',
    'A(k): choose the midpoint',
    'B(k): advance 1/9 on the left, 1/10 on the right',
    'C1(k): choose the midpoint',
    'C2(k): left chooses the other point; right chooses the midpoint',
    'C3(k): left chooses the midpoint; right chooses the other point',
    'one distinguished extremity: choose that extremity',
    'otherwise: choose the smallest enclosing circle center',
  ].map((text, i) => ({ number: i + 1, text })),
};

const unavailable = (): CheckReport => ({ status: 'incomplete',
  reason: 'Numerical visualization only: no exhaustive check, .sim experiment or Lean theorem is available.',
  stats: { states: 0, expanded: 0, edges: 0, maxDepth: 0, group: 0 } });

const description = (): ModelDescription => ({
  experiment: 'Planar stand-up indulgent gathering · numerical preview',
  about: 'Bramas, Lamani and Tixeuil, Stand Up Indulgent Gathering (TCS 2023), arXiv:2302.03466v1, Algorithm 3.\n\nFloating-point example trajectories. This companion is implemented in project-local TypeScript. It is not a formal .sim translation. Rendering, approximate predicates and sampled movement policies do not establish the paper theorem.',
  summary: ['Numerical preview', 'FSYNC', 'full visibility', 'no multiplicity detection', 'private coordinate frames'],
  sections: [
    { title: 'Observations and decisions', facts: [
      { label: 'Occupied points', value: 'Positions within ε are treated as one observed location. Counts and crash flags are not passed to the decision function.' },
      { label: 'Frames', value: 'Fixed per robot: rotation, handedness and unit distance. World coordinates are used for drawing.' },
      { label: 'Geometry', value: 'Numerical enclosing circle, collinearity, distance ratios and level intervals.' },
    ] },
    { title: 'Execution and limits', facts: [
      { label: 'Move', value: 'All decisions read the same pre-move configuration. Rigid, minimum-progress or alternating sample stops; δ is not given to the algorithm.' },
      { label: 'Crash', value: 'Selected robots crash before Look at a selected round. They remain visible and fixed. Multiple selected robots must share a location within ε.' },
      { label: 'Stopping', value: 'Stop when the diameter is at most ε or after 256 rounds. ε is a fraction of the initial diameter; physical positions are never snapped together.' },
    ] },
  ],
  step: [
    { phase: 'Fault', what: 'Apply the configured crash event before the snapshot.' },
    { phase: 'Look / Compute', what: 'Deduplicate occupied points numerically; compute every live robot’s target from the same snapshot.' },
    { phase: 'Move', what: 'Apply the configured sample stop to each straight-line movement.' },
  ],
  sources: [{ kind: 'algorithm', name: source.name, file: source.file, lines: source.lines }],
  caveats: [
    'No .sim IR, Lean export, exhaustive search or correctness guarantee. CLI checks return incomplete.',
    'Near dyadic levels, collinearity, coincident points and ratio boundaries, rounding can select a different branch.',
    'The displayed source is a branch guide. The executable numerical implementation is src/numerical.ts.',
    'Algorithm 3 uses 1/10 on the right in B(k). The manuscript footnote mentions 1/8; this preview follows the algorithm box.',
  ],
});

const project: ProjectType<Scene, Preview> = {
  setup: raw => makePreview(normalize(raw)),
  execute: model => {
    const at = (path: number[]) => {
      if (!path.length || path.some(i => i !== 0) || path.length > model.trace.length) throw new Error('No such numerical preview step.');
      return model.trace[path.length - 1];
    };
    return {
      get: at,
      getChildrenCount: path => (at(path), path.length < model.trace.length ? 1 : 0),
      getSiblingCount: path => (at(path), 1),
      getRandomChildIndex: () => 0,
      getEdgeLabel: path => path.length <= 1 ? 'initial numerical configuration' : at(path).decisions!.map((d, i) => `r${i}: ${d.rule}`).join('; '),
    };
  },
  settingsWarnings: raw => {
    try { normalize(raw); return []; }
    catch (e) { return [e instanceof Error ? e.message : String(e)]; }
  },
  drawConfig: drawPlane,
  getAgentsRenderInfo: (C, model, x, y, radius) => placement(C, model, x, y, radius).agents,
  debugConfig: (C, model) => `Numerical round ${C.round}; diameter ${diameter(C.robots.map(r => r.position))}; within ε: ${numericallyGathered(C, model.tolerance)}`,
  inspect: (C, model) => ({
    world: { round: C.round, tolerance: model.tolerance, numericallyCoLocated: numericallyGathered(C, model.tolerance), approximationOnly: true },
    params: model.settings,
    agents: C.robots.map((r, i) => ({ id: i, name: `r${i}`, color: agentColor(i), status: r.crashed ? 'faulty' : 'correct',
      value: { ...r, lastDecision: C.decisions?.[i] ?? null } })),
  }),
  getAlgorithmViewInfo: C => ({ source, agents: C.robots.map((r, i) => ({
    agentId: `r${i}`, index: i, color: agentColor(i), line: C.decisions?.[i].line ?? 0,
    ...(C.decisions?.[i] && !r.crashed ? { explanation: {
      line: C.decisions[i].line,
      frame: `Private frame: rotation ${r.angle}°, handedness ${r.handedness}, unit ${r.unit}`,
      view: { rule: C.decisions[i].rule, level: String(C.decisions[i].level ?? 'not a two-point view'), side: C.decisions[i].side ?? 'not a two-point view' },
      locations: [], move: `Numerical target (drawing coordinates): ${JSON.stringify(C.decisions[i].target)}`, calls: [], event: 'FSYNC',
    } } : {}),
  })) }),
  describe: description,
  check: async () => unavailable(), checkAll: async () => unavailable(), checkFirstBranch: unavailable,
  editorSchema: { fields: [
    { type: 'textarea', key: 'robots', label: 'Robots (JSON: position, unit, angle, handedness)', defaultValue: JSON.stringify(defaults.robots), rows: 7, spellcheck: false },
    { type: 'number', key: 'delta', label: 'Minimum move distance δ (world units)', defaultValue: defaults.delta, min: 1e-9, step: 0.1 },
    { type: 'select', key: 'stop', label: 'Sample movement policy', defaultValue: defaults.stop, options: [
      { value: 'rigid', label: 'Always reach the target' }, { value: 'minimum', label: 'Travel the minimum allowed distance' },
      { value: 'alternating', label: 'Alternate full and partial moves' },
    ] },
    { type: 'text', key: 'crashRobots', label: 'Robot indices that crash (JSON)', defaultValue: JSON.stringify(defaults.crashRobots) },
    { type: 'number', key: 'crashRound', label: 'Crash before Look in round', defaultValue: 0, min: 0, max: 255, step: 1 },
    { type: 'number', key: 'epsilon', label: 'Relative numerical tolerance ε', defaultValue: defaults.epsilon, min: 1e-12, max: 1e-4, step: 1e-9 },
  ] },
};

export const projects = { 'standup-plane-gathering-preview': project };

export function getPredefinedSettings(name: string): PredefinedSetting[] {
  if (name !== 'standup-plane-gathering-preview') return [];
  const preset = (name: string, changes: Partial<Settings>): PredefinedSetting => {
    const s = { ...defaults, ...changes };
    return { name, settings: { ...s, robots: JSON.stringify(s.robots), crashRobots: JSON.stringify(s.crashRobots) } };
  };
  return [
    preset('Triangle · one crash and short moves', {}),
    preset('Triangle · rigid, no crash', { stop: 'rigid', crashRobots: [] }),
    preset('Two occupied points · different local units', { robots: [robot(-1, 0, 32), robot(-1, 0, 1, 180), robot(1, 0, 0.25), robot(1, 0, 4, 180)], stop: 'rigid', crashRobots: [] }),
    preset('Distinguished extremity · aligned points', { robots: [robot(0, 0), robot(1, 0), robot(9, 0)], stop: 'rigid', crashRobots: [] }),
    preset('Crash after motion begins · alternating stops', { crashRound: 2, crashRobots: [1], stop: 'alternating' }),
    preset('Two crashes at one location', { robots: [robot(-3, -2), robot(-3, -2, 4, 180, -1), robot(3, -2), robot(0, 4, 0.5, 90)], crashRobots: [0, 1] }),
  ];
}
