import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { LanguageService } from '../../language-service/src/service';
import { attachServer } from './server';

const connection = createConnection(ProposedFeatures.all);
attachServer(connection, params => {
  const roots = (params.workspaceFolders?.map(f => f.uri) ?? (params.rootUri ? [params.rootUri] : [])).filter(uri => uri.startsWith('file:')).map(uri => fileURLToPath(uri));
  const configured = params.initializationOptions?.stdlibPath as string | undefined;
  // The distributable server lives alongside its bundled standard library.
  const bundled = process.env.SIMULANT_STDLIB ?? join(dirname(process.argv[1]), 'stdlib');
  const local = roots.flatMap(root => [join(root, 'packages/stdlib/sim'), join(root, 'node_modules/@bramas/simulant-stdlib/sim')])
    .find(dir => existsSync(join(dir, 'models.sim')));
  const stdlib = configured ? resolve(roots[0] ?? process.cwd(), configured) : local ?? bundled;
  const uriOf = (path: string) => pathToFileURL(path).href.replace(/^file:\/\/\/([A-Z]):/, (_, drive: string) => `file:///${drive.toLowerCase()}:`);
  const stdlibUri = uriOf(stdlib + '/');
  const ignored = new Set(['node_modules', '.git', 'dist', '.lake', '.simulant', '.pnpm-store']);
  const collect = (dir: string, out: string[]) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) collect(path, out);
      else if (entry.isFile() && entry.name.endsWith('.sim')) out.push(uriOf(path));
    }
  };
  return new LanguageService({
    read: uri => {
      if (!uri.startsWith('file:')) return undefined;
      try { return readFileSync(fileURLToPath(uri), 'utf8'); } catch { return undefined; }
    },
    resolve: (from, spec) => spec.startsWith('std/') ? new URL(spec.slice(4), stdlibUri).href
      : new URL(spec, from.startsWith('file:') ? from : uriOf(join(roots[0] ?? process.cwd(), '__untitled.sim'))).href,
    files: () => {
      const out: string[] = [];
      for (const root of [...roots, stdlib]) collect(root, out);
      return new Set(out);
    },
  }, stdlibUri);
});
connection.listen();
