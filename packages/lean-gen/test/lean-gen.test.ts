import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { checkProofFile, checkProofs } from '@bramas/simulant-lean-gen/check-proofs';
import { differential } from '@bramas/simulant-lean-gen/differential';
import { examples, generateExamples } from '../src/examples';
import { generateLibrary } from '@bramas/simulant-lean-gen/library';

const leanDir = new URL('../../../lean/', import.meta.url);

test('the generated Lean files are up to date with the generator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'simulant-gen-'));
  try {
    mkdirSync(join(dir, 'Simulant/Library'), { recursive: true });
    mkdirSync(join(dir, 'Examples'), { recursive: true });
    const lib = generateLibrary(new URL(pathToFileURL(join(dir, 'Simulant')).href + '/'));
    for (const name of lib) {
      assert.equal(readFileSync(join(dir, `Simulant/Library/${name}.lean`), 'utf8'),
        readFileSync(new URL(`Simulant/Library/${name}.lean`, leanDir), 'utf8'), `Library/${name}.lean is stale`);
    }
    generateExamples(new URL(pathToFileURL(join(dir, 'Examples')).href + '/'));
    for (const name of Object.keys(examples)) {
      assert.equal(readFileSync(join(dir, `Examples/${name}/Model.lean`), 'utf8'),
        readFileSync(new URL(`Examples/${name}/Model.lean`, leanDir), 'utf8'), `Examples/${name}/Model.lean is stale`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('proof files cannot assume, skip, or change the syntax', () => {
  assert.deepEqual(checkProofFile('theorem t : True := trivial\n-- axiom a : False\n/- sorry -/\ndef P (n : Nat) : Prop := n = n'), []);
  for (const bad of ['axiom a : False', 'theorem t : P := sorry', 'theorem t : P := by native_decide', 'theorem t : P := by admit',
    'notation "x" => 1', 'macro "trivial" : tactic => `(tactic| sorry)', 'opaque f : Nat', '@[implemented_by g] def f := 1']) {
    assert.notDeepEqual(checkProofFile(bad), [], bad);
  }
});

// Building the Lean library and examples takes about a minute: opt in with SIMULANT_LEAN=1.
test('the Lean library and examples build, and their proofs pass the checks', { skip: !process.env.SIMULANT_LEAN }, () => {
  const cwd = leanDir.pathname;
  execFileSync('lake', ['build', 'Simulant'], { cwd, stdio: 'pipe' });
  execFileSync('lake', ['build', 'Examples'], { cwd, stdio: 'pipe' });
  const result = checkProofs(cwd, 'Examples.CautiousPair', [{ theorem: 'nonVacuity', statement: 'NonVacuity' }]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.axioms.nonVacuity.sort(), ['Classical.choice', 'Quot.sound', 'propext']);
  // The invariant of the migrated Algorithm 1, through its lowered step function.
  const algo1 = checkProofs(cwd, 'Examples.Algo1', [{ theorem: 'reachable_claims' }]);
  assert.deepEqual(algo1.problems, []);
});

// The generated Lean round against the interpreter, on the IR conformance fixtures (SIMULANT_LEAN=1).
test('differential: the computable Lean round has the interpreter\'s successors and witnesses',
  { skip: !process.env.SIMULANT_LEAN }, () => {
    const dir = new URL('../../engine/conformance/', import.meta.url);
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const fixture = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
      if (f === 'black-hole-lossy.json') {
        // Sub-multisets of equal public states are merged by the interpreter, not yet in Lean.
        assert.throws(() => differential(fixture.experiment, fixture.params, leanDir.pathname, 30), /not merged in Lean yet/);
        continue;
      }
      if (['async-lights', 'lc-atomic-lights', 'cm-atomic-lights', 'bounded', 'permutation'].includes(f.replace('.json', ''))) {
        // Schedulers beyond the three atomic ones need the Lean round over events (docs/scheduler-design.md, step 4).
        assert.throws(() => differential(fixture.experiment, fixture.params, leanDir.pathname, 30), /not translated to Lean yet/);
        continue;
      }
      const r = differential(fixture.experiment, fixture.params, leanDir.pathname, 30);
      assert.deepEqual(r.mismatches, [], f);
      assert.ok(r.successors > 0, f);
    }
    // The paper's Algorithm 1, lowered from structured statements.
    const algo1 = differential(examples.Algo1, { N: 5, site: 2 }, leanDir.pathname, 40);
    assert.deepEqual(algo1.mismatches, []);
    assert.ok(algo1.successors > 0);
    // The two-color stand-up rules: the line, isomorphism frames under the physical reference
    // ordering, lights, and definitions that read the Look (`Line.window`).
    const standup = compile(loadProgram(new URL('../../../projects/standup-gathering/sim/two-colors.sim', import.meta.url).pathname));
    const colors = differential(standup.experiments.twoColors.experiment!, { positions: [0, 2, 4], phi: 2, crashNode: 0 }, leanDir.pathname, 40);
    assert.deepEqual(colors.mismatches, []);
    assert.ok(colors.successors > 0);
    // A semantic difference is detected.
    const mutated = differential(examples.CautiousPairCrash, { N: 5, site: 2 }, leanDir.pathname, 30,
      src => src.replace('Simulant.Library.CrashStop.component 1 ', 'Simulant.Library.CrashStop.component 0 '));
    assert.ok(mutated.mismatches.length > 0);
  });
