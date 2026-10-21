import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { simulant, type SimModule } from '@bramas/simulant-vite-plugin';

const MAIN = (imports: string) => `import "./model.sim"
import "std/examples.sim"
${imports}
experiment e where
  model := myModel
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [5]
  param site : Pos in [pos 2]
  agents := 2
  position i := pos 0
`;
const MODEL = (policy: string) => `import "std/models.sim"
def myModel : Model := blackHoleRobots (Graphs.Cycle (param N)) .${policy} .unknown
`;

/** Writes a file and tells the server's watcher, as an editor's save would. */
async function save(server: ViteDevServer, file: string, text: string, event: 'change' | 'add' = 'change') {
  writeFileSync(file, text);
  server.watcher.emit(event, file);
  await new Promise(r => setTimeout(r, 50));
}

async function load(server: ViteDevServer): Promise<SimModule> {
  return await server.ssrLoadModule('/main.sim') as SimModule;
}

test('a .sim module recompiles when an import changes, reports errors, and recovers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'simulant-vite-'));
  const main = join(dir, 'main.sim'), model = join(dir, 'model.sim'), extra = join(dir, 'extra.sim');
  writeFileSync(main, MAIN(''));
  writeFileSync(model, MODEL('initiallyPresent'));
  const server = await createServer({
    root: dir, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, watch: null }, plugins: [simulant()],
  });
  try {
    let m = await load(server);
    assert.deepEqual(m.diagnostics, []);
    assert.equal(m.experiments.e.model.components[0].args!.policy, 'initiallyPresent');
    const r1 = m.revision;

    // Editing an import recompiles the entry.
    await save(server, model, MODEL('mayEmerge'));
    m = await load(server);
    assert.equal(m.experiments.e.model.components[0].args!.policy, 'mayEmerge');
    assert.notEqual(m.revision, r1);

    // An invalid edit gives diagnostics at the source position, and no experiment.
    await save(server, model, 'import "std/models.sim"\ndef myModel : Model := blackHoleRobots (Graphs.Cycle (param N)) .mayEmerge .unknown (extra :=\n');
    m = await load(server);
    assert.deepEqual(m.experiments, {});
    assert.equal(m.diagnostics[0].file, model);
    assert.equal(m.diagnostics[0].line, 3);

    // The next valid save recovers.
    await save(server, model, MODEL('initiallyPresent'));
    m = await load(server);
    assert.deepEqual(m.diagnostics, []);
    assert.ok(m.experiments.e);

    // A missing import is reported, and creating it recovers.
    await save(server, main, MAIN('import "./extra.sim"'));
    m = await load(server);
    assert.match(m.diagnostics[0].message, /cannot read module .*extra\.sim/);
    await save(server, extra, '-- nothing yet\n', 'add');
    m = await load(server);
    assert.deepEqual(m.diagnostics, []);
    assert.ok(m.experiments.e);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
