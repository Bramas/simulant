/**
 * The presets of black-hole-search were translated from those of the TypeScript simulations
 * (plan, Phase 5.6): a preset path of the new engine shows, step by step, the configurations the
 * old preset showed (recorded before the old engine's removal, in fixtures/migration/presets.json).
 * An old path that was invalid keeps its longest valid prefix.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPredefinedSettings, projects } from '../projects/black-hole-search/src/projects';
import { claimsOf, newView, pathThrough } from './migration';
import recorded from '../projects/black-hole-search/fixtures/migration/presets.json' with { type: 'json' };

type OldPreset = { name: string; settings: { N: number; BH_node: number }; views?: string[] };

test('presets reach the configurations of the old presets', () => {
  for (const [name, presets] of Object.entries(recorded as Record<string, OldPreset[]>)) {
    const project = (projects as any)[name];
    const claims = claimsOf(name);
    const expected = presets.map(preset => {
      const { N, BH_node: site } = preset.settings;
      if (!preset.views) return { name: preset.name, settings: { N, site } };
      const execution = project.execute(project.setup({ N, site }));
      const path = pathThrough(execution, (s: any) => newView(s.config, claims, N), preset.views);
      assert.ok(path, `${name} / ${preset.name}: no matching path in the new engine`);
      return { name: preset.name, settings: { N, site }, path };
    });
    assert.deepEqual(getPredefinedSettings(name), expected, name);
  }
});
