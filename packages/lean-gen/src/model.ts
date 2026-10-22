/**
 * Generates the Lean model file of an experiment (docs/ir.md; lean/Simulant/Round.lean): the
 * space, the composed types, the instances that give each component its part of the state, the
 * sensors and the algorithm, the model, the task, the initial configurations, the parameter
 * domains, and the statements to prove.
 *
 * The model's arguments are the experiment parameters it reads (the space's arguments, the
 * observation radius, the number of missing edges) and the number of agents `nAgents`. Under
 * `Frames.isomorphisms`, the model also takes the reference ordering, and the statements
 * quantify over the lawful ones (docs/core-redesign.md, section 3).
 */
import { check } from '@bramas/simulant-lang/check';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import type { Component, Expr, Experiment, Field, Space, Type } from '@bramas/simulant-lang/ir';
import { showType, T, typeEq } from '@bramas/simulant-lang/types';
import { componentInfo, enumDecl, enumsInExpr, enumsOf, generateComponent, sensorDef, structDecl } from './component';
import { libraryComponents, libraryNamespace } from './library';
import { algorithmLocalDefs, fail, ident, Translator, wrap, type Env } from './translate';

/**
 * What a part of the generated file translates, for the page's Lean view: a piece of the
 * experiment (`name`: its parameter, component, sensor or definition; `pc`: the case of the
 * algorithm's step that resumes there), or `composition`, the glue that combines the components.
 */
export type LeanOrigin = {
  kind: 'experiment' | 'model' | 'composition' | 'component' | 'sensor' | 'definition' | 'algorithm' | 'task' | 'goal' | 'param';
  name?: string;
  pc?: string;
};
export type LeanRegion = { line: number; endLine: number; origin: LeanOrigin };
/** A generated file and the lines each part of it comes from. */
export type GeneratedModel = { text: string; regions: LeanRegion[] };

/** Whether a component of the experiment is the library's (same IR, whatever the arguments). */
export function isLibrary(c: Component): boolean {
  const lib = libraryComponents.find(l => l.name === c.name);
  const strip = (x: Component) => JSON.stringify({ ...x, args: undefined });
  return !!lib && strip(lib) === strip(c);
}

type GraphSpace = Extract<Space, { kind: 'graph' }>;

/** The library's graph spaces, by name, as the frontend compiles them in an experiment. */
const librarySpaces: Map<string, GraphSpace> = (() => {
  const host = nodeHost();
  const file = '/simulant-lean-gen/library-spaces.sim';
  const source = `import "std/models.sim"
algorithm Idle where
  main := stay
${['Graphs.Cycle N', 'Graphs.Line'].map((s, i) => `experiment e${i} where
  model := robots (${s}) (Observe.radius 1) Frames.identity []
  algorithm := Idle
  task := Gathering
  param N : Nat in [3]
  agents := 1
  position i := pos 0
`).join('')}`;
  const out = compile(new Program({ ...host, read: p => p === file ? source : host.read(p) }, file));
  const spaces = new Map<string, GraphSpace>();
  for (const r of Object.values(out.experiments)) {
    const s = r.experiment?.model.space;
    if (s?.kind === 'graph') spaces.set(s.name, s);
  }
  return spaces;
})();

/** `cycle` or `line` when the space is the library's (whatever its arguments). */
export function librarySpace(s: GraphSpace): 'cycle' | 'line' | undefined {
  const lib = librarySpaces.get(s.name);
  const strip = (x: GraphSpace) => JSON.stringify({ ...x, args: undefined });
  if (!lib || strip(lib) !== strip(s)) return undefined;
  return s.name === 'Graphs.Cycle' ? 'cycle' : 'line';
}

/** Whether a type needs the composition (positions, agents, configurations, Looks). */
function composed(t: Type): boolean {
  switch (t.k) {
    case 'pos': case 'agent': case 'config': case 'look': case 'decision': case 'effect': return true;
    case 'option': case 'list': case 'multiset': return composed(t.of);
    case 'record': return t.fields.some(f => composed(f.type));
    default: return false;
  }
}

/**
 * The definitions that take the model's arguments: those that read the Look, mention the
 * composition in their signature, or call a builtin or definition that needs it.
 */
function composedDefs(defs: Experiment['algorithm']['defs'] & {}, local: Set<string>): Set<string> {
  const out = new Set<string>();
  const byName = new Map(defs.map(d => [d.name, d]));
  const needs = (x: unknown, seen: Set<string>): boolean => {
    if (!x || typeof x !== 'object') return false;
    if (Array.isArray(x)) return x.some(y => needs(y, seen));
    const o = x as Record<string, unknown>;
    if (o.e === 'lit' && composed(o.type as Type)) return true;
    if (o.e === 'call') {
      const fn = o.fn as string;
      if (['pos', 'positions', 'agents', 'resolve', 'follow'].includes(fn)) return true;
      const d = byName.get(fn);
      if (d && !seen.has(fn)) {
        seen.add(fn);
        if (local.has(fn) || [d.ret, ...d.params.map(p => p.type)].some(composed) || needs(d.body, seen)) return true;
      }
    }
    return Object.values(o).some(v => needs(v, seen));
  };
  for (const d of defs) {
    if (local.has(d.name) || [d.ret, ...d.params.map(p => p.type)].some(composed) || needs(d.body, new Set([d.name]))) out.add(d.name);
  }
  return out;
}

/** The space of an experiment, whether it is a library space, and the parameters the instantiated model reads. */
export function instantiation(exp: Experiment): { base: GraphSpace; lib: 'cycle' | 'line' | undefined; mparams: string[] } {
  const { model } = exp;
  const base = model.space.kind === 'dynamic' ? model.space.base : model.space;
  if (base.kind !== 'graph') fail('only graph spaces have a Lean translation');
  const missing = model.space.kind === 'dynamic' ? model.space.missing : undefined;
  const radius = model.observation.kind === 'radius' ? model.observation.r : undefined;
  const read = paramsIn([base.args, missing, radius], new Set());
  return { base, lib: librarySpace(base), mparams: exp.params.filter(p => read.has(p.name)).map(p => p.name) };
}

export function generateModel(exp: Experiment, namespace: string): string {
  return generateMappedModel(exp, namespace).text;
}

/**
 * A root `(match x with | a => ... | b => ...)` with one case per line. The term is the same:
 * Lean reads line breaks inside parentheses as spaces.
 */
export function casesOnLines(code: string, indent: string): string {
  if (!code.startsWith('(match ') || !code.endsWith(')')) return code;
  const cuts: number[] = [];
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') {
      for (i++; i < code.length && code[i] !== '"'; i++) if (code[i] === '\\') i++;
    } else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (--depth === 0 && i !== code.length - 1) return code;
    } else if (depth === 1 && ch === '|' && code[i - 1] === ' ' && code[i + 1] === ' ') cuts.push(i);
  }
  if (!cuts.length) return code;
  return code.slice(0, cuts[0] - 1) + cuts.map((c, j) => `\n${indent}${code.slice(c, j + 1 < cuts.length ? cuts[j + 1] - 1 : undefined)}`).join('');
}

/** The experiment parameters an expression reads. */
function paramsIn(e: unknown, out: Set<string>): Set<string> {
  if (!e || typeof e !== 'object') return out;
  if (Array.isArray(e)) { e.forEach(x => paramsIn(x, out)); return out; }
  const o = e as Record<string, unknown>;
  if (o.e === 'param') out.add(o.name as string);
  for (const v of Object.values(o)) paramsIn(v, out);
  return out;
}

export function generateMappedModel(exp: Experiment, namespace: string): GeneratedModel {
  const checked = check(exp);
  if (checked.errors.length) fail(`the experiment does not typecheck:\n${checked.errors.join('\n')}`);
  const lay = checked.layout;
  const { model, algorithm, task } = exp;
  const params = exp.params;

  // The space, and the parameters of the instantiated model.
  const base = model.space.kind === 'dynamic' ? model.space.base : model.space;
  if (base.kind !== 'graph') fail('only graph spaces have a Lean translation');
  const lib = librarySpace(base);
  const missing = model.space.kind === 'dynamic' ? model.space.missing : undefined;
  const radius = model.observation.kind === 'radius' ? model.observation.r : undefined;
  const read = paramsIn([base.args, missing, radius], new Set());
  const mparams = params.filter(p => read.has(p.name));
  /** A parameter that a cycle's size reads must be positive (`NeZero`) for its positions to exist. */
  let cycleSize: string | undefined;
  if (lib === 'cycle') {
    const n = base.args?.n;
    if (n?.e !== 'param') fail('the size of a cycle must be an experiment parameter');
    cycleSize = n.name;
  }
  const binder = (p: Field, posType: (t: Type) => string) =>
    p.name === cycleSize ? `(${ident(p.name)} : Nat) [NeZero ${ident(p.name)}]` : `(${ident(p.name)} : ${posType(p.type)})`;
  const mArgs = mparams.map(p => ident(p.name)).join(' ');
  const spaceCode = mparams.length ? `(space ${mArgs})` : 'space';
  const sigCode = `(sig ${[mArgs, 'nAgents'].filter(Boolean).join(' ')})`;
  const iso = model.frames.kind === 'isomorphisms';

  // Components: library ones are referenced, others are generated in this file.
  const comps = model.components.map(c => {
    const library = isLibrary(c);
    const ns = library ? libraryNamespace(c.name) : `${namespace}.Components.${c.name}`;
    return { c, ns, library, info: componentInfo(c, ns) };
  });

  // Enums: those of components are qualified by their namespace.
  const enumNames = new Map<string, string>();
  for (const { info, ns } of comps) for (const e of info.enums) enumNames.set(e.name, `${ns}.${ident(e.name)}`);
  const local = new Map<string, string[]>();
  // A definition used by several pieces (the algorithm and the task) is generated once.
  const allDefs = [...(model.defs ?? []), ...(algorithm.defs ?? []), ...(task.defs ?? [])]
    .filter((d, i, all) => all.findIndex(x => x.name === d.name) === i);
  for (const t of [algorithm.pub, algorithm.mem, ...params.map(p => p.type), ...allDefs.flatMap(d => [d.ret, ...d.params.map(p => p.type)])]) enumsOf(t, local);
  for (const e of [algorithm.step, algorithm.init.pub, algorithm.init.mem, algorithm.line, task.verdict,
    ...model.sensors.flatMap(s => [s.body, ...(s.look ?? []).map(b => b.value)]), ...params.flatMap(p => [p.domain, p.accepts]),
    exp.agents.pos, exp.agents.count, ...allDefs.map(d => d.body)]) enumsInExpr(e, local);
  for (const name of [...local.keys()]) {
    if (enumNames.has(name)) local.delete(name);
    else enumNames.set(name, ident(name));
  }

  // Record types: the algorithm's public state and memory, then anonymous ones.
  const records: { t: Type; name: string; decl?: string }[] = [];
  let anonymous = 0;
  type Chunk = { text: string; origin?: LeanOrigin };
  const localDefs = algorithmLocalDefs(allDefs);
  const sigDefs = composedDefs(allDefs, localDefs);
  const defArgs = (n: string) => sigDefs.has(n) ? [mArgs, 'nAgents'].filter(Boolean).join(' ') : '';
  const posOf = (v: string) => lib === 'cycle' ? `(Spaces.cyclePos ${ident(cycleSize!)} ${wrap(v)})` : `(${wrap(v)} : ${lib === 'line' || base.vertex.k === 'int' ? 'Int' : 'Nat'})`;
  const env = (look?: string): Env => ({
    space: spaceCode, pos: `${spaceCode}.Pos`, posOf, sig: sigCode, agent: 'Fin nAgents', k: 'nAgents', pub: 'Pub',
    typeName: t => {
      if (t.k === 'enum') return enumNames.get(t.name) ?? fail(`unknown enum ${t.name}`);
      if (t.k !== 'record') return fail(`no name for ${showType(t)}`);
      const known = records.find(r => typeEq(r.t, t));
      if (known) return known.name;
      // The types of the fields are named (and declared) first.
      const name = `Rec${anonymous++}`;
      const decl = structDecl(name, '', (t as { fields: Field[] }).fields, x => modelTr.type(x));
      records.push({ t, name, decl });
      return name;
    },
    worldField: (C, f) => `${C}.world.${ident(lay.world.find(w => w.name === f)!.owner)}.${ident(f)}`,
    agentFlag: (a, f) => `${a}.flags.${ident(f)}`,
    agentField: (a, f) => `${a}.fields.${ident(lay.agentFields.find(x => x.name === f)!.owner)}.${ident(f)}`,
    decisionAction: () => fail('decisions are only read by components'),
    param: name => ident(name),
    paramType: name => params.find(p => p.name === name)?.type ?? fail(`unknown parameter ${name}`),
    ...(look ? { look, sensors: 'E' } : {}),
    layout: lay,
    defs: new Map(allDefs.map(d => [d.name, d])),
    defName: n => [ident(n), defArgs(n)].filter(Boolean).join(' '),
    localDefs,
  });
  const modelTr = new Translator(env());
  for (const [name, t] of [['Pub', algorithm.pub], ['Mem', algorithm.mem]] as const) {
    if (t.k === 'record') records.push({ t, name, decl: structDecl(name, '', t.fields, x => modelTr.type(x)) });
  }
  const typeOf = (t: Type) => t.k === 'record' ? records.find(r => typeEq(r.t, t))!.name : modelTr.type(t);
  const pubT = typeOf(algorithm.pub);
  const memT = typeOf(algorithm.mem);

  const body: Chunk[] = [];
  const emit = (text: string, origin: LeanOrigin = { kind: 'composition' }) => body.push({ text, origin });
  const mBinders = mparams.map(p => binder(p, t => modelTr.type(t))).join(' ');
  const secBinders = [mBinders, '(nAgents : Nat)'].filter(Boolean).join(' ');

  // The space
  if (lib === 'cycle') {
    emit(`abbrev space ${mBinders} : Space := Spaces.cycle ${wrap(new Translator(env()).root(base.args!.n, []).code)}\n`, { kind: 'model' });
  } else if (lib === 'line') {
    emit(`abbrev space ${mBinders} : Space := Spaces.line\n`, { kind: 'model' });
  } else {
    if (base.vertex.k !== 'nat' && base.vertex.k !== 'int') fail(`${base.name}: only vertices of type Nat or Int have a Lean translation`);
    const vt = base.vertex.k === 'nat' ? 'Nat' : 'Int';
    const sTr = new Translator(env());
    const sVars = (base.params ?? []).map(p => [p.name, ident(p.name), p.type] as [string, string, Type]);
    const lets = (base.params ?? []).map(p => `let ${ident(p.name)} := ${sTr.root(base.args![p.name], []).code}\n  `).join('');
    const nb = sTr.root(base.neighbors.body, [...sVars, [base.neighbors.vertex, ident(base.neighbors.vertex), base.vertex]]).code;
    const vs = base.vertices ? sTr.root(base.vertices, sVars).code : undefined;
    emit(`def space ${mBinders} : Space :=
  ${lets}let nbrs := fun (${ident(base.neighbors.vertex)} : ${vt}) => ${nb}
  { Pos := ${vt}, neighbors := nbrs, vertices := ${vs ? `some ${wrap(vs)}` : 'none'},
    maxDegree := ${vs ? `(${wrap(vs)}.map fun v => (nbrs v).length).foldl max 0` : '2'}, le := fun a b => decide (a ≤ b) }
`, { kind: 'model' });
  }

  // Flags
  const flags = lay.flags;
  emit(structDecl('Flags', '', flags.map(f => ({ name: f.name, type: T.bool })), () => 'Bool'));
  const anyOf = (names: string[], f: string) => names.length ? names.map(n => `${f}.${ident(n)}`).join(' || ') : 'false';
  const never = flags.filter(f => f.acts === 'never').map(f => f.name);
  const adversary = flags.filter(f => f.acts === 'adversary').map(f => f.name);
  emit(`instance : FlagSet Flags where
  none := { ${flags.map(f => `${ident(f.name)} := false`).join(', ')} }
  merge f g := { ${flags.map(f => `${ident(f.name)} := f.${ident(f.name)} || g.${ident(f.name)}`).join(', ')} }
  correct f := !(${anyOf(flags.map(f => f.name), 'f')})
  present f := !(${anyOf(flags.filter(f => f.visibility === 'hidden').map(f => f.name), 'f')})
  acts f := if ${anyOf(never, 'f')} then .never else if ${anyOf(adversary, 'f')} then .adversary else .algorithm
`);
  const fv = (p: string) => flags.map((_, i) => `${p}${i}`);
  emit(`instance : LawfulFlagSet Flags where
  acts_merge_never f g := by
    obtain ⟨${fv('a').join(', ')}⟩ := f
    obtain ⟨${fv('b').join(', ')}⟩ := g
    ${[...fv('a'), ...fv('b')].map(v => `cases ${v} <;> `).join('')}decide
`);
  for (const { c, ns } of comps) {
    const own = (c.flags ?? []);
    if (!own.length) { emit(`instance : ${ns}.Flags Flags where\n`); continue; }
    emit(`instance : ${ns}.Flags Flags where
${own.map(f => {
      const n = ident(f.name);
      return `  ${n} f := f.${n}
  raise_${n} := { (FlagSet.none : Flags) with ${n} := true }
  ${n}_raise := rfl
  ${n}_merge _ _ := rfl
  ${n}_none := rfl`;
    }).join('\n')}
`);
  }

  // Actions
  const actionFields = lay.actions.map(a => ({ name: a.name, type: a.type }));
  emit(structDecl('Actions', '', actionFields, t => modelTr.type(t)));
  emit(`def act0 : Actions := { ${lay.actions.map(a => `${ident(a.name)} := ${modelTr.lit(a.default, a.type)}`).join(', ')} }\n`);
  for (const { c, ns } of comps) {
    const own = c.actions ?? [];
    emit(own.length
      ? `instance : ${ns}.Actions Actions where\n${own.map(a => `  ${ident(a.name)} a := a.${ident(a.name)}`).join('\n')}\n`
      : `instance : ${ns}.Actions Actions where\n`);
  }

  // World and agent fields: one part per component that has some.
  const withWorld = comps.filter(x => x.info.hasWorld);
  const withFields = comps.filter(x => x.info.hasFields);
  emit(`structure World (P : Type) where\n${withWorld.map(x => `  ${ident(x.c.name)} : ${x.ns}.World P`).join('\n')}\nderiving DecidableEq, Repr\n`);
  emit(`structure Fields (P : Type) where\n${withFields.map(x => `  ${ident(x.c.name)} : ${x.ns}.Fields P`).join('\n')}\nderiving DecidableEq, Repr\n`);

  // The sensor environment: one field per sensor the algorithm uses (a function of the location
  // for a per-location sensor).
  const envFields = lay.used.map(s => `  ${ident(s.name)} : ${s.perLocation ? 'Nat → ' : ''}${modelTr.type(modelTr.resolve(s.type))}`);
  emit(`/-- What the algorithm's sensors return in one Look. -/\nstructure Env where\n${envFields.join('\n')}\n`, { kind: 'algorithm' });
  emit(`abbrev sig ${secBinders} : Sig :=
  { S := ${spaceCode}, k := nAgents, F := Flags, X := Fields ${spaceCode}.Pos, P := ${pubT}, M := ${memT}, A := Actions,
    W := World ${spaceCode}.Pos, E := Env }
`);
  for (const { c, ns, info } of comps) {
    const parts = [
      info.hasWorld ? `  world := ⟨fun w => w.${ident(c.name)}, fun w x => { w with ${ident(c.name)} := x }⟩` : '',
      info.hasFields ? `  fields := ⟨fun x => x.${ident(c.name)}, fun x y => { x with ${ident(c.name)} := y }⟩` : '',
    ].filter(Boolean);
    emit(`def ctx_${c.name} ${secBinders} : ${ns}.Ctx ${sigCode} where\n${parts.join('\n')}\n`);
  }

  // Definitions (callees first). Those that read the Look take it and the sensors first.
  const defTr = new Translator(env('L'));
  for (const d of allDefs) {
    const isLocal = localDefs.has(d.name);
    const r = defTr.root(d.body, d.params.map(p => [p.name, ident(p.name), p.type]));
    if (r.nd) fail(`definition ${d.name} contains choices: it has no Lean translation yet`);
    const binders = [sigDefs.has(d.name) ? secBinders : '', isLocal ? `(L : Look ${sigCode}) (E : Env)` : '',
      ...d.params.map(p => `(${ident(p.name)} : ${defTr.type(defTr.resolve(p.type))})`)].filter(Boolean).join(' ');
    emit(`def ${ident(d.name)} ${binders} : ${defTr.type(defTr.resolve(d.ret))} :=\n  ${r.code}\n`, { kind: 'definition', name: d.name });
  }

  // Sensors and the environment of a Look
  const envBinds: string[] = [];
  for (const s of lay.used) {
    const owner = comps.find(x => x.c.name === s.owner);
    if (owner) {
      const args = (owner.c.params ?? []).map(p => wrap(modelTr.lit(owner.c.args![p.name], p.type)));
      envBinds.push(`let ${ident(s.name)} ← ${owner.ns}.sensor_${ident(s.name)} (ctx_${owner.c.name} ${[mArgs, 'nAgents'].filter(Boolean).join(' ')}) ${args.join(' ')} L`);
    } else {
      emit(sensorDef(modelTr, s, secBinders, [], sigCode), { kind: 'sensor', name: s.name });
      envBinds.push(`let ${ident(s.name)} ← sensor_${ident(s.name)} ${[mArgs, 'nAgents'].filter(Boolean).join(' ')} L`);
    }
  }
  emit(`def env ${secBinders} (L : Look ${sigCode}) : ND Env := do
${envBinds.map(b => `  ${b}\n`).join('')}  pure { ${lay.used.map(s => `${ident(s.name)} := ${ident(s.name)}`).join(', ')} }
`, { kind: 'algorithm' });

  // The algorithm
  const algTr = new Translator(env('L'));
  const stepVars = [['mem', 'mem', algorithm.mem], ['pub', 'pub', algorithm.pub]] as [string, string, Type][];
  const actOf = (get: (name: string) => string | undefined) =>
    `{ ${lay.actions.map(a => `${ident(a.name)} := ${get(a.name) ?? modelTr.lit(a.default, a.type)}`).join(', ')} }`;
  let stepCode: string;
  if (algorithm.native) fail(`algorithm ${algorithm.name} is native: it has no Lean translation`);
  if (algorithm.step.e === 'record') {
    const f = algorithm.step.fields;
    const tr = (n: string) => algTr.root(f[n], stepVars).code;
    stepCode = `{ move := ${tr('move')}, pub := ${f.pub ? tr('pub') : 'pub'}, mem := ${f.mem ? tr('mem') : 'mem'}, act := ${actOf(n => f[n] ? tr(n) : undefined)} }`;
  } else {
    const r = algTr.root(algorithm.step, stepVars);
    const has = (n: string) => r.t.k === 'record' && r.t.fields.some(x => x.name === n);
    stepCode = `let d := ${casesOnLines(r.code, '    ')}\n  { move := d.move, pub := ${has('pub') ? 'd.pub' : 'pub'}, mem := ${has('mem') ? 'd.mem' : 'mem'}, act := ${actOf(n => has(n) ? `d.${ident(n)}` : undefined)} }`;
  }
  emit(`def step ${secBinders} (mem : ${memT}) (pub : ${pubT}) (L : Look ${sigCode}) (E : Env) : Out ${sigCode} :=\n  ${stepCode}\n`, { kind: 'algorithm', name: 'step' });

  // The model
  const rTr = new Translator(env());
  const radiusCode = radius ? rTr.root(radius, []).code : `(${spaceCode}.vertices.getD []).length`;
  const tstates = missing ? `${spaceCode}.dynamicStates ${wrap(rTr.root(missing, []).code)}` : '[[]]';
  const frames = model.frames;
  const symmetries = () => {
    if (!lib) fail(`${base.name}: port permutations among its symmetries have no Lean translation yet`);
    return '[[0, 1], [1, 0]]';
  };
  const perms = frames.kind === 'portPermutations'
    ? (frames.among === 'all' ? `(Space.permutations ${spaceCode}.maxDegree)` : symmetries())
    : undefined;
  const framesCode = frames.kind === 'isomorphisms' ? '.isomorphisms ord'
    : frames.kind === 'identity' ? `.perLook [List.range ${spaceCode}.maxDegree]`
    : frames.when === 'perLook' ? `.perLook ${perms}` : '.perRobot';
  const ordBinder = iso ? ` (ord : RefOrder ${spaceCode})` : '';
  const compCode = comps.map(({ c, ns }) => {
    const args = (c.params ?? []).map(p => wrap(modelTr.lit(c.args![p.name], p.type)));
    return `${ns}.component ${args.join(' ')} (ctx_${c.name} ${[mArgs, 'nAgents'].filter(Boolean).join(' ')})`;
  });
  const sec = [mArgs, 'nAgents'].filter(Boolean).join(' ');
  emit(`def model ${secBinders}${ordBinder} : Model ${sigCode} where
  tstates := ${tstates}
  components := [${compCode.join(',\n    ')}]
  radius := ${radiusCode}
  frames := ${framesCode}
  round := .${model.round}
  env := env ${sec}
  step := step ${sec}
`, { kind: 'model' });
  const taskTr = new Translator(env());
  emit(`def verdict ${secBinders} (C : Config ${sigCode}) : Verdict :=\n  ${taskTr.root(task.verdict, [['C', 'C', T.config]], 'C').code}\n`, { kind: 'task' });
  if (algorithm.line) emit(`def line (mem : ${memT}) : Nat :=\n  ${casesOnLines(algTr.root(algorithm.line, [['mem', 'mem', algorithm.mem]]).code, '    ')}\n`, { kind: 'algorithm', name: 'line' });
  emit(`def goal : Goal := .${task.goal}\n`, { kind: 'goal' });

  // Each component's part of the world is written by that component only.
  for (const { c } of withWorld) {
    emit(`instance ${secBinders} : LawfulLens (ctx_${c.name} ${sec}).world := ⟨fun _ _ => rfl⟩\n`);
    const cases = comps.map(x => x.c.name === c.name
      ? '  · exact Or.inl rfl'
      : '  · exact Or.inr (Hooks.toComponent_preserves _ _ _ _ fun _ _ => rfl)');
    const ordArg = iso ? ' ord' : '';
    emit(`/-- The other components of the model preserve the part of the world that \`${c.name}\` owns. -/
theorem others_preserve_${c.name} ${secBinders}${ordBinder} :
    ∀ c ∈ (model ${sec}${ordArg}).components, c = ${compCode[comps.findIndex(x => x.c.name === c.name)]} ∨ c.Preserves (ctx_${c.name} ${sec}).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with ${comps.map(() => 'rfl').join(' | ')}
${cases.join('\n')}
`);
  }

  // Parameters, initial configurations, statements
  const initTr = new Translator(env());
  const pBinder = (p: Field) => binder(p, t => initTr.type(t));
  const kCode = initTr.root(exp.agents.count, []).code;
  const args = params.map(p => ident(p.name)).join(' ');
  const countCall = `(count ${args})`;
  const sigOf = `(sig ${[mArgs, countCall].filter(Boolean).join(' ')})`;
  for (const [i, p] of params.entries()) {
    const before = params.slice(0, i).map(pBinder).join(' ');
    if (p.domain) {
      const r = initTr.root(p.domain, []);
      emit(`def domain_${ident(p.name)} ${before} : List (${initTr.type(p.type)}) :=\n  ${r.code}\n`, { kind: 'param', name: p.name });
    }
    if (p.accepts) {
      const r = initTr.root(p.accepts, []);
      emit(`def accepts_${ident(p.name)} ${before} ${pBinder(p)} : Bool :=\n  ${r.code}\n`, { kind: 'param', name: p.name });
    }
  }
  const i = [['i', 'i', T.nat]] as [string, string, Type][];
  const pos = initTr.root(exp.agents.pos, i).code;
  const pub = initTr.root(algorithm.init.pub, i).code;
  const mem = initTr.root(algorithm.init.mem, i).code;
  const initLines: string[] = [];
  const fieldInits: string[] = [];
  let frameInit = '[]';
  if (frames.kind === 'portPermutations' && frames.when === 'perRobot') {
    initLines.push(`let frames ← (List.range ${wrap(kCode)}).mapM (fun i => ND.choose ("frame a" ++ toString i) ${wrap(perms!)})`);
    frameInit = 'frames[i]!';
  }
  for (const { c, ns, info } of withFields) {
    const cargs = (c.params ?? []).map(p => wrap(initTr.lit(c.args![p.name], p.type)));
    const inputs = info.inputs.map(x => ident(x.name));
    for (const f of c.agent!) {
      const v = `f_${c.name}_${f.name}`;
      initLines.push(`let ${v} ← (List.range ${wrap(kCode)}).mapM (fun i => ${ns}.init_${ident(f.name)} (S := ${spaceCode}) ${[...cargs, ...inputs].join(' ')} i)`);
      fieldInits.push(`${ident(c.name)} := { ${ident(f.name)} := ${v}[i]! }`);
    }
  }
  for (const { c, ns, info } of withWorld) {
    const cargs = (c.params ?? []).map(p => wrap(initTr.lit(c.args![p.name], p.type)));
    initLines.push(`let w_${c.name} ← ${ns}.initWorld (S := ${spaceCode}) ${[...cargs, ...info.inputs.map(x => ident(x.name))].join(' ')}`);
  }
  emit(`def count ${params.map(pBinder).join(' ')} : Nat := ${kCode}\n`, { kind: 'experiment', name: 'agents' });
  emit(`def init ${params.map(pBinder).join(' ')} : ND (Config ${sigOf}) := do
${initLines.map(l => `  ${l}\n`).join('')}  pure {
    agents := Vector.ofFn fun j =>
      let i := j.val
      { pos := ${pos}, frame := ${frameInit}, flags := FlagSet.none, fields := { ${fieldInits.join(', ')} }, pub := ${pub}, mem := ${mem} },
    world := { ${withWorld.map(x => `${ident(x.c.name)} := w_${x.c.name}`).join(', ')} } }
`, { kind: 'experiment', name: 'position' });
  const quant = params.map((p, i) => {
    const before = params.slice(0, i).map(q => ident(q.name));
    const name = ident(p.name);
    const domain = p.domain ? ` ${name} ∈ domain_${ident(p.name)} ${before.join(' ')} →` : '';
    const accepts = p.accepts ? ` accepts_${ident(p.name)} ${[...before, name].join(' ')} = true →` : '';
    return `∀ ${pBinder(p)},${domain}${accepts}`;
  }).join('\n  ');
  const ordQuant = iso ? `\n  ∀ ord : RefOrder ${spaceCode}, RefOrder.Lawful ${spaceCode} ${wrap(radiusCode)} false ord →` : '';
  const m = `(model ${[mArgs, countCall].filter(Boolean).join(' ')}${iso ? ' ord' : ''})`;
  const verdict = `(verdict ${[mArgs, countCall].filter(Boolean).join(' ')})`;
  emit(`/-- Every admissible execution, for every value of the parameters${iso ? ' and every lawful reference ordering' : ''}, satisfies the task. -/
def Statement : Prop :=
  ${quant}${ordQuant}
    ${m}.Correct act0 (init ${args}) ${verdict} goal

/-- Non-vacuity: an initial configuration exists, every reachable configuration has a successor,
and an admissible execution exists. -/
def NonVacuity : Prop :=
  ${quant}${ordQuant}
    ${m}.HasInitial (init ${args}) ∧ ${m}.Total act0 (init ${args}) ∧ ${m}.HasExecution act0 (init ${args})
`, { kind: 'experiment' });

  // Assemble: header, local enums and components, records, body.
  const out: Chunk[] = [];
  const push = (text: string, origin?: LeanOrigin) => out.push({ text, origin });
  push(`import Simulant\n${[...new Set(comps.filter(x => x.library).map(x => `import ${x.ns}`))].join('\n')}\n`);
  push(`/-! Generated from the IR of experiment \`${exp.name}\` by packages/lean-gen. Do not edit:
regenerate it. Proofs go in a separate file. -/\n\nset_option linter.unusedVariables false\n`);
  for (const { c, ns, library } of comps) {
    if (!library) push(generateComponent(c, ns).replace(/^import Simulant\n/, ''), { kind: 'component', name: c.name });
  }
  push(`namespace ${namespace}\nopen Simulant\n`);
  // The program counter's type comes from the algorithm; other enums from `inductive` declarations.
  const pcType = algorithm.mem.k === 'record' ? algorithm.mem.fields.find(f => f.name === 'pc')?.type : undefined;
  for (const [name, ctors] of local) push(enumDecl(name, ctors), pcType?.k === 'enum' && pcType.name === name ? { kind: 'algorithm' } : undefined);
  // Records are declared after the types they mention.
  const recordOrigin: Record<string, LeanOrigin> = { Pub: { kind: 'algorithm' }, Mem: { kind: 'algorithm' } };
  for (const r of records) push(r.decl!, recordOrigin[r.name]);
  out.push(...body);
  push(`end ${namespace}\n`);

  // Lines of each chunk (joined by newlines), and of each case of the step.
  const regions: LeanRegion[] = [];
  let line = 1;
  for (const chunk of out) {
    const lines = chunk.text.split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    if (chunk.origin) {
      regions.push({ line, endLine: line + lines.length - 1, origin: chunk.origin });
      if (chunk.origin.name === 'step' && pcType?.k === 'enum') {
        const cases = lines.flatMap((l, i) => {
          const m = new RegExp(`^\\s*\\| ${ident(pcType.name)}\\.(\\w+) =>`).exec(l);
          return m ? [{ i, pc: m[1] }] : [];
        });
        cases.forEach((c, j) => regions.push({
          line: line + c.i, endLine: line + (j + 1 < cases.length ? cases[j + 1].i - 1 : c.i),
          origin: { kind: 'algorithm', name: 'step', pc: c.pc },
        }));
      }
    }
    line += chunk.text.split('\n').length;
  }
  return { text: out.map(c => c.text).join('\n'), regions };
}

export type { Expr };
