/** Compiling `.sim` sources for engine tests, with the standard library from disk (no Vite plugin). */
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram, nodeHost, stdlibDir } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import type { Experiment } from '@bramas/simulant-lang/ir';

const host = nodeHost();

/** The experiment `name` of a source held in memory, failing with its diagnostics. */
export function experimentOf(source: string, name: string): Experiment {
  const out = compile(new Program({ ...host, read: p => p === '/mem/test.sim' ? source : host.read(p) }, '/mem/test.sim'));
  const r = out.experiments[name];
  if (!r?.experiment) throw new Error([...out.diagnostics, ...(r?.diagnostics ?? [])].map(d => `${d.span?.start.line}: ${d.message}`).join('\n') || `no experiment ${name}`);
  return r.experiment;
}

/** The experiments of a standard-library module (`conformance.sim`, `examples.sim`). */
export function libraryExperiments(module: string): Record<string, Experiment> {
  const out = compile(loadProgram(stdlibDir + module));
  return Object.fromEntries(Object.entries(out.experiments).map(([n, r]) => {
    if (!r.experiment) throw new Error(`${n}: ${r.diagnostics.map(d => d.message).join('\n')}`);
    return [n, r.experiment];
  }));
}
