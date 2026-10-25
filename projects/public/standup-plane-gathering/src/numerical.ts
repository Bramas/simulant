/** Numerical companion to arXiv:2302.03466v1, Algorithm 3. Not a .sim backend. */
import { diameter, distance, distinctPoints, distinguishedExtreme, smallestCircle, towards, type Circle, type Point } from './geometry';

export type RobotInput = { position: Point; unit: number; angle: number; handedness: 1 | -1 };
export type Robot = RobotInput & { crashed: boolean };
export type StopPolicy = 'rigid' | 'minimum' | 'alternating';
export type Settings = { robots: RobotInput[]; crashRobots: number[]; crashRound: number; delta: number; stop: StopPolicy; epsilon: number };
export type Decision = { target: Point; rule: string; line: number; level?: number; side?: 'left' | 'right' };
export type Scene = { round: number; robots: Robot[]; previous?: Point[]; decisions?: Decision[] };
export type Preview = { settings: Settings; tolerance: number; initialCircle: Circle; trace: Scene[]; limit: number };
export const MAX_ROUNDS = 256;

/** i satisfies 2^-i <= d < 2^(1-i), evaluated with IEEE doubles. */
export function levelOf(d: number): number {
  if (!(d > 0) || !Number.isFinite(d)) throw new Error('A local distance must be positive and finite.');
  return -Math.floor(Math.log2(d)) || 0;
}

export function phaseOf(level: number): { phase: 'A' | 'B' | 'C1' | 'C2' | 'C3'; k: number } {
  if (level <= 0) return { phase: 'A', k: 0 };
  const k = Math.floor(Math.sqrt(level + 1)) - 1;
  const offset = level - k * (k + 2);
  const phase = offset < k ? 'A' : offset < 2 * k ? 'B' : offset === 2 * k ? 'C1' : offset === 2 * k + 1 ? 'C2' : 'C3';
  return { phase, k };
}

/** Coordinates in a fixed, private orthonormal frame. unit is world length per local unit. */
export function localCoordinates(robot: RobotInput, point: Point): Point {
  const angle = robot.angle * Math.PI / 180;
  const dx = point.x - robot.position.x, dy = point.y - robot.position.y;
  return { x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / robot.unit,
    y: robot.handedness * (-dx * Math.sin(angle) + dy * Math.cos(angle)) / robot.unit };
}

/** This function has no access to crash flags, robot identities, delta or the stop policy. */
export function decide(robot: RobotInput, occupied: Point[], tolerance: number): Decision {
  if (occupied.length <= 1) return { target: robot.position, rule: 'one occupied point', line: 1 };
  if (occupied.length === 2) {
    const other = occupied.find(p => distance(p, robot.position) > tolerance)!;
    const local = localCoordinates(robot, other);
    const level = levelOf(Math.hypot(local.x, local.y));
    const { phase, k } = phaseOf(level);
    const axisTolerance = tolerance / robot.unit;
    const side = local.x > axisTolerance || (Math.abs(local.x) <= axisTolerance && local.y > 0) ? 'left' : 'right';
    const fraction = phase === 'B' ? (side === 'left' ? 1 / 9 : 1 / 10)
      : phase === 'C2' ? (side === 'left' ? 1 : 0.5)
      : phase === 'C3' ? (side === 'right' ? 1 : 0.5) : 0.5;
    const line = { A: 2, B: 3, C1: 4, C2: 5, C3: 6 }[phase];
    return { target: towards(robot.position, other, fraction), rule: `${phase}(${k}), ${side}, fraction ${fraction}`, line, level, side };
  }
  const extreme = distinguishedExtreme(occupied, tolerance);
  return extreme ? { target: extreme, rule: 'unique distinguished extremity', line: 7 }
    : { target: smallestCircle(occupied, tolerance).center, rule: 'smallest enclosing circle', line: 8 };
}

export function numericallyGathered(scene: Scene, tolerance: number): boolean {
  return diameter(scene.robots.map(r => r.position)) <= tolerance;
}

function applyCrash(scene: Scene, settings: Settings, tolerance: number): Scene {
  const robots = scene.robots.map(r => ({ ...r }));
  if (scene.round === settings.crashRound && settings.crashRobots.length) {
    const location = robots[settings.crashRobots[0]].position;
    if (!settings.crashRobots.every(i => distance(robots[i].position, location) <= tolerance)) {
      throw new Error(`At round ${scene.round}, selected robots are not co-located. Crashes must share one location.`);
    }
    settings.crashRobots.forEach(i => { robots[i].crashed = true; });
  }
  return { ...scene, robots };
}

export function nextScene(scene: Scene, settings: Settings, tolerance: number): Scene {
  const robots = applyCrash(scene, settings, tolerance).robots;
  const occupied = distinctPoints(robots.map(r => r.position), tolerance);
  const decisions = robots.map(r => r.crashed ? { target: r.position, rule: 'crashed; remains visible', line: 0 } : decide(r, occupied, tolerance));
  const next: Scene = { round: scene.round + 1, previous: robots.map(r => r.position), decisions,
    robots: robots.map((r, i) => {
      if (r.crashed) return r;
      const target = decisions[i].target;
      const d = distance(r.position, target);
      const minimum = Math.min(settings.delta, d);
      const travel = settings.stop === 'rigid' || (settings.stop === 'alternating' && (scene.round + i) % 2 === 0)
        ? d : settings.stop === 'minimum' ? minimum : minimum + (d - minimum) / 2;
      return { ...r, position: d === 0 ? r.position : towards(r.position, target, travel / d) };
    }) };
  // A displayed round is ready for Look, with that round's crash already visible.
  return applyCrash(next, settings, tolerance);
}

export function makePreview(settings: Settings): Preview {
  const initial: Scene = { round: 0, robots: settings.robots.map(r => ({ ...r, crashed: false })) };
  const tolerance = settings.epsilon * Math.max(diameter(settings.robots.map(r => r.position)), Number.MIN_VALUE);
  const initialCircle = smallestCircle(settings.robots.map(r => r.position), tolerance);
  const trace = [applyCrash(initial, settings, tolerance)];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const current = trace[trace.length - 1];
    if (numericallyGathered(current, tolerance)) break;
    trace.push(nextScene(current, settings, tolerance));
  }
  return { settings, trace, tolerance, initialCircle, limit: MAX_ROUNDS };
}
