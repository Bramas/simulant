/** Compiling `.sim` sources held in memory; `std/...` imports read the standard library from disk. */
import { existsSync } from 'node:fs';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';

/** Reads from disk; a `.sim` file that exists only as a `.sim-design` target source reads that. */
const disk = nodeHost();
const read = (p: string) => disk.read(p) ?? (p.endsWith('.sim') && existsSync(`${p}-design`) ? disk.read(`${p}-design`) : undefined);

export function compileFile(path: string) {
  return compile(new Program({ ...disk, read }, path));
}

export function compileSource(source: string) {
  return compile(new Program({ ...disk, read: p => p === '/mem/main.sim' ? source : read(p) }, '/mem/main.sim'));
}

/** Every diagnostic of the program and its experiments, as "line:col message". */
export function errors(source: string): string[] {
  const out = compileSource(source);
  return [...out.diagnostics, ...Object.values(out.experiments).flatMap(r => r.diagnostics)]
    .map(d => `${d.span?.start.line}:${d.span?.start.col} ${d.message}`);
}

/** The compiled experiment `e`, failing with its diagnostics. */
export function experiment(source: string, name = 'e') {
  const r = compileSource(source).experiments[name];
  if (!r?.experiment) throw new Error(errors(source).join('\n') || `no experiment ${name}`);
  return r.experiment;
}

/** A model on a cycle, with an algorithm `A` and the task `Gathering`. */
export const CYCLE = (algorithm: string, model = 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (memory := .persistent)') => `import "std/models.sim"
${algorithm}
experiment e where
  model := ${model}
  algorithm := A
  task := Gathering
  param N : Nat in [3, 4]
  agents := 2
  position i := pos 0
`;
