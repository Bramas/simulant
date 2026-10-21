import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { Program } from '@bramas/simulant-lang/elab/program';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import type { SimModule } from '@bramas/simulant-vite-plugin/module';
import { update } from '../src/session';

/** A module with one experiment whose ring sizes are `sizes`. */
function moduleWith(sizes: number[], name = 'e'): SimModule {
  const host = nodeHost();
  const source = `import "std/examples.sim"
experiment ${name} where
  model := blackHoleRing .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [${sizes.join(', ')}]
  param site : Node in [node 1, node 2]
  agents := 2
  position i := node 0
`;
  const out = compile(new Program({ ...host, read: p => p === '/mem/main.sim' ? source : host.read(p) }, '/mem/main.sim'));
  return { experiments: { [name]: out.experiments[name].experiment! }, failed: [], diagnostics: [], sources: {}, revision: sizes.join() };
}

const broken: SimModule = { experiments: {}, failed: ['e'], diagnostics: [{ message: 'oops', file: 'main.sim', line: 3, column: 1 }], sources: {}, revision: 'x' };

test('a first load selects the first experiment and parameters', () => {
  const s = update(undefined, moduleWith([5, 6]));
  assert.equal(s.experiment, 'e');
  assert.deepEqual(s.params, { N: 5, site: 1 });
  assert.equal(s.outOfDate, false);
});

test('an update with errors keeps the last good experiments, out of date', () => {
  const ok = update(undefined, moduleWith([5, 6]));
  const s = update({ ...ok, params: { N: 6, site: 2 } }, broken);
  assert.equal(s.outOfDate, true);
  assert.equal(s.good, ok.good);
  assert.deepEqual(s.params, { N: 6, site: 2 });
});

test('a successful update keeps the parameter values that are still valid, and reports the others', () => {
  const ok = { ...update(undefined, moduleWith([5, 6])), params: { N: 6, site: 2 } };
  const kept = update(ok, moduleWith([4, 6]));
  assert.deepEqual(kept.params, { N: 6, site: 2 });
  assert.deepEqual(kept.notes, []);
  const reset = update(ok, moduleWith([4, 5]));
  assert.deepEqual(reset.params, { N: 4, site: 2 });
  assert.deepEqual(reset.notes, ['N reset from 6 to 4']);
});

test('a removed experiment is reported', () => {
  const ok = update(undefined, moduleWith([5]));
  const s = update(ok, moduleWith([5], 'f'));
  assert.equal(s.experiment, 'f');
  assert.deepEqual(s.notes, ['experiment e no longer exists']);
});
