/**
 * Compares the generic core with the Phase 0 baselines (tests/fixtures/phase0-baselines/):
 *
 *   node --import tsx scripts/phase0-compare.ts [--only cautiousPair,algo1,decisions]
 *
 * For each setting of each baseline experiment: the verdict, the counterexample (a failure's
 * length; a lasso's kind and, under FSYNC, its canonical `minStem`), and the number of states
 * the check explored up to symmetry (on the line: the reachable configurations up to
 * translations and the mirror image, `reachableLineOrbits`). For the stand-up rules: the decision on every
 * recorded view, from a Look on the line under the identity morphism. The sources are the
 * public projects' `.sim` files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { withExperimentLimits } from '@bramas/simulant-engine/check';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { Symmetry } from '@bramas/simulant-engine/symmetry';
import { System, type Config } from '@bramas/simulant-engine/system';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = option('--only')?.split(',');
const baselines = join(root, 'tests/fixtures/phase0-baselines');

const host = nodeHost();
function load(file: string, name: string): Experiment {
  const r = compile(new Program(host, join(root, 'projects', file))).experiments[name];
  if (!r?.experiment) throw new Error(`${file} ${name}: ${r?.diagnostics.map(d => d.message).join('\n') ?? 'missing'}`);
  return r.experiment;
}

type Counterexample = { kind: string; length: number; minStem?: number };
type Setting = { settings: Record<string, unknown>; verdict: string; counterexample?: Counterexample; explored: number; reachableLineOrbits?: number };
type Baseline = { limits?: { states: number | null; depth: number | null }; settings: Setting[] };

/**
 * The smallest breadth-first depth of a state on a nontrivial strongly connected component of the
 * explored graph containing a non-successful state (as in scripts/phase0-baselines.ts).
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

/** What a counterexample is compared on: a failure's length, a lasso's kind and minStem. */
function shape(c: Counterexample | undefined): string {
  if (!c) return 'none';
  return c.kind === 'failure' ? `failure of length ${c.length}` : `lasso${c.minStem === undefined ? '' : ` with minStem ${c.minStem}`}`;
}

/** Reachable configurations up to the derived group (no pruning by the goal). */
function reachable(system: System, max = 300000): number {
  const sym = new Symmetry(system);
  const seen = new Set<string>();
  const queue = system.initial().map(t => sym.canonical(t.config, t.key));
  for (const q of queue) seen.add(q.key);
  for (let i = 0; i < queue.length && seen.size <= max; i++) {
    for (const t of system.successors(queue[i].config)) {
      const c = sym.canonical(t.config, t.key);
      if (!seen.has(c.key)) { seen.add(c.key); queue.push(c); }
    }
  }
  return seen.size;
}

async function experiment(file: string, name: string, baseline: string, line = false) {
  const exp = load(file, name);
  const base: Baseline = JSON.parse(readFileSync(join(baselines, baseline), 'utf8'));
  let same = 0;
  const diffs: string[] = [];
  for (const s of base.settings) {
    const settings = { ...s.settings };
    if (!exp.params.some(p => p.name === 'N')) delete settings.N;
    try {
      const system = new System(exp, settings);
      const explorer = new Explorer(system, withExperimentLimits(exp, { maxStates: base.limits?.states ?? undefined, maxDepth: base.limits?.depth ?? undefined }));
      const got = explorer.run();
      const cx = got.counterexample;
      const stem = cx?.kind === 'lasso' && exp.model.scheduler.fairness === 'none' ? lassoStem(explorer) : undefined;
      const counterexample = shape(cx && { kind: cx.kind, length: cx.steps.length - 1, ...(stem === undefined ? {} : { minStem: stem }) });
      const count = line ? reachable(system) : got.stats.states;
      const expected = line ? s.reachableLineOrbits : s.explored;
      if (got.status === s.verdict && counterexample === shape(s.counterexample) && count === expected) same++;
      else diffs.push(`${JSON.stringify(settings)}: ${got.status}, ${counterexample}, ${count}; baseline ${s.verdict}, ${shape(s.counterexample)}, ${expected}`);
    } catch (e) {
      diffs.push(`${JSON.stringify(settings)}: ${(e as Error).message}`);
    }
  }
  console.log(`${name}: ${same} of ${base.settings.length} settings equal`);
  for (const d of diffs.slice(0, 10)) console.log(`  ${d}`);
  return diffs.length;
}

/** The stand-up rules' decisions on the baseline views. Cell i of a radius-r view is at physical P - (i - r). */
function decisions(): number {
  const table = JSON.parse(readFileSync(join(baselines, 'standup-gathering/decisions.json'), 'utf8'));
  const P = 1000;
  const systems = new Map<string, System>();
  const decide = (exp: Experiment, r: number, cells: number[][], luminous: boolean): string => {
    const key = `${exp.name}/${r}`;
    const sys = systems.get(key) ?? new System(exp, { positions: [P], phi: r, crashNode: -1000000 });
    systems.set(key, sys);
    const start = sys.initial()[0].config;
    const agents = cells.flatMap((lights, i) => lights.map(light => ({ ...start.agents[0], pos: P + r - i, f: { ...start.agents[0].f, ...(luminous ? { light } : {}) } })));
    const C: Config = { agents, world: start.world };
    const [first] = sys.decisionsOf(C, agents.findIndex(a => a.pos === P));
    const t = first.decision.target;
    const move = t === P ? '0' : t === P - 1 ? '+' : t === P + 1 ? '-' : '?';
    if (!luminous) return move;
    const light = first.decision.setLight;
    return move + (light === null ? '_' : light === 0 ? 'X' : 'Y');
  };
  let bad = 0, total = 0;
  const check = (what: string, expected: string, got: string) => {
    total++;
    if (expected !== got && ++bad <= 10) console.log(`  ${what}: expected ${expected}, got ${got}`);
  };
  for (const [file, name] of [['standup-gathering/sim/h-plus-three.sim', 'hPlusThree'], ['standup-gathering/sim/h-plus-one.sim', 'hPlusOne']] as const) {
    const exp = load(file, name);
    for (const [rs, codes] of Object.entries(table[name].byRadius as Record<string, string>)) {
      const r = Number(rs);
      for (let k = 0; k < 2 ** (2 * r); k++) {
        const bits = k.toString(2).padStart(2 * r, '0').split('').map(Number);
        const occ = [...bits.slice(0, r), 1, ...bits.slice(r)];
        check(`${name} ${occ.join('')}`, codes[k], decide(exp, r, occ.map(o => o ? [0] : []), false));
      }
    }
  }
  const exp = load('standup-gathering/sim/two-colors.sim', 'twoColors');
  const SETS = [[], [0], [1], [0, 1]];
  for (const [rs, codes] of Object.entries(table.twoColors.byRadius as Record<string, string>)) {
    const r = Number(rs);
    for (let k = 0; k < 3 * 4 ** (2 * r); k++) {
      const digits = Math.floor(k / 3).toString(4).padStart(2 * r, '0').split('').map(Number);
      const cells = [...digits.slice(0, r).map(d => SETS[d]), [[0], [1], [0, 1]][k % 3], ...digits.slice(r).map(d => SETS[d])];
      check(`twoColors r=${r} view ${k}`, codes.slice(2 * k, 2 * k + 2), decide(exp, r, cells, true));
    }
  }
  for (const entry of table.twoColors.samples.list as string[]) {
    const [view, code] = entry.split(' ');
    check(`twoColors ${view}`, code, decide(exp, (view.length - 1) / 2, view.split('').map(c => SETS['.XYZ'.indexOf(c)]), true));
  }
  console.log(`decisions: ${total - bad} of ${total} equal`);
  return bad;
}

const table: [string, string, string, boolean?][] = [
  ['starter/src/main.sim', 'cautiousPair', 'starter/cautiousPair.json'],
  ...['algo0', 'algo1', 'algo2', 'algo3', 'algo4'].map(a => [`black-hole-search/sim/${a}.sim`, a, `black-hole-search/${a}.json`] as [string, string, string]),
  ['black-hole-search/sim/algo5.sim', 'algo5Sync', 'black-hole-search/algo5Sync.json'],
  ['black-hole-search/sim/algo6.sim', 'algo6Sync', 'black-hole-search/algo6Sync.json'],
  ['black-hole-search/sim/algo5.sim', 'algo5', 'black-hole-search/algo5.json'],
  ['black-hole-search/sim/algo6.sim', 'algo6', 'black-hole-search/algo6.json'],
  ['black-hole-search/sim/algo6.sim', 'algo6Async', 'black-hole-search/algo6Async.json'],
  ['standup-gathering/sim/h-plus-one.sim', 'hPlusOne', 'standup-gathering/hPlusOne.json', true],
  ['standup-gathering/sim/h-plus-three.sim', 'hPlusThree', 'standup-gathering/hPlusThree.json', true],
  ['standup-gathering/sim/two-colors.sim', 'twoColors', 'standup-gathering/twoColors.json', true],
];

async function main() {
  let failures = 0;
  for (const [file, name, baseline, line] of table) {
    if (!only || only.includes(name)) failures += await experiment(file, name, baseline, line);
  }
  if (!only || only.includes('decisions')) failures += decisions();
  console.log(failures ? `${failures} difference(s)` : 'every compared baseline is reproduced');
  process.exitCode = failures ? 1 : 0;
}

void main();
