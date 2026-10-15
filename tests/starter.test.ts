import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explore } from '@bramas/simulant-engine/explorer';
import { getPredefinedSettings, projects } from '../projects/starter/src/projects';

const project = projects['cautious-pair'] as any;

test('the starter experiment identifies the hole on every setting', () => {
  let count = 0;
  for (const settings of project.settingsGenerator()) {
    const r = explore(project.setup(settings).system);
    assert.equal(r.status, 'success', `${JSON.stringify(settings)}: ${r.reason}`);
    count++;
  }
  assert.equal(count, 2 + 3 + 4 + 5 + 6 + 7);
});

test('the starter preset reaches the claim, and the custom renderer shows it', () => {
  const [preset] = getPredefinedSettings('cautious-pair');
  const model = project.setup(preset.settings);
  const snapshot = project.execute(model).get(preset.path!);
  // Agents are in the configuration's canonical order, not by identifier.
  const byId = [...snapshot.agents].sort((a: any, b: any) => a.id - b.id);
  assert.deepEqual(byId.map((a: any) => [a.pos, a.present, a.pub.bh]), [[2, false, null], [1, true, 'cw']]);
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => k in t ? t[k] : k === 'fillText' ? (s: string) => texts.push(s) : () => {},
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  project.drawConfig(ctx, snapshot, model, { centerX: 100, centerY: 100, radius: 50 });
  assert.ok(texts.includes('hole: cw'), texts.join(', '));
  // Hit positions come from the custom renderer's layout.
  assert.equal(project.getAgentsRenderInfo(snapshot, model, 100, 100, 50).length, 2);
});
