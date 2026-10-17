import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import solid from 'vite-plugin-solid';
import { simulant } from '../../packages/vite-plugin/src/index';
import { projectViteConfig } from '../../scripts/project-vite-config';

// Optional browser suite: normal `pnpm test` needs neither Playwright nor Chromium.
const require = createRequire(import.meta.url);
function playwright() {
  if (process.env.SIMULANT_PLAYWRIGHT_MODULE) return require(process.env.SIMULANT_PLAYWRIGHT_MODULE);
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  // Python's Playwright installation also ships the Node API and its matching browsers.
  const module = execFileSync('python3', ['-c', 'from pathlib import Path; import playwright; print(Path(playwright.__file__).parent / "driver/package")'], { encoding: 'utf8' }).trim();
  return require(module);
}
const { chromium } = playwright();
const repo = fileURLToPath(new URL('../../', import.meta.url));

test('Chromium browser acceptance', { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-browser-'));
  const servers: ViteDevServer[] = [];
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await Promise.all(servers.map(server => server.close()));
    await rm(directory, { recursive: true, force: true });
  });
  await cp(join(repo, 'projects/starter/src'), join(directory, 'src'), { recursive: true });
  await cp(join(repo, 'projects/starter/web'), join(directory, 'web'), { recursive: true });
  await cp(join(repo, 'projects/starter/package.json'), join(directory, 'package.json'));
  await writeFile(join(directory, 'web/tsconfig.json'), JSON.stringify({ extends: join(repo, 'tsconfig.base.json') }));
  await symlink(join(repo, 'node_modules'), join(directory, 'node_modules'), 'dir');

  const serve = async (root: string, config: ReturnType<typeof projectViteConfig>) => {
    const server = await createServer({
      ...config, root, configFile: false, logLevel: 'error',
      cacheDir: join(directory, `vite-cache-${servers.length}`),
      server: { host: '127.0.0.1', port: 0, fs: { allow: [repo, directory] }, watch: { usePolling: true, interval: 50 } },
    });
    servers.push(server);
    await server.listen();
    return server.resolvedUrls!.local[0];
  };
  const starterConfig = projectViteConfig('starter');
  starterConfig.plugins = [solid(), simulant({ types: false })];
  const starterUrl = await serve(join(directory, 'web'), starterConfig);
  const blackHoleUrl = await serve(join(repo, 'projects/black-hole-search/web'), projectViteConfig('black-hole-search'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  page.on('console', (message: any) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', async (response: any) => {
    if (response.status() >= 400) t.diagnostic(`${response.status()} ${response.url()}: ${(await response.text()).slice(0, 2000)}`);
  });
  page.on('dialog', async (dialog: any) => {
    errors.push(`Unexpected dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });
  const round = (n: number) => page.waitForFunction((n: number) => document.querySelector('.sim-round-value')?.textContent === String(n), n);
  const branch = (text: string) => page.waitForFunction((text: string) => document.querySelector('.sim-branch')?.textContent === text, text);
  /** The configuration the state inspector shows, as JSON (`textContent()` like the former debug string). */
  const debug = () => ({ textContent: () => page.locator('.state-inspector').getAttribute('data-state') });
  const next = () => page.getByRole('button', { name: 'Next step', exact: true }).click();
  /** The first agent of the starter, on the ring's top node: the stage centers the ring (`geometry` in SimulatorApp). */
  const firstAgent = async () => {
    const box = (await page.locator('canvas').first().boundingBox())!;
    const radius = Math.max(40, Math.min(box.width, box.height) / 2 - 68);
    return { x: box.width / 2, y: box.height / 2 - radius - 7.7 };
  };
  const drawn = async () => assert.ok(await page.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));

  await t.test('starter navigation, presets, canvas selection and graph worker', async () => {
    await page.goto(starterUrl);
    await round(0);
    await drawn();
    const initial = await debug().textContent();
    await next();
    await round(1);
    assert.notEqual(await debug().textContent(), initial);
    await page.getByRole('button', { name: 'Previous step', exact: true }).click();
    await round(0);
    assert.equal(await debug().textContent(), initial);
    await page.locator('canvas').first().click({ position: await firstAgent() });
    await page.locator('.state-inspector .si-agent.si-selected').waitFor();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    assert.equal(await page.locator('.state-inspector .si-agent.si-selected').count(), 0);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    assert.equal(await page.getByLabel('N', { exact: true }).inputValue(), '6');
    for (let i = 0; i < 6; i++) await next();
    await round(6);
    assert.match(await page.locator('.state-inspector').getAttribute('data-state') ?? '', /"bh":"cw"/);
    await page.getByRole('tab', { name: 'Graph', exact: true }).click();
    await page.getByLabel('Max depth (rounds)').fill('8');
    await page.getByRole('button', { name: 'Generate graph', exact: true }).click();
    await page.locator('.cg-stats').waitFor();
    assert.match(await page.locator('.cg-stats .sim-chip').first().innerText(), /^[1-9]\d* nodes/);
    assert.deepEqual(errors, []);
  });

  await t.test('panels move between docks, and the explanation card overlays the code', async () => {
    await page.goto(starterUrl);
    await round(0);
    const dockOf = (panel: string) => page.locator(`[data-panel="${panel}"]`).evaluate((e: Element) => e.parentElement!.getAttribute('aria-label'));
    assert.equal(await dockOf('state'), 'Below the configuration');
    await page.getByRole('button', { name: 'Move state', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Right side bar' }).click();
    assert.equal(await dockOf('state'), 'Right side bar');
    await page.getByRole('button', { name: 'Reset the panel layout', exact: true }).click();
    assert.equal(await dockOf('state'), 'Below the configuration');
    // The card opens under the cursor without moving the code.
    const line = page.locator('.algorithm-line.highlighted').first();
    const before = await line.boundingBox();
    await page.locator('.agent-marker').first().click();
    await page.locator('.ex-card').waitFor();
    assert.deepEqual(await line.boundingBox(), before);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ex-card').count(), 0);
    assert.deepEqual(errors, []);
  });

  const sourceFile = join(directory, 'src/main.sim');
  await t.test('initial settings outside the domains warn and still allow execution', async () => {
    await page.goto(starterUrl);
    const warning = page.locator('.sim-settings').getByRole('alert');
    assert.equal(await warning.count(), 0);
    await page.getByLabel('site', { exact: true }).fill('0');
    await warning.waitFor();
    assert.match(await warning.innerText(), /site = 0 is outside its declared parameter domain/);
    await next();
    await round(1);
    await page.getByLabel('site', { exact: true }).fill('5');
    await page.getByLabel('N', { exact: true }).fill('5');
    assert.match(await warning.innerText(), /site = 5 is outside/);
    await page.getByLabel('N', { exact: true }).fill('6');
    await warning.waitFor({ state: 'detached' });
    const beforeError = errors.length;
    await page.getByLabel('N', { exact: true }).fill('1');
    await warning.waitFor();
    assert.match(await warning.innerText(), /a ring needs at least 2 nodes/);
    assert.equal(await page.getByRole('alert').count(), 1);
    assert.equal(await page.locator('.sim-settings-warning').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Next step', exact: true }).isDisabled(), true);
    assert.deepEqual(errors.slice(beforeError), []);
    errors.splice(beforeError);
    await page.getByLabel('N', { exact: true }).fill('6');
    await warning.waitFor({ state: 'detached' });
    const shared = Buffer.from(encodeURIComponent(JSON.stringify({ project: 'cautious-pair', settings: { N: 9, site: 2 }, path: [0, 0] }))).toString('base64');
    await page.goto(`${starterUrl}?shared=${encodeURIComponent(shared)}`);
    await round(1);
    await warning.waitFor();
    assert.match(await warning.innerText(), /N = 9 is outside/);
    await next();
    await round(2);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await warning.waitFor({ state: 'detached' });
    await round(0);
    assert.deepEqual(errors, []);
  });
  const original = await readFile(sourceFile, 'utf8');
  const rendererFile = join(directory, 'src/renderers/ring.ts');
  const renderer = await readFile(rendererFile, 'utf8');
  const stamp = async () => {
    await page.evaluate(() => { (window as any).__browserAcceptance = 'same-document'; });
  };
  const sameDocument = async () => assert.equal(await page.evaluate(() => (window as any).__browserAcceptance), 'same-document');
  await t.test('semantic saves restart and preserve compatible settings', async () => {
    await stamp();
    await writeFile(sourceFile, original.replace('agents := 2', 'agents := 3'));
    await round(0);
    await page.waitForFunction(() => document.querySelector('.algorithm-viewer')?.textContent?.includes('a2'));
    assert.equal(await page.getByLabel('N', { exact: true }).inputValue(), '6');
    assert.equal(await page.getByLabel('site', { exact: true }).inputValue(), '2');
    assert.equal(await page.locator('.cg-stats').count(), 0);
    await sameDocument();
  });

  await t.test('line-only saves preserve the execution and move highlights', async () => {
    await next();
    await round(1);
    const before = await debug().textContent();
    // The lines the agents are at, in the algorithm view.
    const lines = await page.locator('.algorithm-line.highlighted').evaluateAll((es: Element[]) => es.map(e => e.getAttribute('data-line-number')));
    const shifted = lines.map((n: string | null) => String(Number(n) + 1));
    await writeFile(sourceFile, '-- Browser acceptance\n' + original.replace('agents := 2', 'agents := 3'));
    await page.waitForFunction((expected: string[]) => JSON.stringify([...document.querySelectorAll('.algorithm-line.highlighted')].map(e => e.getAttribute('data-line-number'))) === JSON.stringify(expected), shifted);
    await round(1);
    assert.equal(await debug().textContent(), before);
    await sameDocument();
  });

  await t.test('renderer saves redraw without restarting', async () => {
    const before = await debug().textContent();
    const image = await page.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await writeFile(rendererFile, renderer.replace('  return layout;', "  ctx.fillStyle = '#ff00ff';\n  ctx.fillRect(0, 0, 20, 20);\n  return layout;"));
    await page.waitForFunction(() => {
      const p = document.querySelector('canvas')!.getContext('2d')!.getImageData(5, 5, 1, 1).data;
      return p[0] === 255 && p[1] === 0 && p[2] === 255 && p[3] === 255;
    });
    await round(1);
    assert.equal(await debug().textContent(), before);
    assert.notEqual(await page.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()), image);
    await sameDocument();
  });

  await t.test('invalid saves retain the last view, show diagnostics and recover', async () => {
    const before = await debug().textContent();
    await writeFile(sourceFile, original + '\ninvalid syntax here\n');
    await page.getByText('Out of date:', { exact: false }).waitFor();
    assert.equal(await debug().textContent(), before);
    assert.match(await page.locator('pre').first().innerText(), /main\.sim:\d+:\d+/);
    assert.equal(await page.locator('.config-graph').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Next step', exact: true }).isDisabled(), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await debug().textContent(), before);
    await writeFile(sourceFile, original);
    await round(0);
    await page.waitForFunction(() => !document.body.textContent?.includes('Out of date:'));
    await sameDocument();
  });

  await t.test('first-load errors show diagnostics and recover on save', async () => {
    await writeFile(sourceFile, original + '\ninvalid syntax here\n');
    await page.getByText('Out of date:', { exact: false }).waitFor();
    const fresh = await browser.newPage();
    const uncaught: string[] = [];
    fresh.on('pageerror', (error: Error) => uncaught.push(error.message));
    try {
      await fresh.goto(starterUrl);
      await fresh.locator('mark').waitFor();
      assert.match(await fresh.locator('mark').innerText(), /main\.sim:\d+:\d+/);
      assert.equal(await fresh.locator('.algorithm-viewer').count(), 0);
      await writeFile(sourceFile, original);
      await fresh.locator('.algorithm-viewer').waitFor();
      assert.equal(await fresh.locator('mark').count(), 0);
      assert.deepEqual(uncaught, []);
      await page.waitForFunction(() => !document.body.textContent?.includes('Out of date:'));
    } finally {
      await fresh.close();
    }
  });

  await t.test('black-hole migrated entry, branching, preset and graph worker', async () => {
    await page.goto(blackHoleUrl);
    await page.locator('header select').selectOption('black-hole-search-algo1');
    await round(0);
    await drawn();
    await next();
    await round(1);
    // The branches of this step, by index, with what distinguishes them.
    await branch('Branch 0 of 2');
    assert.equal(await page.locator('.sim-branch-label').innerText(), 'stays inactive');
    await page.getByRole('button', { name: 'Next branch', exact: true }).click();
    await branch('Branch 1 of 2');
    // All branches, drawn, to pick one: back to branch 0.
    await page.getByRole('button', { name: 'All branches', exact: true }).click();
    assert.equal(await page.locator('.bp-branch').count(), 2);
    await page.locator('.bp-branch').first().click();
    await branch('Branch 0 of 2');
    await page.getByRole('button', { name: 'Next branch', exact: true }).click();
    await branch('Branch 1 of 2');
    assert.match(await debug().textContent(), /"active":true/);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    assert.equal(await page.getByLabel('N', { exact: true }).inputValue(), '10');
    for (let i = 0; i < 7; i++) await next();
    await round(7);
    await page.getByRole('tab', { name: 'Graph', exact: true }).click();
    await page.getByLabel('Max depth (rounds)').fill('4');
    await page.getByRole('button', { name: 'Generate graph', exact: true }).click();
    await page.locator('.cg-stats').waitFor();
    assert.deepEqual(errors, []);
  });
});

test('stand-up visibility bounds are advisory, attributed to phi and quiet in the console', { timeout: 120_000 }, async t => {
  const server = await createServer({
    ...projectViteConfig('standup-gathering'), configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } },
  });
  await server.listen();
  let browser: any;
  t.after(async () => { await browser?.close(); await server.close(); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(error.message));
  page.on('console', (message: any) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(server.resolvedUrls!.local[0], { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const cases: [string, string, number, number][] = [
    ['standup-gathering-h-plus-three', '[0,1,2]', 3, 4],
    ['standup-gathering-h-plus-three', '[0,2,4]', 4, 5],
    ['standup-gathering-h-plus-one', '[0,1,2]', 3, 4],
    ['standup-gathering-h-plus-one', '[0,4,8]', 4, 5],
    ['standup-gathering-two-colors', '[0,2,4]', 1, 2],
  ];
  const visibility = page.getByLabel('Visibility φ', { exact: true });
  const positions = page.getByLabel('Initial robot coordinates (JSON)', { exact: true });
  const warning = page.locator('.sim-settings-warning');
  const next = page.getByRole('button', { name: 'Next step', exact: true });
  for (const [name, coordinates, phi, required] of cases) {
    await page.getByLabel('Simulation', { exact: true }).selectOption(name);
    await positions.fill(coordinates);
    await visibility.fill(String(phi));
    await warning.waitFor();
    assert.match(await warning.innerText(), new RegExp(`Visibility φ = ${phi}.*at least ${required}`));
    assert.doesNotMatch(await warning.innerText(), /positions.*outside/);
    assert.equal(await page.locator('.sim-settings-error').count(), 0);
    assert.equal(await next.isEnabled(), true);
    await next.click();
    await page.waitForFunction(() => document.querySelector('.sim-round-value')?.textContent === '1');
    await visibility.fill(String(required));
    await warning.waitFor({ state: 'detached' });
  }
  // Structurally invalid input remains an inline error, without a console exception.
  await visibility.fill('-1');
  await page.locator('.sim-settings-error').waitFor();
  assert.equal(await next.isEnabled(), false);
  await visibility.fill('2');
  await page.locator('.sim-settings-error').waitFor({ state: 'detached' });
  assert.equal(await next.isEnabled(), true);
  assert.deepEqual(errors, []);
});
