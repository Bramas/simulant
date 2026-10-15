import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
await rm(`${root}/dist`, { recursive: true, force: true });
await mkdir(`${root}/dist`, { recursive: true });
const bundles = await Promise.all([
  build({ entryPoints: [`${root}/src/extension.ts`], outfile: `${root}/dist/extension.cjs`, bundle: true,
    platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'], sourcemap: true, metafile: true }),
  build({ entryPoints: [`${repo}/packages/language-server/src/node.ts`], outfile: `${root}/dist/server.cjs`, bundle: true,
    platform: 'node', format: 'cjs', target: 'node20', sourcemap: true, metafile: true }),
  build({ entryPoints: [`${repo}/packages/language-service/src/service.ts`], outfile: `${root}/dist/language-service.mjs`, bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', sourcemap: true, metafile: true }),
]);
await cp(`${repo}/packages/stdlib/sim`, `${root}/dist/stdlib`, { recursive: true });
await cp(`${repo}/LICENCE.txt`, `${root}/LICENCE.txt`);
const notices = new Map();
for (const bundle of bundles) for (const input of Object.keys(bundle.metafile.inputs)) {
  if (!/[\\/]node_modules[\\/]/.test(input)) continue;
  let dir = dirname(resolve(input));
  while (dirname(dir) !== dir) {
    let pkg;
    try { pkg = JSON.parse(await readFile(`${dir}/package.json`, 'utf8')); } catch { /* parent directory */ }
    if (pkg?.name) {
      const key = `${pkg.name}@${pkg.version}`;
      if (!notices.has(key)) {
        const licenses = (await readdir(dir)).filter(name => /^licen[cs]e(?:\.|$)/i.test(name));
        const text = await Promise.all(licenses.map(name => readFile(`${dir}/${name}`, 'utf8')));
        notices.set(key, `${key}\nLicense: ${pkg.license ?? 'see package'}\n\n${text.join('\n\n')}`);
      }
      break;
    }
    dir = dirname(dir);
  }
}
await writeFile(`${root}/dist/THIRD_PARTY_NOTICES.txt`, [...notices.values()].join('\n\n--------------------\n\n'));
console.log('Built VS Code client, language server, browser language service and bundled standard library.');
