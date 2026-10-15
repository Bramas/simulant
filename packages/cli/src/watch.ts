/**
 * Watch mode (plan, Section 6.7): the command runs again on each new revision of the project's
 * `.sim` sources; a run that a newer revision supersedes is cancelled, and its result is never
 * printed. An edit that does not compile is reported with its diagnostics, and nothing runs
 * until the sources compile again. An edit that does not change the experiment (only lines moved)
 * keeps the last result.
 */
import type { ProjectType } from '@bramas/simulant-core/types/project';
import type { Print } from './explorer-commands';

/** Must be called before the registry is loaded: compiled `.sim` modules then watch their sources. */
export function requestWatch() {
  (globalThis as { __simulantWatch?: boolean }).__simulantWatch = true;
}

export class Superseded extends Error {
  constructor() { super('superseded by a newer revision'); }
}

export function watchProject(
  project: ProjectType<any, any>, run: (signal: AbortSignal) => Promise<number>, print: Print,
): { stop: () => void; done: Promise<void> } {
  if (!project.subscribe) throw new Error('--watch needs a .sim project');
  let controller: AbortController | undefined;
  const start = () => {
    controller?.abort(new Superseded());
    const own = controller = new AbortController();
    print(`--- revision ${project.revision?.() ?? '?'} (${new Date().toLocaleTimeString()}) ---`);
    run(own.signal).then(
      code => { if (!own.signal.aborted) print(`--- exit code ${code}; watching for changes (Ctrl-C to stop) ---`); },
      error => {
        if (own.signal.aborted) return;
        print(`Error: ${error instanceof Error ? error.message : error}`);
        print('--- exit code 1; watching for changes (Ctrl-C to stop) ---');
      },
    );
  };
  const unsubscribe = project.subscribe(update => {
    if (update.kind === 'replaced') {
      print('');
      print('Sources changed.');
      start();
    } else if (update.kind === 'failed') {
      controller?.abort(new Superseded());
      print('');
      print(`--- revision ${update.revision}: the sources do not compile ---`);
      for (const d of update.diagnostics) print(d);
      print('--- watching for changes ---');
    } else {
      print(`(sources changed without changing the experiment: revision ${project.revision?.()}, results unchanged)`);
    }
  });
  // The watchers poll the sources; this keeps the process alive until stopped.
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });
  const alive = setInterval(() => {}, 1 << 30);
  start();
  return {
    done,
    stop: () => { controller?.abort(new Superseded()); unsubscribe(); clearInterval(alive); resolve(); },
  };
}
