/**
 * Differential test of the generated Lean model against the interpreter (docs/ir.md): on a small
 * instance, the computable Lean round and the interpreter must give the same successors, and
 * every witness of the interpreter must be a witness in Lean (replay of interpreter paths).
 *
 * The interpreter explores the instance with agents kept in index order (as in Lean) and without
 * symmetry reduction; a generated Lean file then evaluates the round on each configuration and
 * prints the successors. Under `Frames.isomorphisms`, Lean is instantiated with the interpreter's
 * reference ordering, `RefOrder.physical` (evaluated, never used in a proof).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Experiment, Type } from '@bramas/simulant-lang/ir';
import type { Layout } from '@bramas/simulant-lang/layout';
import { resolvePub } from '@bramas/simulant-lang/types';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { System, type Config } from '@bramas/simulant-engine/system';
import { canonicalSort, type V } from '@bramas/simulant-engine/values';
import { generateModel, instantiation } from './model';
import { fail } from './translate';

export type DiffReport = { states: number; successors: number; mismatches: string[] };

/** Groups the composed fields by owning component, in component order. */
function parts(lay: Layout, which: 'world' | 'agentFields') {
  const owners: string[] = [];
  for (const f of lay[which]) if (!owners.includes(f.owner)) owners.push(f.owner);
  return owners.map(owner => ({ owner, fields: lay[which].filter(f => f.owner === owner) }));
}

/** `differential` with the positions of a space: their Lean terms and their JSON printers. */
function printers(lib: 'cycle' | 'line' | undefined, vertex: Type) {
  const posTerm = (v: number) => lib === 'cycle' ? `⟨${v}, by decide⟩` : `(${v} : ${lib === 'line' || vertex.k === 'int' ? 'Int' : 'Nat'})`;
  // Positions of the line and of generated spaces are `Int` or `Nat` behind the space's `Pos`: printed with its `Repr`.
  const posJson = (code: string) => lib === 'cycle' ? `(toString ${code}.val)` : `(reprStr ${code})`;

  /** A Lean term for a value, with anonymous constructors (the expected type is always known). */
  const term = (v: V, t: Type): string => {
    switch (t.k) {
      case 'unit': return '()';
      case 'bool': case 'nat': case 'loc': return String(v);
      case 'int': return `(${v} : Int)`;
      case 'pos': return posTerm(v);
      case 'enum': return `.${v}`;
      case 'option': return v === null ? 'none' : `(some ${term(v, t.of)})`;
      case 'list': case 'multiset': return `[${(v as V[]).map(x => term(x, t.of)).join(', ')}]`;
      case 'record': return `⟨${t.fields.map(f => term(v[f.name], f.type)).join(', ')}⟩`;
      default: return fail(`no Lean term for values of type ${t.k}`);
    }
  };

  let depth = 0;
  /** Lean code printing `code` (of type `t`) as JSON. */
  const json = (code: string, t: Type): string => {
    switch (t.k) {
      case 'unit': return '"null"';
      case 'bool': case 'nat': case 'int': case 'loc': return `(toString ${code})`;
      case 'pos': return posJson(code);
      case 'enum': return `("\\"" ++ reprStr ${code} ++ "\\"")`;
      case 'option': {
        const y = `y${depth++}`;
        return `(match ${code} with | none => "null" | some ${y} => ${json(y, t.of)})`;
      }
      case 'list': case 'multiset': {
        const y = `y${depth++}`;
        return `("[" ++ ",".intercalate (${code}.map (fun ${y} => ${json(y, t.of)})) ++ "]")`;
      }
      case 'record':
        return `("{" ++ ${t.fields.map(f => `"\\"${f.name}\\":" ++ ${json(`(${code}).${f.name}`, f.type)}`).join(' ++ "," ++ ')} ++ "}")`
          .replace('"{" ++  ++ "}"', '"{}"');
      default: return fail(`no JSON printer for type ${t.k}`);
    }
  };
  return { term, json };
}

/** Back to interpreter values: enum names lose their Lean namespace, multisets are sorted. */
function normalize(v: V, t: Type): V {
  switch (t.k) {
    case 'enum': return String(v).split('.').pop();
    case 'option': return v === null ? null : normalize(v, t.of);
    case 'list': return v.map((x: V) => normalize(x, t.of));
    case 'multiset': return canonicalSort(t.of)(v.map((x: V) => normalize(x, t.of)));
    case 'record': return Object.fromEntries(t.fields.map(f => [f.name, normalize(v[f.name], f.type)]));
    case 'unit': return null;
    default: return v;
  }
}

/** `mutate` edits the generated Lean source: tests use it to check that differences are detected. */
export function differential(exp: Experiment, params: Record<string, V>, leanDir: string, maxStates = 40,
  mutate: (lean: string) => string = x => x): DiffReport {
  const system = new System(exp, params, { sortAgents: false });
  const explorer = new Explorer(system, { symmetry: false, maxStates });
  explorer.run();
  const configs = explorer.states.map(s => s.config);
  const lay = system.lay;
  const pub = lay.pub, mem = lay.mem;
  const k = configs[0]?.agents.length ?? 0;
  const { base, lib, mparams } = instantiation(exp);
  const { term, json } = printers(lib, base.vertex);
  const worldParts = parts(lay, 'world');
  const fieldParts = parts(lay, 'agentFields');
  const mvals = mparams.map(n => String(params[n])).join(' ');
  const sig = `(sig ${[mvals, k].filter(x => x !== '').join(' ')})`;
  const space = mvals ? `(space ${mvals})` : 'space';
  const radius = Number.isFinite(system.radius) ? system.radius : system.space.vertices!.length;
  const iso = exp.model.frames.kind === 'isomorphisms';
  const model = `(model ${[mvals, k].filter(x => x !== '').join(' ')}${iso ? ` (RefOrder.physical ${space} ${radius})` : ''})`;
  const perRobot = exp.model.frames.kind === 'portPermutations' && exp.model.frames.when === 'perRobot';

  const agentTerm = (a: Config['agents'][number]) => `{ pos := ${term(a.pos, { k: 'pos' })}, frame := [${(a.frame ?? []).join(', ')}], flags := ⟨${
    lay.flags.map(f => String(!!a.f[f.name])).join(', ')}⟩, fields := ⟨${
    fieldParts.map(p => `⟨${p.fields.map(f => term(a.f[f.name], resolvePub(f.type, pub))).join(', ')}⟩`).join(', ')}⟩, pub := ${term(a.pub, pub)}, mem := ${term(a.mem, mem)} }`;
  const configTerm = (C: Config) => `({ agents := #v[${C.agents.map(agentTerm).join(', ')}], world := ⟨${
    worldParts.map(p => `⟨${p.fields.map(f => term(C.world[f.name], f.type)).join(', ')}⟩`).join(', ')}⟩ } : Config ${sig})`;

  const agentJson = `"{\\"pos\\":" ++ ${json('a.pos', { k: 'pos' })} ++ ",\\"frame\\":" ++ ${json('a.frame', { k: 'list', of: { k: 'nat' } })} ++ ",\\"pub\\":" ++ ${json('a.pub', pub)} ++ ",\\"mem\\":" ++ ${json('a.mem', mem)} ++ ",\\"f\\":{" ++ ${
    [...lay.flags.map(f => `"\\"${f.name}\\":" ++ toString a.flags.${f.name}`),
      ...fieldParts.flatMap(p => p.fields.map(f => `"\\"${f.name}\\":" ++ ${json(`a.fields.${p.owner}.${f.name}`, f.type)}`))].join(' ++ "," ++ ') || '""'} ++ "}}"`;
  const worldJson = `"{" ++ ${worldParts.flatMap(p => p.fields.map(f => `"\\"${f.name}\\":" ++ ${json(`C.world.${p.owner}.${f.name}`, f.type)}`)).join(' ++ "," ++ ') || '""'} ++ "}"`;

  const ns = 'DiffModel';
  const lean = `${generateModel(exp, ns)}
open Simulant ${ns}

def jAgent (a : Agent ${sig}) : String := ${agentJson}
def jConfig (C : Config ${sig}) : String :=
  "{\\"agents\\":[" ++ ",".intercalate (C.agents.toList.map jAgent) ++ "],\\"world\\":" ++ (${worldJson}) ++ "}"
def jWitness (w : Witness) : String := "[" ++ ",".intercalate (w.map fun (s, i) => "[\\"" ++ s ++ "\\"," ++ toString i ++ "]") ++ "]"

def configs : List (Config ${sig}) := [
  ${configs.map(configTerm).join(',\n  ')}]

#eval show IO Unit from do
  for C in configs do
    let succ := ${model}.roundA act0 C
    IO.println ("[" ++ ",".intercalate (succ.map fun (w, _, C') => "[" ++ jWitness w ++ "," ++ jConfig C' ++ "]") ++ "]")
`;
  const dir = join(leanDir, '.diff');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${exp.name.replace(/\W+/g, '_')}.lean`);
  writeFileSync(file, mutate(lean));
  const out = execFileSync('lake', ['env', 'lean', file], { cwd: leanDir, encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = out.split('\n').filter(l => l.startsWith('['));
  if (lines.length !== configs.length) fail(`Lean printed ${lines.length} lines for ${configs.length} configurations:\n${out.slice(0, 2000)}`);

  const normConfig = (c: { agents: V[]; world: V }): Config => ({
    agents: c.agents.map((a: V) => ({
      pos: a.pos, pub: normalize(a.pub, pub), mem: normalize(a.mem, mem),
      ...(perRobot ? { frame: a.frame } : {}),
      f: Object.fromEntries([...lay.flags.map(f => [f.name, a.f[f.name]]),
        ...lay.agentFields.map(f => [f.name, normalize(a.f[f.name], f.type)])]),
    })),
    world: normalize(c.world, lay.worldType),
  });
  const mismatches: string[] = [];
  let successors = 0;
  configs.forEach((C, i) => {
    const lean = (JSON.parse(lines[i]) as [[string, number][], { agents: V[]; world: V }][])
      .map(([w, c]) => ({ w: JSON.stringify(w), key: system.key(normConfig(c)) }));
    // The Lean round names the scheduler's choice `activation` (until it is generated: docs/scheduler-design.md, step 4).
    const site = (s: string) => s.startsWith(`${exp.model.scheduler.name}.`) ? 'activation' : s;
    const engine = system.successors(C).map(s => ({ w: JSON.stringify(s.witness.map(c => [site(c.site), c.index])), key: s.key }));
    successors += engine.length;
    const leanKeys = new Set(lean.map(x => x.key));
    const engineKeys = new Set(engine.map(x => x.key));
    for (const key of engineKeys) if (!leanKeys.has(key)) mismatches.push(`state ${i}: successor ${key} only in the interpreter`);
    for (const key of leanKeys) if (!engineKeys.has(key)) mismatches.push(`state ${i}: successor ${key} only in Lean`);
    for (const e of engine) {
      if (!lean.some(l => l.key === e.key && l.w === e.w)) mismatches.push(`state ${i}: witness ${e.w} of ${e.key} is not a Lean witness`);
    }
  });
  return { states: configs.length, successors, mismatches };
}
