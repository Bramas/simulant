/**
 * Phase 0, step 0 (docs/core-redesign.md, section 9): baselines of the current ring-based core,
 * written to tests/fixtures/phase0-baselines/ before the rewrite deletes it. Later steps compare
 * the ported projects with these files. The normalization is documented in that directory's
 * README.md.
 *
 *   node --import tsx --import ./packages/vite-plugin/src/register.ts scripts/phase0-baselines.ts
 *   ... scripts/phase0-baselines.ts --only algo3,twoColors      # some experiments
 *   ... scripts/phase0-baselines.ts --skip-decisions            # no stand-up decision tables
 *
 * For each checked setting: the verdict of the exhaustive check (per setting, no graph sharing),
 * the counterexample's kind and length, the number of states the check explored, and the number
 * of reachable configurations up to the model's derived symmetry group, without the goal's
 * pruning. Stand-up gathering also records reachable configurations up to translations and
 * reflection of the line, and the decisions of its three rule sets on exhaustive small views.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { withExperimentLimits } from '@bramas/simulant-engine/check';
import { Symmetry } from '@bramas/simulant-engine/symmetry';
import { System, definition, parameterValues, type Config } from '@bramas/simulant-engine/system';
import type { V } from '@bramas/simulant-engine/values';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests/fixtures/phase0-baselines');
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : undefined;
const skipDecisions = args.includes('--skip-decisions');

type Setting = Record<string, V>;

/** One experiment to record: where it is, which settings, and with which limits. */
type Job = {
  project: string;
  source: string;
  experiment: string;
  settings?: (exp: Experiment) => Setting[];
  /** Replaces the experiment's own limits (recorded in the fixture). */
  limits?: { depth?: number; states?: number };
  /** Instead of checking: why this experiment is not recorded. */
  skip?: string;
  note?: string;
  line?: boolean;
};

/** The settings `projects/standup-gathering/src/project.ts` checks: its examples, every crash node from the left border to one past the right border, padded as its adapter pads them. */
const standupSettings = (extra: number, examples: number[][]) => (exp: Experiment): Setting[] => {
  const requiredVisibility = definition(exp, 'requiredVisibility');
  return examples.flatMap(positions => {
    const phi = requiredVisibility(positions, extra) as number;
    const out: Setting[] = [];
    for (let crashNode = positions[0]; crashNode <= positions[positions.length - 1] + 1; crashNode++) {
      out.push({ positions, phi, crashNode, N: Math.max(64, positions[positions.length - 1] + 2 * phi + 3, crashNode + phi + 2) });
    }
    return out;
  });
};

const bhs = 'projects/black-hole-search/sim';
const sg = 'projects/standup-gathering/sim';
const jobs: Job[] = [
  { project: 'starter', source: 'projects/starter/src/main.sim', experiment: 'cautiousPair' },
  { project: 'black-hole-search', source: `${bhs}/algo0.sim`, experiment: 'algo0',
    note: 'The experiment\'s own state limit (100000): a₁ and a₃ explore further forever when an agent disappears before they meet.' },
  { project: 'black-hole-search', source: `${bhs}/algo1.sim`, experiment: 'algo1' },
  { project: 'black-hole-search', source: `${bhs}/algo2.sim`, experiment: 'algo2' },
  { project: 'black-hole-search', source: `${bhs}/algo3.sim`, experiment: 'algo3' },
  { project: 'black-hole-search', source: `${bhs}/algo4.sim`, experiment: 'algo4' },
  { project: 'black-hole-search', source: `${bhs}/algo5.sim`, experiment: 'algo5Sync' },
  { project: 'black-hole-search', source: `${bhs}/algo5.sim`, experiment: 'algo5', limits: { states: 20000 },
    note: 'Pseudo-random idling: the state space is infinite, so every setting is incomplete unless a counterexample is found first. Recorded with a state limit of 20000 per setting (the experiment declares 100000, which takes minutes per setting); compare with the same limit.' },
  { project: 'black-hole-search', source: `${bhs}/algo6.sim`, experiment: 'algo6Sync' },
  { project: 'black-hole-search', source: `${bhs}/algo6.sim`, experiment: 'algo6', limits: { states: 20000 },
    note: 'Pseudo-random idling: the state space is infinite, so every setting is incomplete unless a counterexample is found first. Recorded with a state limit of 20000 per setting (the experiment declares 100000); compare with the same limit.' },
  { project: 'black-hole-search', source: `${bhs}/algo6.sim`, experiment: 'algo6Async',
    settings: () => [{ N: 5, site: 3 }],
    note: 'SSYNC: agents keep their identities in states. Only the documented counterexample setting (N = 5, site = 3) is recorded: the full domain (N = 5..12) takes far longer than the ordinary suite allows, and the check of the whole experiment stops at this first failure anyway.' },
  { project: 'standup-gathering', source: `${sg}/h-plus-three.sim`, experiment: 'hPlusThree', line: true,
    settings: standupSettings(3, [[0, 2, 4], [0, 1, 2, 4, 6], [0, 1, 3, 4]]) },
  { project: 'standup-gathering', source: `${sg}/h-plus-one.sim`, experiment: 'hPlusOne', line: true,
    settings: standupSettings(1, [[0, 2, 4], [0, 1, 2, 3, 4], [0, 3, 4, 5, 7]]) },
  { project: 'standup-gathering', source: `${sg}/two-colors.sim`, experiment: 'twoColors', line: true,
    settings: standupSettings(0, [[0, 2, 4], [0, 1, 3, 4], [0, 0, 1, 2]]) },
];

const compiled = new Map<string, ReturnType<typeof compile>>();
function experiment(source: string, name: string): Experiment {
  let out = compiled.get(source);
  if (!out) { out = compile(loadProgram(join(root, source))); compiled.set(source, out); }
  const r = out.experiments[name];
  if (!r?.experiment || r.diagnostics.length) throw new Error(`${source}: ${name} does not compile: ${JSON.stringify(r?.diagnostics)}`);
  return r.experiment;
}

/**
 * The orbit of a padded-ring configuration of the stand-up projects under translations and the
 * reflection of the line: agents as sorted (position, crashed, light) triples, and the crash
 * node, translated so that the smallest of these positions is 0; the smaller key of the
 * configuration and its mirror image. The padding guarantees that no observation or move wraps.
 */
function lineOrbit(C: Config): string {
  const lights = (C.world.lights as number[] | undefined);
  const agents = C.agents.map(a => [a.pos as number, a.f.crashed ? 1 : 0, lights ? (lights[a.f.slot as number] ?? 0) : 0]);
  const crash = C.world.crashNode as number;
  const all = [...agents.map(a => a[0]), crash];
  const lo = Math.min(...all), hi = Math.max(...all);
  const key = (f: (p: number) => number) => JSON.stringify([agents.map(([p, c, l]) => [f(p), c, l]).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]), f(crash)]);
  const a = key(p => p - lo), b = key(p => hi - p);
  return a < b ? a : b;
}

/** Reachable configurations up to the derived group (and, for the line, up to its own group), without goal pruning. */
function reachable(system: System, maxStates: number, maxDepth: number, line: boolean) {
  const symmetry = new Symmetry(system);
  const seen = new Map<string, number>();
  const orbits = new Set<string>();
  let frontier: Config[] = [];
  const add = (C: Config, key: string, next: Config[]) => {
    const rep = symmetry.trivial ? { config: C, key } : symmetry.canonical(C, key);
    if (seen.has(rep.key)) return;
    seen.set(rep.key, seen.size);
    if (line) orbits.add(lineOrbit(rep.config));
    next.push(rep.config);
  };
  for (const s of system.initial()) add(s.config, s.key, frontier);
  let depth = 0;
  let complete = true;
  while (frontier.length) {
    if (depth >= maxDepth) { complete = false; break; }
    const next: Config[] = [];
    for (const C of frontier) {
      for (const t of system.successors(C)) add(t.config, t.key, next);
      if (seen.size >= maxStates) break;
    }
    if (seen.size >= maxStates) { complete = false; break; }
    frontier = next;
    depth++;
  }
  return { count: seen.size, complete, depth, lineOrbits: line ? orbits.size : undefined, group: symmetry.group.length };
}

/**
 * The canonical part of a lasso, independent of how states are numbered: the smallest BFS depth
 * of a state on a nontrivial strongly connected component that contains a bad state (one that
 * is not a success; under `eventually`, every state of the component must be bad). FSYNC only:
 * under a fair scheduler the component would also have to be fair.
 */
function lassoStem(explorer: Explorer): number | undefined {
  const { states } = explorer;
  const goal = explorer.system.exp.task.goal;
  const inGraph = (i: number) => !!states[i].succ && (goal === 'eventually' ? states[i].verdict !== 'success' : true);
  const index = new Int32Array(states.length).fill(-1), low = new Int32Array(states.length);
  const onStack = new Uint8Array(states.length);
  const stack: number[] = [];
  let counter = 0, best: number | undefined;
  for (let r = 0; r < states.length; r++) {
    if (!inGraph(r) || index[r] >= 0) continue;
    const work: [number, number][] = [[r, 0]];
    index[r] = low[r] = counter++; stack.push(r); onStack[r] = 1;
    while (work.length) {
      const top = work[work.length - 1];
      const [u, i] = top;
      const succ = states[u].succ!;
      if (i < succ.length) {
        top[1]++;
        const v = succ[i];
        if (!inGraph(v)) continue;
        if (index[v] < 0) { index[v] = low[v] = counter++; stack.push(v); onStack[v] = 1; work.push([v, 0]); }
        else if (onStack[v]) low[u] = Math.min(low[u], index[v]);
        continue;
      }
      work.pop();
      if (work.length) { const p = work[work.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
      if (low[u] !== index[u]) continue;
      const scc: number[] = [];
      let w: number;
      do { w = stack.pop()!; onStack[w] = 0; scc.push(w); } while (w !== u);
      const nontrivial = scc.length > 1 || states[u].succ!.includes(u);
      if (!nontrivial || !scc.some(s => states[s].verdict !== 'success')) continue;
      const depth = Math.min(...scc.map(s => states[s].depth));
      best = best === undefined ? depth : Math.min(best, depth);
    }
  }
  return best;
}

async function record(job: Job) {
  const exp = experiment(job.source, job.experiment);
  const limits = withExperimentLimits(exp, { maxStates: job.limits?.states, maxDepth: job.limits?.depth });
  const settings = job.settings ? job.settings(exp) : [...parameterValues(exp)];
  const rows = [];
  const started = Date.now();
  for (const setting of settings) {
    const system = new System(exp, setting);
    const explorer = new Explorer(system, limits);
    const r = explorer.run();
    const cx = r.counterexample;
    const stem = cx?.kind === 'lasso' && exp.model.round === 'fsync' ? lassoStem(explorer) : undefined;
    const reach = reachable(system, limits.maxStates ?? Infinity, limits.maxDepth ?? Infinity, !!job.line);
    rows.push({
      settings: setting,
      verdict: r.status,
      reason: r.reason,
      ...(cx ? { counterexample: {
        kind: cx.kind, length: cx.steps.length - 1,
        ...(cx.cycleStart !== undefined ? { cycleStart: cx.cycleStart, cycleLength: cx.steps.length - 1 - cx.cycleStart } : {}),
        ...(stem !== undefined ? { minStem: stem } : {}),
      } } : {}),
      explored: r.stats.states,
      reachable: reach.count,
      reachableComplete: reach.complete,
      ...(job.line ? { reachableLineOrbits: reach.lineOrbits } : {}),
    });
  }
  const system = new System(exp, settings[0]);
  const group = new Symmetry(system);
  const fixture = {
    project: job.project,
    source: job.source,
    experiment: job.experiment,
    generatedBy: 'scripts/phase0-baselines.ts',
    model: {
      topology: exp.model.topology.kind ?? exp.model.topology,
      round: exp.model.round,
      frame: exp.model.frame.kind,
      memory: exp.model.memory,
      goal: exp.task.goal,
      task: exp.task.name,
      symmetryGroup: { rotations: group.info.rotations, reflections: group.info.reflections },
    },
    limits: { states: limits.maxStates ?? null, depth: limits.maxDepth ?? null },
    ...(job.note ? { note: job.note } : {}),
    settings: rows,
  };
  const file = join(outDir, job.project, `${job.experiment}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringify(fixture) + '\n');
  const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});
  console.log(`${job.project}/${job.experiment}: ${rows.length} settings ${JSON.stringify(counts)} in ${((Date.now() - started) / 1000).toFixed(1)} s → ${relative(root, file)}`);
}

/** One line per setting, so that diffs show which setting changed. */
function stringify(fixture: Record<string, unknown>): string {
  const { settings, ...head } = fixture as { settings: unknown[] };
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${top},\n  "settings": [\n${settings.map(s => '    ' + JSON.stringify(s)).join(',\n')}\n  ]\n}`;
}

// ---------------------------------------------------------------------------
// Stand-up decisions on exhaustive small views

/**
 * Decision codes. Moves are relative to the view: `+` towards the larger indices of the view
 * (the current `.cw` side, the side of `(neighbors here).at 0` in the target `Line.window`),
 * `-` towards the smaller ones, `0` stay. A light request follows the move for the two-color
 * algorithm: `X` (color 0), `Y` (color 1) or `_` (none).
 */
function decisionCode(d: Record<string, V>, luminous: boolean): string {
  const move = d.move === 'cw' ? '+' : d.move === 'ccw' ? '-' : d.move === 'stay' ? '0' : `?${String(d.move)}`;
  if (!luminous) return move;
  const light = d.light as V;
  return move + (light === null || light === undefined ? '_' : light === 0 ? 'X' : light === 1 ? 'Y' : `?${String(light)}`);
}

/** The algorithm's step on a view, through the system's (deterministic, memoized) step. */
function stepper(exp: Experiment, setting: Setting) {
  const system = new System(exp, setting);
  const a = system.initial()[0].config.agents[0];
  const step = (system as unknown as { step: (mem: V, pub: V, view: Record<string, V>) => Record<string, V> }).step;
  const sensor = exp.algorithm.uses[0];
  return (view: V) => step(a.mem, a.pub, { [sensor]: view });
}

/** Occupancy views of radius r: the k-th view sets the 2r cells other than the center, left to right, to the bits of k from the most significant one; the center is occupied. */
function occupancyView(r: number, k: number): number[] {
  const cells: number[] = [];
  for (let j = 0; j < 2 * r; j++) cells.push((k >> (2 * r - 1 - j)) & 1);
  return [...cells.slice(0, r), 1, ...cells.slice(r)];
}

const COLOR_SETS: number[][] = [[], [0], [1], [0, 1]];
const COLOR_CHARS = '.XYZ';

/** Color-set views of radius r: the k-th view writes k in base 4 over the 2r non-center cells (most significant first; digit d is COLOR_SETS[d]); the center's digit is k's last base-3 digit after that, from {X, Y, Z}. */
function colorView(r: number, k: number): number[][] {
  const center = 1 + (k % 3);
  let rest = Math.floor(k / 3);
  const digits: number[] = [];
  for (let j = 0; j < 2 * r; j++) { digits.unshift(rest % 4); rest = Math.floor(rest / 4); }
  return [...digits.slice(0, r), center, ...digits.slice(r)].map(d => COLOR_SETS[d]);
}

/** A deterministic generator (Park–Miller), so that samples are reproducible; the samples are stored with their views anyway. */
function random(seed: number) {
  let s = seed;
  return () => (s = s * 48271 % 2147483647);
}

function decisions() {
  const out: Record<string, unknown> = {
    generatedBy: 'scripts/phase0-baselines.ts',
    codes: 'One code per view in enumeration order. Moves relative to the view: "+" towards larger indices (current .cw; target Ring.cw = (neighbors here).at 0, the k > 0 side of Line.window), "-" towards smaller indices, "0" stay. Two-color codes add the light request: "X", "Y" or "_" (none).',
  };
  const radii = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  for (const [name, source, experimentName] of [['hPlusThree', `${sg}/h-plus-three.sim`, 'hPlusThree'], ['hPlusOne', `${sg}/h-plus-one.sim`, 'hPlusOne']] as const) {
    const exp = experiment(source, experimentName);
    const byRadius: Record<string, string> = {};
    for (const r of radii(1, 7)) {
      const step = stepper(exp, { positions: [0, 2, 4], phi: r, crashNode: 0, N: 64 });
      let codes = '';
      for (let k = 0; k < 1 << (2 * r); k++) codes += decisionCode(step(occupancyView(r, k)), false);
      byRadius[r] = codes;
    }
    out[name] = {
      algorithm: exp.algorithm.name,
      enumeration: 'Occupancy views of radius r = 1..7, 2^(2r) views each: view k sets the 2r non-center cells, left to right, to the bits of k from the most significant one (1 = occupied); the center is occupied.',
      views: Object.values(byRadius).reduce((n, s) => n + s.length, 0),
      byRadius,
    };
  }
  const exp = experiment(`${sg}/two-colors.sim`, 'twoColors');
  const byRadius: Record<string, string> = {};
  for (const r of radii(1, 3)) {
    const step = stepper(exp, { positions: [0, 2, 4], phi: r, crashNode: 0, N: 64 });
    let codes = '';
    for (let k = 0; k < 3 * 4 ** (2 * r); k++) codes += decisionCode(step(colorView(r, k)), true);
    byRadius[r] = codes;
  }
  // Deterministic samples at larger radii, biased towards sparse views (as in configurations).
  const samples: string[] = [];
  const next = random(20261021);
  for (const r of radii(4, 8)) {
    const step = stepper(exp, { positions: [0, 2, 4], phi: r, crashNode: 0, N: 64 });
    const done = new Set<string>();
    while (done.size < 2000) {
      const cells = Array.from({ length: 2 * r + 1 }, (_, i) => {
        if (i === r) return 1 + next() % 3;
        return next() % 3 === 0 ? 1 + next() % 3 : 0;
      });
      const text = cells.map(d => COLOR_CHARS[d]).join('');
      if (done.has(text)) continue;
      done.add(text);
      samples.push(`${text} ${decisionCode(step(cells.map(d => COLOR_SETS[d])), true)}`);
    }
  }
  out.twoColors = {
    algorithm: exp.algorithm.name,
    enumeration: 'Color-set views of radius r = 1..3, 3·4^(2r) views each: for view k, the center is X, Y or Z for k mod 3 = 0, 1, 2, and floor(k / 3), written in base 4 with 2r digits (most significant first), gives the other cells left to right: 0 = empty, 1 = X only, 2 = Y only, 3 = both (Z). X is color 0, Y color 1.',
    views: Object.values(byRadius).reduce((n, s) => n + s.length / 2, 0),
    byRadius,
    samples: { enumeration: '2000 distinct views per radius r = 4..8, as "view code" with the cells written ".XYZ".', views: samples.length, list: samples },
  };
  const file = join(outDir, 'standup-gathering', 'decisions.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  const total = (out.hPlusThree as { views: number }).views + (out.hPlusOne as { views: number }).views + (out.twoColors as { views: number }).views + samples.length;
  console.log(`standup-gathering/decisions: ${total} views → ${relative(root, file)}`);
}

const skipped: { experiment: string; reason: string }[] = [];
for (const job of jobs) {
  if (only && !only.has(job.experiment)) continue;
  if (job.skip) { skipped.push({ experiment: `${job.project}/${job.experiment}`, reason: job.skip }); continue; }
  await record(job);
}
if (!skipDecisions && (!only || only.has('decisions'))) decisions();
if (skipped.length) console.log('skipped:', skipped);
