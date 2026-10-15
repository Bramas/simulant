import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('the language service bundles for a browser and works with only virtual source files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-browser-service-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'service.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../../../packages/language-service/src/service.ts', import.meta.url))],
    outfile: file, bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
  const { LanguageService } = await import(pathToFileURL(file).href);
  const files = new Map([
    ['memory:///main.sim', 'import "./library.sim"\ndef result : Nat := twice 2\n'],
    ['memory:///library.sim', 'def twice (x : Nat) : Nat := x + x\n'],
  ]);
  const service = new LanguageService({ read: (uri: string) => files.get(uri), resolve: (from: string, spec: string) => new URL(spec, from).href,
    files: () => files.keys() });
  assert.equal(service.analyze('memory:///main.sim').diagnostics.size, 0);
  assert.equal(service.definition('memory:///main.sim', { line: 1, character: 22 }).uri, 'memory:///library.sim');
  service.setDocument('memory:///library.sim', 'invalid source\n', 1);
  assert.ok(service.analyze('memory:///main.sim').diagnostics.has('memory:///library.sim'));
});
