/** Node.js helpers: reading `.sim` programs from disk. Not for the browser. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Elaborator } from './elaborate';
import { Program, type SourceHost } from './program';

/** The `.sim` standard library of this workspace. */
export const stdlibDir = fileURLToPath(new URL('../../../stdlib/sim/', import.meta.url));

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
