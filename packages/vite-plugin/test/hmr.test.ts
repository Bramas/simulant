/**
 * Hot updates through a real Vite development server (plan, Section 6.7):
 * a saved `.sim` file and a saved renderer are each updated in place (they
 * accept their own updates), not by reloading the page.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, type HotPayload } from 'vite';
import { simulant } from '@bramas/simulant-vite-plugin';

const repo = new URL('../../../', import.meta.url).pathname;

test('a saved .sim file and a saved renderer are hot updates of themselves', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'simulant-hmr-'));
  cpSync(join(repo, 'projects/starter/src/main.sim'), join(dir, 'main.sim'));
  writeFileSync(join(dir, 'renderer.ts'), `import { defineRenderer } from '${repo}packages/simulator-ui/src/renderers/define';
export const draw = defineRenderer('hmr-test', () => undefined);
`);
  writeFileSync(join(dir, 'entry.ts'), `import * as m from './main.sim';\nimport { draw } from './renderer';\nexport { m, draw };\n`);
  const server = await createServer({
    root: dir, configFile: false, logLevel: 'silent', plugins: [simulant({ types: false })],
    server: { port: 0, fs: { allow: [repo, dir] }, watch: { usePolling: true, interval: 50 } },
    optimizeDeps: { noDiscovery: true },
  });
  const payloads: HotPayload[] = [];
  // Vite 6 sends updates on the client environment's channel.
  for (const hot of [server.hot, server.environments.client.hot]) {
    const send = hot.send.bind(hot);
    hot.send = ((p: HotPayload) => { payloads.push(p); return send(p as any); }) as typeof hot.send;
  }
  try {
    await server.listen();
    for (const id of ['/entry.ts', '/main.sim?import', '/renderer.ts']) await server.transformRequest(id);
    const sim = (await server.transformRequest('/main.sim?import'))!.code;
    assert.match(sim, /import\.meta\.hot\.accept\(/);
    const updateOf = async (file: string, edit: (s: string) => string) => {
      payloads.length = 0;
      writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf8')));
      for (let i = 0; i < 100 && !payloads.some(p => p.type === 'update' || p.type === 'full-reload'); i++) await new Promise(r => setTimeout(r, 50));
      return payloads.find(p => p.type === 'update' || p.type === 'full-reload');
    };
    const simUpdate = await updateOf('main.sim', s => s.replace('(range 9)', '(range 8)'));
    assert.equal(simUpdate?.type, 'update', JSON.stringify(payloads));
    if (simUpdate?.type === 'update') assert.deepEqual(simUpdate.updates.map(u => [u.path, u.acceptedPath]), [['/main.sim', '/main.sim']]);
    const drawUpdate = await updateOf('renderer.ts', s => s.replace('() => undefined', '() => { /* changed */ }'));
    assert.equal(drawUpdate?.type, 'update', JSON.stringify(payloads));
    if (drawUpdate?.type === 'update') assert.deepEqual(drawUpdate.updates.map(u => [u.path, u.acceptedPath]), [['/renderer.ts', '/renderer.ts']]);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
