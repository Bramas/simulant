import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProject } from '../packages/cli/src/project-registry';
import { diameter, distance, distinctPoints, distinguishedExtreme, smallestCircle, type Point } from '../projects/public/standup-plane-gathering/src/geometry';
import { decide, levelOf, makePreview, nextScene, numericallyGathered } from '../projects/public/standup-plane-gathering/src/numerical';
import { defaults, getPredefinedSettings, normalize, projects, robot } from '../projects/public/standup-plane-gathering/src/projects';
import { placement } from '../projects/public/standup-plane-gathering/src/renderer';

const name = 'standup-plane-gathering-preview';
const project = projects[name];
const close = (a: Point, b: Point, epsilon = 1e-8) => assert.ok(distance(a, b) <= epsilon, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

test('planar preview is discoverable but exposes no formal experiment, verdict or exhaustive success', async () => {
  assert.equal(await loadProject(name), project);
  assert.equal(project.experiment, undefined);
  assert.equal(project.verdict, undefined);
  assert.equal(project.executionStatusChecker, undefined);
  assert.equal(project.describe!().ir, undefined);
  assert.equal(project.describe!().lean, undefined);
  for (const check of [project.check!(defaults), project.checkAll!(), project.checkFirstBranch!(defaults)]) {
    assert.equal((await check).status, 'incomplete');
  }
  assert.match(project.describe!().caveats.join(' '), /rounding/);
});

test('numerical circle supports acute, obtuse, collinear and duplicate-point configurations', () => {
  const equilateral = smallestCircle([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: Math.sqrt(3) }], 1e-10);
  close(equilateral.center, { x: 1, y: Math.sqrt(3) / 3 });
  assert.ok(Math.abs(equilateral.radius - 2 / Math.sqrt(3)) < 1e-10);
  const obtuse = smallestCircle([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 0.5 }], 1e-10);
  close(obtuse.center, { x: 2, y: 0 });
  assert.equal(obtuse.radius, 2);
  const line = smallestCircle([{ x: 0, y: 2 }, { x: 9, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 2 }], 1e-10);
  close(line.center, { x: 4.5, y: 2 });
  assert.equal(line.radius, 4.5);
  const one = smallestCircle([{ x: 3, y: -2 }, { x: 3, y: -2 }], 1e-10);
  assert.equal(one.radius, 0);
});

test('Algorithm 3 level slices and side-dependent fractions match the source branch table', () => {
  assert.equal(levelOf(0.25), 2);
  assert.equal(levelOf(0.5 - Number.EPSILON), 2);
  assert.equal(levelOf(0.5), 1);
  assert.equal(levelOf(2), -1);
  const expectations: [number, number, number][] = [
    [-3, 0.5, 0.5], [0, 0.5, 0.5], [1, 1, 0.5], [2, 0.5, 1],
    [3, 0.5, 0.5], [4, 1 / 9, 1 / 10], [5, 0.5, 0.5], [6, 1, 0.5], [7, 0.5, 1],
    [8, 0.5, 0.5], [9, 0.5, 0.5], [10, 1 / 9, 1 / 10], [11, 1 / 9, 1 / 10],
    [12, 0.5, 0.5], [13, 1, 0.5], [14, 0.5, 1],
  ];
  for (const [level, left, right] of expectations) {
    for (const [angle, fraction] of [[0, left], [180, right]]) {
      const r = robot(0, 0, 2 ** level, angle);
      const d = decide(r, [{ x: 0, y: 0 }, { x: 1, y: 0 }], 1e-12);
      assert.equal(d.level, level);
      close(d.target, { x: fraction, y: 0 });
    }
  }
});

test('a unique distinguished extremity is selected; ambiguous or non-collinear views use the circle', () => {
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }];
  close(distinguishedExtreme(points, 1e-10)!, points[0]);
  close(decide(robot(9, 0), points, 1e-10).target, points[0]);
  const symmetric = [...points, { x: 8, y: 0 }];
  assert.equal(distinguishedExtreme(symmetric, 1e-10), undefined);
  assert.equal(decide(robot(0, 0), symmetric, 1e-10).line, 8);
  const triangle = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }];
  assert.equal(distinguishedExtreme(triangle, 1e-10), undefined);
  assert.equal(decide(robot(0, 0), triangle, 1e-10).line, 8);
});

test('decisions cannot see multiplicity or crashes; FSYNC targets share one snapshot', () => {
  const points = [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  const duplicated = distinctPoints([...points, points[0], points[1]], 1e-10);
  assert.deepEqual(decide(robot(-1, 0), points, 1e-10), decide(robot(-1, 0), duplicated, 1e-10));
  const model = makePreview({ ...defaults, robots: [robot(-1, 0), robot(1, 0)], stop: 'rigid', crashRobots: [] });
  assert.equal(model.trace.length, 2);
  for (const r of model.trace[1].robots) close(r.position, { x: 0, y: 0 });
});

test('private rotations, reflections and units give covariant targets away from numerical boundaries', () => {
  const transform = (p: Point): Point => ({ x: 13 - 3 * p.y, y: -7 - 3 * p.x }); // scaled reflection
  const points = [{ x: -1, y: -0.3 }, { x: 1.3, y: 0.7 }];
  for (const unit of [0.7, 2.3, 8.7]) {
    const r = robot(points[0].x, points[0].y, unit, 37, -1);
    const mapped = { ...r, position: transform(r.position), unit: 3 * unit, angle: -90 - r.angle, handedness: 1 as const };
    close(decide(mapped, points.map(transform), 3e-10).target, transform(decide(r, points, 1e-10).target));
  }
});

test('presets run to numerical co-location with fixed crash bodies and admissible sampled progress', () => {
  for (const preset of getPredefinedSettings(name)) {
    const model = project.setup(preset.settings);
    assert.ok(model.trace.length > 1);
    assert.ok(numericallyGathered(model.trace.at(-1)!, model.tolerance), preset.name);
    for (let t = 1; t < model.trace.length; t++) {
      const before = model.trace[t - 1], after = model.trace[t];
      after.robots.forEach((r, i) => {
        const moved = distance(before.robots[i].position, r.position);
        if (before.robots[i].crashed) assert.equal(moved, 0);
        else {
          const targetDistance = distance(before.robots[i].position, after.decisions![i].target);
          assert.ok(moved + 1e-10 >= Math.min(targetDistance, model.settings.delta));
          assert.ok(moved <= targetDistance + 1e-10);
        }
      });
    }
    const end = model.trace.at(-1)!;
    for (const i of model.settings.crashRobots) {
      close(end.robots[i].position, model.trace[model.settings.crashRound].robots[i].position);
      assert.ok(end.robots.every(r => distance(r.position, end.robots[i].position) <= model.tolerance));
    }
    const execution = project.execute(model);
    assert.equal(execution.getChildrenCount([0]), 1);
    assert.equal(execution.getChildrenCount(model.trace.map(() => 0)), 0);
    assert.throws(() => execution.get([0, 1]));
  }
});

test('bad numeric settings and crashes at distinct locations are rejected explicitly', () => {
  for (const settings of [
    { robots: [] }, { robots: [robot(0, 0), { ...robot(1, 0), unit: 0 }] },
    { crashRobots: [99] }, { crashRobots: [0, 0] }, { epsilon: 0 }, { delta: -1 }, { delta: true }, { delta: '' }, { crashRound: 0.5 },
  ]) assert.throws(() => project.setup(settings));
  assert.throws(() => project.setup({ ...defaults, crashRobots: [0, 1] }), /not co-located/);
  assert.equal(normalize({ ...defaults, robots: JSON.stringify(defaults.robots) }).robots.length, 3);
});

test('numerical observations and canvas placement leave distinct physical coordinates untouched', () => {
  const robots = [robot(0, 0), robot(1e-12, 0)].map(r => ({ ...r, crashed: false }));
  const next = nextScene({ round: 0, robots }, { ...defaults, robots, crashRobots: [] }, 1e-9);
  assert.ok(numericallyGathered(next, 1e-9));
  assert.notDeepEqual(next.robots[0].position, next.robots[1].position);
  const model = project.setup(undefined);
  const C = model.trace[2];
  const saved = JSON.stringify(C);
  const layout = placement(C, model, 300, 200, 100);
  assert.ok(layout.agents.every(a => Number.isFinite(a.position.x) && Number.isFinite(a.position.y)));
  assert.equal(JSON.stringify(C), saved);
  assert.ok(diameter(C.robots.map(r => r.position)) > model.tolerance);
});
