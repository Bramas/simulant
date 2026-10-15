/**
 * Generates the Lean model files of the Phase 2 examples:
 *   npx tsx packages/lean-gen/src/examples.ts
 * Proofs about them are hand-written in lean/Examples/<Name>/Proofs.lean.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram, stdlibDir } from '@bramas/simulant-lang/elab/node';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { generateModel } from './model';

/** Experiments of `packages/stdlib/sim/examples.sim` and of the migrated paper algorithms, by Lean module name. */
export const examples: Record<string, Experiment> = (() => {
  const out = compile(loadProgram(stdlibDir + 'examples.sim'));
  const get = (name: string) => {
    const r = out.experiments[name];
    if (!r?.experiment) throw new Error(`${name}: ${r?.diagnostics.map(d => d.message).join('\n')}`);
    return r.experiment;
  };
  const algo1 = compile(loadProgram(new URL('../../../projects/black-hole-search/sim/algo1.sim', import.meta.url).pathname));
  return {
    /** The cautious pair, with a hole present from the start. */
    CautiousPair: get('cautiousPair'),
    /** The same algorithm with crashes, an emerging hole, and unrelated state (pebbles). */
    CautiousPairCrash: get('cautiousPairCrash'),
    /** The paper's Algorithm 1, lowered from structured `.sim`. */
    Algo1: algo1.experiments.algo1.experiment ?? (() => { throw new Error(algo1.experiments.algo1.diagnostics.map(d => d.message).join('\n')); })(),
  };
})();

export function generateExamples(dir: URL) {
  for (const [name, exp] of Object.entries(examples)) {
    mkdirSync(new URL(`${name}/`, dir), { recursive: true });
    writeFileSync(new URL(`${name}/Model.lean`, dir), generateModel(exp, `Examples.${name}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) generateExamples(new URL('../../../lean/Examples/', import.meta.url));
