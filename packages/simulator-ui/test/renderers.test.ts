import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSim } from '../../vite-plugin/src/index';
import { simProject, type SimModel } from '../src/sim/project';
import type { Snapshot } from '../src/sim/snapshot';

const conformance = compileSim(new URL('../../stdlib/sim/conformance.sim', import.meta.url).pathname).module;

/** A canvas context that records calls (and checks that save and restore balance). */
function recorder() {
  const calls: string[] = [];
  let depth = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.map(a => typeof a === 'number' ? Math.round(a) : a).join(',')})`);
        if (prop === 'save') depth++;
        if (prop === 'restore') depth--;
      };
    },
    set: (target, prop: string, value) => { target[prop] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, depth: () => depth };
}

function draw(experiment: string, settings: Record<string, unknown>, path = [0]) {
  const project = simProject(conformance, experiment) as any;
  const model: SimModel = project.setup(settings);
  const snapshot: Snapshot = project.execute(model).get(path);
  const { ctx, calls, depth } = recorder();
  project.drawConfig(ctx, snapshot, model, { centerX: 100, centerY: 100, radius: 50 });
  assert.equal(depth(), 0);
  const hits = project.getAgentsRenderInfo(snapshot, model, 100, 100, 50);
  return { project, model, snapshot, calls, hits };
}

test('a star is drawn with its center in the middle and its leaves around it', () => {
  const { calls, hits, project, snapshot, model } = draw('starGathering', { k: 4, start: [1, 3] });
  assert.equal(model.info.space, 'Graphs.Star');
  // The center, then four leaves on the circle, clockwise from the top; one segment per edge.
  assert.ok(calls.includes('fillText(u0,100,116)'), calls.join('\n'));
  assert.ok(calls.includes('fillText(u1,100,60)'));
  assert.ok(calls.includes('fillText(u3,100,140)'));
  assert.equal(calls.filter(c => c === 'moveTo(100,100)').length, 4);
  // Agents on leaves 1 and 3, stacked outwards.
  assert.deepEqual(hits.map((h: any) => [h.nodeIndex, Math.round(h.position.x), Math.round(h.position.y)]), [[1, 100, 42], [3, 100, 158]]);
  assert.equal(project.debugConfig(snapshot, model), '.|0|.|1|. {}');
  // One round later both robots are at the center, stacked above it.
  const after = draw('starGathering', { k: 4, start: [1, 3] }, [0, 0]);
  assert.deepEqual(after.hits.map((h: any) => [h.nodeIndex, Math.round(h.position.y)]), [[0, 92], [0, 77]]);
});

test('the line is drawn as a window around the agents and the positions the settings name', () => {
  const { calls, hits, project, snapshot, model } = draw('lights', { positions: [-1, 2], phi: 1, crashNode: 5 });
  assert.equal(model.info.size, 0);
  // From -2 to 6: the agents, the crash node, and one node on each side.
  assert.ok(calls.includes('fillText(-2,50,116)') && calls.includes('fillText(6,150,116)'), calls.join('\n'));
  assert.ok(!calls.some(c => c.startsWith('fillText(-3,') || c.startsWith('fillText(7,')));
  assert.deepEqual(hits.map((h: any) => [h.nodeIndex, Math.round(h.position.x)]), [[-1, 63], [2, 100]]);
  assert.equal(project.debugConfig(snapshot, model), '-1:0|2:1 {"colorCount":3,"crashNode":5}');
});

test('cycles keep the ring renderer, dynamic ones included', () => {
  for (const [experiment, settings] of [['pebbles', { N: 5, site: 2 }], ['dynamicRing', { N: 4, positions: [0, 2] }]] as const) {
    const { calls, model } = draw(experiment, settings);
    assert.equal(model.info.space, 'Graphs.Cycle');
    assert.ok(calls.includes('arc(100,100,50,0,6)'), `${experiment}: ${calls.slice(0, 10).join('\n')}`);
  }
});

test('a step explanation shows the Look: locations, the positions behind them and per-location sensors', async () => {
  const { projects } = await import('../../../projects/standup-gathering/src/projects');
  const project = projects['standup-gathering-two-colors'] as any;
  const execution = project.execute(project.setup({ positions: [0, 2, 4], phi: 2 }));
  // The left-border robot (at 0) moves towards 1 (rule X-in): its view, as is.
  const left = execution.explain([0, 0]).find((e: any) => e?.locations.find((l: any) => l.here).position === 'u0');
  assert.deepEqual(left.locations.map((l: any) => [l.position, l.here, l.neighbors, l.sensors.colors]), [
    ['u-2', false, [1], '[]'], ['u-1', false, [0, 2], '[]'], ['u0', true, [1, 3], '[0]'], ['u1', false, [2, 4], '[]'], ['u2', false, [3], '[0]'],
  ]);
  assert.equal(left.move, 'ℓ3 (u1)');
  // No sensor outside the locations.
  assert.deepEqual(left.view, {});
});
