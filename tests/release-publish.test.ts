import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { packageDirectories } from '../scripts/build-packages.mjs';
import { publishPackages } from '../scripts/publish-packages.mjs';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'simulant-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'dist/packages');
  mkdirSync(output, { recursive: true });
  const release = packageDirectories.map((directory, i) => {
    const name = `@bramas/release-${i}`;
    const manifest = { name, version: '1.2.3', private: false };
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'package.json'), JSON.stringify(manifest));
    const file = `release-${i}.tgz`;
    // Publication is intercepted below; only archive validation reads these bytes.
    const bytes = Buffer.from(`archive ${i}`);
    writeFileSync(join(output, file), bytes);
    return { ...manifest, directory, file, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  writeFileSync(join(output, 'release.json'), JSON.stringify(release));
  return { root, output, release };
}

test('a partial-release retry publishes only the missing version, preserving dependency order', async t => {
  const { root, output, release } = await fixture(t);
  const calls: string[][] = [];
  const messages: string[] = [];
  const lookedUp = new Set<string>();
  await publishPackages(root, '--publish', {
    skipPublished: true,
    request: async input => {
      const url = String(input);
      lookedUp.add(url);
      const item = release.find(p => url.endsWith(`${encodeURIComponent(p.name)}/${p.version}`))!;
      assert.ok(item, url);
      return item === release.at(-1) ? new Response(null, { status: 404 }) : Response.json(item);
    },
    run: args => {
      assert.equal(lookedUp.size, release.length, 'all registry lookups must finish before publishing');
      calls.push(args);
    },
    log: message => messages.push(message),
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['publish', join(output, release.at(-1)!.file)]);
  assert.equal(messages.length, release.length - 1);
  assert.ok(messages.every(message => message.includes('already published')));
});

test('an entirely published release is a successful no-op', async t => {
  const { root, release } = await fixture(t);
  await publishPackages(root, '--publish', {
    skipPublished: true,
    request: async input => Response.json(release.find(p => String(input).endsWith(`${encodeURIComponent(p.name)}/${p.version}`))),
    run: () => assert.fail('published an existing version'),
    log: () => {},
  });
});

test('authentication, registry and network failures stop the retry before any package is published', async t => {
  for (const status of [401, 403, 429, 500]) {
    const { root } = await fixture(t);
    await assert.rejects(publishPackages(root, '--publish', {
      skipPublished: true,
      request: async () => new Response(null, { status }),
      run: () => assert.fail('published after a failed lookup'),
    }), new RegExp(`HTTP ${status}`));
  }
  const { root } = await fixture(t);
  await assert.rejects(publishPackages(root, '--publish', {
    skipPublished: true,
    request: async () => { throw new Error('network unavailable'); },
    run: () => assert.fail('published after a network error'),
  }), /network unavailable/);
});

test('unexpected registry metadata is rejected instead of skipping a package', async t => {
  const { root } = await fixture(t);
  await assert.rejects(publishPackages(root, '--publish', {
    skipPublished: true,
    request: async () => Response.json({ name: 'another-package', version: '1.2.3' }),
    run: () => assert.fail('published after invalid metadata'),
  }), /Unexpected npm metadata/);
});

test('every archive is validated before any registry lookup or publication', async t => {
  const { root, output, release } = await fixture(t);
  writeFileSync(join(output, release.at(-1)!.file), 'changed archive');
  await assert.rejects(publishPackages(root, '--publish', {
    skipPublished: true,
    request: async () => { assert.fail('looked up before validating all archives'); },
    run: () => assert.fail('published a changed archive'),
  }), /Archive changed/);
});

test('dry-run supports skipping while ordinary publication stays offline until npm is invoked', async t => {
  const { root, output, release } = await fixture(t);
  const calls: string[][] = [];
  await publishPackages(root, '--dry-run', {
    skipPublished: true,
    request: async () => new Response(null, { status: 404 }),
    run: args => calls.push(args),
  });
  assert.deepEqual(calls.map(args => args[1]), release.map(p => join(output, p.file)));
  assert.ok(calls.every(args => args.includes('--dry-run') && !args.includes('--provenance')));
  let count = 0;
  await publishPackages(root, '--publish', {
    request: async () => { assert.fail('ordinary publication queried registry'); },
    run: () => { count++; },
  });
  assert.equal(count, release.length);
  assert.equal(JSON.parse(readFileSync(join(output, 'release.json'), 'utf8')).length, release.length);
});
