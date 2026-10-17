import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from '@bramas/simulant-lang/check';
import { agents, algorithm, choose, component, effect, flag, lit, none, param, rec, sensor } from '@bramas/simulant-lang/builder';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { blackHoleRing, Faults, obliviousRing, Storage } from '../../stdlib/test/helpers/index';
import { cautiousPairExperiment, CautiousPair } from '../../stdlib/test/helpers/examples';

const errorsOf = (exp: Experiment) => check(exp).errors;

test('the cautious pair typechecks on the black-hole family, with and without extra components', () => {
  for (const extra of [[], [Faults.CrashStop(1)], [Storage.Pebbles()]]) {
    const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown', extra }));
    assert.deepEqual(errorsOf(exp), []);
  }
});

test('the IR round-trips through JSON', () => {
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'known', extra: [Faults.CrashStop(1)] }));
  assert.deepEqual(JSON.parse(JSON.stringify(exp)), exp);
});

test('nondeterminism is inferred through definitions', () => {
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown' }));
  assert.equal(check(exp).nondeterministic.size, 0);
});

test('an oblivious model rejects an algorithm with memory', () => {
  const exp = { ...cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown' })), model: obliviousRing({ components: [Faults.CrashAtNode()] }) };
  assert.ok(errorsOf(exp).some(e => e.includes('oblivious')));
});

test('an algorithm cannot use a sensor the model does not provide', () => {
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown' }));
  exp.algorithm = { ...CautiousPair, uses: ['otherStates', 'ringSize'] };
  assert.ok(errorsOf(exp).some(e => e.includes("sensor 'ringSize'")));
});

test('a hook cannot write another component\'s fields', () => {
  const thief = component({ name: 'Thief', beforeLook: () => effect({ world: { active: true } }) });
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown', extra: [thief] }));
  assert.ok(errorsOf(exp).some(e => e.includes('world field active belongs to BlackHole')), errorsOf(exp).join('\n'));
});

test('parameters are only read in initialisation', () => {
  const peek = component({
    name: 'Peek', flags: [flag('peeked', 'visible', 'never')],
    afterMove: C => effect({ raise: { peeked: agents(C).filter(a => a.pos.eq(param('site'))) } }),
  });
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown', extra: [peek] }));
  assert.ok(errorsOf(exp).some(e => e.includes('param site is only allowed in initialisation')));
});

test('sensors cannot read private memory', () => {
  const leak = sensor('leak', T.multiset(T.record({ pc: T.enum('PC', []) })), ({ C }) => agents(C).map(a => a.mem));
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown' }));
  exp.model = { ...exp.model, sensors: [...exp.model.sensors, leak] };
  assert.ok(errorsOf(exp).some(e => e.includes('private memory')));
});

test('an algorithm cannot choose', () => {
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown' }));
  exp.algorithm = algorithm({
    name: 'Coin', uses: [], pub: CautiousPair.pub, init: { pub: i => rec({ id: i, bh: none(T.move) }) },
    step: () => ({ move: choose('coin', lit(T.list(T.move), ['cw', 'ccw'])) }),
  });
  assert.ok(errorsOf(exp).some(e => e.includes('choices are not allowed in algorithms')), errorsOf(exp).join('\n'));
});

test('a component reads only its own world fields and flags', () => {
  const nosy = component({
    name: 'Nosy', flags: [flag('scared', 'visible', 'never')],
    afterMove: C => effect({ raise: { scared: agents(C).filter(a => a.pos.eq(C.world.site)) } }),
  });
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown', extra: [nosy] }));
  assert.ok(errorsOf(exp).some(e => e.includes('world field site belongs to BlackHole')), errorsOf(exp).join('\n'));
  const peeker = component({
    name: 'Peeker', flags: [flag('scared', 'visible', 'never')],
    afterMove: C => effect({ raise: { scared: agents(C).filter(a => a.dead) } }),
  });
  const exp2 = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown', extra: [peeker] }));
  assert.ok(errorsOf(exp2).some(e => e.includes('flag dead belongs to BlackHole')), errorsOf(exp2).join('\n'));
});

test('anonymous agents have no order', () => {
  const first = component({
    name: 'First', flags: [flag('chosen', 'visible', 'never')],
    beforeLook: C => effect({ raise: { chosen: agents(C).toList().filter(a => a.pos.eq(a.pos)) } }),
  });
  const exp = cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown', extra: [first] }));
  assert.ok(errorsOf(exp).some(e => e.includes('anonymous agents have no order')), errorsOf(exp).join('\n'));
});
