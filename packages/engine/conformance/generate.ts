/**
 * Regenerates the conformance fixtures from `packages/stdlib/sim/conformance.sim`:
 *   npx tsx packages/engine/conformance/generate.ts
 * Review the diff: a change means the semantics of the IR or of the library changed.
 */
import { writeFileSync } from 'node:fs';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram, stdlibDir } from '@bramas/simulant-lang/elab/node';
import { conformanceGraph } from '../src/conformance';

/** Fixture file, experiment of conformance.sim, parameters, and state limit. */
const table: [string, string, Record<string, unknown>, number?][] = [
  ['black-hole-emerging', 'blackHoleEmerging', { N: 4, site: 2 }],
  ['black-hole-crash-stop', 'blackHoleCrashStop', { N: 4, site: 3 }],
  ['black-hole-lossy', 'blackHoleLossy', { N: 4, site: 2 }],
  ['two-node-cycle', 'blackHoleEmerging', { N: 2, site: 1 }],
  ['pebbles', 'pebbles', { N: 3, site: 1 }, 5],
  ['gathering-with-crash', 'gatheringRobots', { N: 5, positions: [0, 1, 3], crashNode: 1 }],
  ['dynamic-ring', 'dynamicRing', { N: 4, positions: [0, 1] }],
  ['own-orientation', 'ownOrientation', { N: 4, positions: [0, 1] }],
  ['port-permutations', 'portPermutations', { N: 4, positions: [0, 1] }],
  ['ssync', 'ssync', { N: 3 }],
  ['sequential', 'sequential', { N: 3 }],
  ['parameter-acceptance', 'parameterAcceptance', { N: 4 }],
  ['lights', 'lights', { positions: [0, 0, 2], phi: 1, crashNode: 1 }, 24],
  ['star-gathering', 'starGathering', { k: 3, start: [1, 2, 0] }],
  ['star-dispersion', 'starDispersion', { k: 3 }],
  ['agent-fields', 'agentFields', { N: 3 }],
  ['edge-presence', 'edgePresence', { N: 5 }],
];

const out = compile(loadProgram(stdlibDir + 'conformance.sim'));
const selected = new Set(process.argv.slice(2));
for (const [file, name, params, maxStates] of table) {
  if (selected.size && !selected.has(file)) continue;
  const r = out.experiments[name];
  if (!r?.experiment) throw new Error(`${name}: ${r?.diagnostics.map(d => d.message).join('\n')}`);
  // `source` is display metadata holding absolute paths: fixtures must not depend on the machine.
  const { source: _source, ...algorithm } = r.experiment.algorithm;
  const { source: _expSource, ...experiment } = r.experiment;
  const f = conformanceGraph(file, { ...experiment, algorithm }, params, maxStates);
  writeFileSync(new URL(`./${file}.json`, import.meta.url), JSON.stringify(f) + '\n');
  console.log(`${file}: ${f.states.length} states, ${f.edges.length} edges`);
}
