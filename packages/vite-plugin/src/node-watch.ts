/**
 * Watching `.sim` sources under Node.js (CLI watch mode, plan Section 6.7): every file the
 * compilation read is polled, including imports that do not exist yet; after a change, the entry
 * is recompiled and the new module published. Saves in quick succession are coalesced, and only
 * the compilation of the newest sources is published. Polling, rather than `fs.watch`, works on
 * every file system (network drives, WSL mounts).
 */
import { unwatchFile, watchFile } from 'node:fs';
import { compileSim } from './index';
import type { SimModule } from './module';

/** Set by the CLI before it loads a registry: compiled modules then watch their sources. */
export const watchRequested = () => !!(globalThis as { __simulantWatch?: boolean }).__simulantWatch;

export function requestWatch() {
  (globalThis as { __simulantWatch?: boolean }).__simulantWatch = true;
}

export function watchSim(entry: string, files: Iterable<string>, notify: (module: SimModule) => void, interval = 100) {
  const watched = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let revision: string | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(recompile, 50);
  };
  const watch = (all: Iterable<string>) => {
    const next = new Set(all);
    for (const f of watched) if (!next.has(f)) { unwatchFile(f, changed); watched.delete(f); }
    for (const f of next) if (!watched.has(f)) { watchFile(f, { interval }, changed); watched.add(f); }
  };
  const recompile = () => {
    const { module, files } = compileSim(entry);
    watch(files);
    if (module.revision === revision) return;
    revision = module.revision;
    notify(module);
  };
  watch(files);
  return () => { clearTimeout(timer); watch([]); };
}
