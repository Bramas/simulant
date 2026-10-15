/**
 * Vite plugin for `.sim` sources (plan, Section 6.7). Importing a `.sim`
 * file gives a `SimModule`: the IR of its experiments, diagnostics with
 * source positions, the source texts, their generated Lean models, and a
 * revision.
 *
 * Every file the program read is watched, including imports that do not
 * exist yet: editing or creating one recompiles the entry modules that read
 * it, and Vite sends them as hot updates. Errors are exported, not thrown,
 * so a page keeps its last good state and shows the diagnostics.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Relative imports: Vite bundles them into the configuration that loads this plugin
// (workspace packages are resolved through tsconfig paths, which Node does not read).
import { compile } from '../../lang/src/elab/elaborate';
import { nodeHost, stdlibDir } from '../../lang/src/elab/node';
import { Program } from '../../lang/src/elab/program';
import type { Experiment } from '../../lang/src/ir';
import { libraryComponents, libraryNamespace } from '../../lean-gen/src/library';
import { generateMappedModel, isLibrary } from '../../lean-gen/src/model';
import { generateComponent } from '../../lean-gen/src/component';
import { leanModuleName } from '../../lean-gen/src/names';
import type { Plugin, ViteDevServer } from 'vite';
import { formatDiagnostic as format, type SimDiagnostic, type SimLean, type SimModule } from './module';
import { snapshotTypes } from './types';

export type { SimDiagnostic, SimModule } from './module';

export type SimulantOptions = {
  /** Directory of the `.sim` standard library (default: this workspace's). */
  stdlib?: string;
  /** Where to write the snapshot types of experiments (default: `.simulant/types` under the root; `false`: nowhere). */
  types?: string | false;
};

/** Writes `<dir>/<experiment>.d.ts` for each experiment, when it changed. */
export function writeSnapshotTypes(module: SimModule, dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const [name, exp] of Object.entries(module.experiments)) {
    const file = join(dir, `${name}.d.ts`);
    const text = snapshotTypes(exp);
    let old: string | undefined;
    try { old = readFileSync(file, 'utf8'); } catch { /* new */ }
    if (old !== text) writeFileSync(file, text);
  }
}

/**
 * The Lean model of an experiment, as `simulant lean` writes it (the CLI names the module after
 * the simulation; the page renames it), and the library components it imports.
 */
function leanOf(exp: Experiment): SimLean {
  const module = leanModuleName(exp.name);
  try {
    const { text, regions } = generateMappedModel(exp, `Generated.${module}`);
    const library = exp.model.components.filter(isLibrary).map(c => {
      const ns = libraryNamespace(c.name);
      return { component: c.name, module: ns, text: generateComponent(libraryComponents.find(l => l.name === c.name)!, ns) };
    });
    return { module, text, regions, library };
  } catch (e) {
    return { module, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Changes when the compiler changes: compiled modules of another version are out of date. */
const COMPILER_VERSION = 'simulant-lang/ir-1';

export function compileSim(file: string, stdlib = stdlibDir, overrides?: Map<string, string>): { module: SimModule; files: Set<string> } {
  const base = nodeHost(stdlib);
  const host = overrides ? { ...base, read: (p: string) => overrides.get(p) ?? base.read(p) } : base;
  const program = new Program(host, file);
  const out = compile(program);
  const diagnostics: SimDiagnostic[] = [];
  const add = (d: { message: string; span?: { file: string; start: { line: number; col: number }; end: { line: number; col: number } } }, experiment?: string) =>
    diagnostics.push({
      message: d.message, experiment,
      ...(d.span ? { file: d.span.file, line: d.span.start.line, column: d.span.start.col, endLine: d.span.end.line, endColumn: d.span.end.col } : {}),
    });
  for (const d of out.diagnostics) add(d);
  const experiments: SimModule['experiments'] = {};
  const failed: string[] = [];
  for (const [name, r] of Object.entries(out.experiments)) {
    if (r.experiment) experiments[name] = r.experiment;
    else failed.push(name);
    for (const d of r.diagnostics.slice(out.diagnostics.length)) add(d, name);
  }
  const sources = Object.fromEntries([...program.modules.keys()].map(p => [p, host.read(p) ?? '']));
  const lean = Object.fromEntries(Object.entries(experiments).map(([name, exp]) => [name, leanOf(exp)]));
  const hash = createHash('sha256').update(COMPILER_VERSION);
  for (const p of [...program.files].sort()) hash.update(p).update('\0').update(host.read(p) ?? '\u0001missing').update('\0');
  return { module: { experiments, failed, diagnostics, sources, lean, revision: hash.digest('hex').slice(0, 16) }, files: program.files };
}

/** Compiles `file` as if its text were `text` (unsaved editor contents, tests). */
export function compileSource(file: string, text: string, stdlib = stdlibDir) {
  return compileSim(file, stdlib, new Map([[file, text]]));
}

function cleanId(id: string) {
  return id.replace(/[?#].*$/, '');
}


/**
 * The JavaScript module of a compiled `.sim` file. Under Vite, it accepts its own hot updates;
 * under Node.js (`node`: the entry and the files it read), `subscribe` watches the sources when
 * the CLI asked for it (watch mode).
 */
export function moduleSource(module: SimModule, node?: { file: string; files: Iterable<string> }): string {
  const head = `export const experiments = ${JSON.stringify(module.experiments)};
export const failed = ${JSON.stringify(module.failed)};
export const diagnostics = ${JSON.stringify(module.diagnostics)};
export const sources = ${JSON.stringify(module.sources)};
export const lean = ${JSON.stringify(module.lean ?? {})};
export const revision = ${JSON.stringify(module.revision)};
`;
  if (node) return `import { watchRequested, watchSim } from ${JSON.stringify(new URL('./node-watch.ts', import.meta.url).href)};
${head}const listeners = new Set();
let started = false;
export function subscribe(listener) {
  listeners.add(listener);
  if (!started && watchRequested()) {
    started = true;
    watchSim(${JSON.stringify(node.file)}, ${JSON.stringify([...node.files])}, next => {
      for (const l of listeners) l(next);
    });
  }
  return () => listeners.delete(listener);
}
`;
  return `${head}const listeners = import.meta.hot ? (import.meta.hot.data.listeners ??= new Set()) : new Set();
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (import.meta.hot) {
  import.meta.hot.accept(next => {
    if (next) for (const listener of listeners) listener(next);
  });
}
`;
}

export function simulant(opts: SimulantOptions = {}): Plugin {
  /** For each compiled entry, the files it read. */
  const deps = new Map<string, Set<string>>();
  let server: ViteDevServer | undefined;
  let root = process.cwd();

  const reload = (file: string) => {
    if (!server) return;
    for (const [entry, files] of deps) {
      if (!files.has(file) || entry === file) continue;
      for (const mod of server.moduleGraph.getModulesByFile(entry) ?? []) void server.reloadModule(mod);
    }
  };

  return {
    name: 'simulant',
    configResolved(config) {
      root = config.root;
    },
    configureServer(s) {
      server = s;
      // A missing import that appears (or a file that disappears) recompiles the entries that read it.
      s.watcher.on('add', reload);
      s.watcher.on('unlink', reload);
    },
    load(id) {
      const file = cleanId(id);
      if (!file.endsWith('.sim')) return;
      const { module, files } = compileSim(file, opts.stdlib);
      deps.set(file, files);
      for (const f of files) {
        this.addWatchFile(f);
        server?.watcher.add(f);
      }
      for (const d of module.diagnostics) this.warn(format(d));
      if (opts.types !== false) writeSnapshotTypes(module, opts.types ?? join(root, '.simulant/types'));
      return moduleSource(module);
    },
    transform(code, id) {
      // Renderer modules accept their own updates: a drawing-only edit redraws, keeping the execution
      // (see packages/simulator-ui/src/renderers/define.ts).
      const file = cleanId(id);
      if (!server || file.includes('/node_modules/') || file.endsWith('.sim') || file.endsWith('/renderers/define.ts')) return;
      if (!/\bdefineRenderer\s*\(/.test(code) || /import\.meta\.hot\.accept\(/.test(code)) return;
      return { code: `${code}\nif (import.meta.hot) import.meta.hot.accept();\n`, map: null };
    },
    handleHotUpdate(ctx) {
      // A changed import: the entries that read it are updated too.
      const entries = [...deps].filter(([entry, files]) => entry !== ctx.file && files.has(ctx.file)).map(([entry]) => entry);
      if (!entries.length) return;
      const mods = entries.flatMap(e => [...(ctx.server.moduleGraph.getModulesByFile(e) ?? [])]);
      for (const m of mods) ctx.server.moduleGraph.invalidateModule(m);
      return [...ctx.modules, ...mods];
    },
  };
}
