/**
 * Caveats of the interpreter that depend only on an experiment (docs/core-redesign.md, section 3),
 * shown by the model view and the CLI's check output.
 */
import type { Experiment } from './ir';

/**
 * Under `Frames.isomorphisms`, the interpreter's reference ordering of locations is the physical
 * vertex order, which does not satisfy the ordering law on every view; Lean takes the ordering as a
 * parameter.
 */
export function referenceOrderingWarning(exp: Experiment): string | undefined {
  if (exp.model.frames.kind !== 'isomorphisms') return undefined;
  return 'The simulator orders the locations of a view by vertex. On views without symmetry, that order can reveal information the model does not grant: an algorithm must not rely on the order of locations that are not symmetric. Lean statements quantify over every valid ordering.';
}
