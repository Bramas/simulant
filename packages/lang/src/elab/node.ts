/** Node.js helpers: reading `.sim` programs from disk. Not for the browser. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { Elaborator } from './elaborate';
import { Program, type SourceHost } from './program';

/** Resolve data through its package, both in the workspace and in an npm installation. */
export const stdlibDir = join(dirname(createRequire(import.meta.url).resolve('@bramas/simulant-stdlib/package.json')), 'sim') + sep;

/** A host reading files from disk; `std/...` imports resolve in `stdlib`. */
export function nodeHost(stdlib = stdlibDir): SourceHost {
  return {
    read: p => {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return undefined;
      }
    },
    resolve: (from, spec) => spec.startsWith('std/') ? join(stdlib, spec.slice(4)) : resolve(dirname(from), spec),
  };
}

export function loadProgram(entry: string, stdlib = stdlibDir): Program {
  return new Program(nodeHost(stdlib), entry);
}

/** An elaborator over a module of the standard library (`models.sim` imports all components and sensors). */
export function stdlibElaborator(module = 'models.sim'): Elaborator {
  return new Elaborator(loadProgram(join(stdlibDir, module)));
}
