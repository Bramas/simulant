import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { compileSim, writeSnapshotTypes } from '@bramas/simulant-vite-plugin';

const root = new URL('../../../', import.meta.url).pathname;

test('snapshot types describe the experiment, and type a custom renderer', () => {
  const { module } = compileSim(new URL('../../../projects/black-hole-search/sim/algo1.sim', import.meta.url).pathname);
  const dir = mkdtempSync(join(tmpdir(), 'simulant-types-'));
  try {
    writeSnapshotTypes(module, join(dir, '.simulant/types'));
    // A renderer that reads the composed fields: it typechecks, and a wrong field does not.
    const renderer = (field: string) => `
import type { Snapshot } from './.simulant/types/algo1';
export function siteOf(s: Snapshot): number { return s.world.${field}; }
export function claims(s: Snapshot) { return s.agents.map(a => a.pub.bh === 'cw' && a.flags.dead === false); }
`;
    const diagnostics = (field: string) => {
      writeFileSync(join(dir, 'draw.ts'), renderer(field));
      // The workspace's compiler options and paths, as an editor would use them.
      const base = ts.parseJsonConfigFileContent(ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile).config, ts.sys, root);
      const program = ts.createProgram([join(dir, 'draw.ts')], { ...base.options, noEmit: true, types: [] });
      return ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    };
    assert.deepEqual(diagnostics('site'), []);
    assert.ok(diagnostics('sight').some(m => m.includes("Property 'sight' does not exist")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
