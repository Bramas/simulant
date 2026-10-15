/**
 * Generates the Lean model file of an experiment (plan, Section 5.1): the
 * composed types, the instances that give each component its part of the
 * state, the model, the algorithm, the task, the initial configurations,
 * the parameter domains, and the statements to prove.
 */
// Relative imports: the Vite plugin bundles this generator into the configuration that loads it.
import { check } from '../../lang/src/check';
import type { Component, Experiment, Field, Type } from '../../lang/src/ir';
import { showType, T, typeEq } from '../../lang/src/types';
import { componentInfo, enumDecl, enumsInExpr, enumsOf, generateComponent, structDecl } from './component';
import { libraryComponents, libraryNamespace } from './library';
import { fail, ident, Translator, wrap, type Env } from './translate';

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

export function generateMappedModel(exp: Experiment, namespace: string): GeneratedModel {
  const checked = check(exp);
  if (checked.errors.length) fail(`the experiment does not typecheck:\n${checked.errors.join('\n')}`);
  const lay = checked.layout;
  const { model, algorithm, task } = exp;
  if (model.topology.size.e !== 'param') fail('the topology size must be a parameter');
  const sizeParam = model.topology.size.name;
  const params = exp.params;
  if (params[0]?.name !== sizeParam) fail(`the ring size ${sizeParam} must be the first parameter`);

  // Components: library ones are referenced, others are generated in this file.
  const comps = model.components.map(c => {
    const library = isLibrary(c);
    const ns = library ? libraryNamespace(c.name) : `${namespace}.Components.${c.name}`;
    return { c, ns, library, info: componentInfo(c, ns) };
  });
  const ownerNs = new Map(comps.map(x => [x.c.name, x.ns]));

  // Enums: those of components are qualified by their namespace.
  const enumNames = new Map<string, string>();
  for (const { info, ns } of comps) for (const e of info.enums) enumNames.set(e.name, `${ns}.${ident(e.name)}`);
  const local = new Map<string, string[]>();
  const allDefs = [...(model.defs ?? []), ...(algorithm.defs ?? []), ...(task.defs ?? [])];
  for (const t of [algorithm.pub, algorithm.mem, ...params.map(p => p.type), ...allDefs.flatMap(d => [d.ret, ...d.params.map(p => p.type)])]) enumsOf(t, local);
  for (const e of [algorithm.step, algorithm.init.pub, algorithm.init.mem, algorithm.line, task.verdict,
    ...model.sensors.map(s => s.body), ...params.map(p => p.domain), exp.agents.pos, exp.agents.count,
    ...allDefs.map(d => d.body)]) enumsInExpr(e, local);
  for (const name of [...local.keys()]) {
    if (enumNames.has(name) || name === 'Move') local.delete(name);
    else enumNames.set(name, ident(name));
  }

  // Record types: the algorithm's public state, memory and view, then anonymous ones.
  const records: { t: Type; name: string; decl?: string }[] = [];
  let anonymous = 0;
  type Chunk = { text: string; origin?: LeanOrigin };
  const out: Chunk[] = [];
  const env = (node: string, k: string): Env => ({
    node, agent: `Fin ${k}`, N: 'N', k, pub: 'Pub',
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
    layout: lay,
    defs: new Map([...(model.defs ?? []), ...(algorithm.defs ?? []), ...(task.defs ?? [])].map(d => [d.name, d])),
    defName: n => ident(n),
  });
  const modelTr = new Translator(env('Fin N', 'k'));
  for (const [name, t] of [['Pub', algorithm.pub], ['Mem', algorithm.mem], ['View', lay.view]] as const) {
    if (t.k === 'record') {
      const decl = structDecl(name, '', t.fields, x => modelTr.type(x));
      records.push({ t, name, decl });
    }
  }
  const typeOf = (t: Type) => t.k === 'record' ? records.find(r => typeEq(r.t, t))!.name : modelTr.type(t);
  const pubT = typeOf(algorithm.pub);
  const memT = typeOf(algorithm.mem);

  const body: Chunk[] = [];
  const emit = (text: string, origin: LeanOrigin = { kind: 'composition' }) => body.push({ text, origin });

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
  emit(`structure World (N : Nat) where\n${withWorld.map(x => `  ${ident(x.c.name)} : ${x.ns}.World N`).join('\n')}\nderiving DecidableEq, Repr\n`);
  emit(`structure Fields (N : Nat) where\n${withFields.map(x => `  ${ident(x.c.name)} : ${x.ns}.Fields N`).join('\n')}\nderiving DecidableEq, Repr\n`);
  const viewT = lay.view.k === 'record' && lay.view.fields.length ? 'View' : 'Unit';
  emit(`abbrev sig (N k : Nat) : Sig :=
  { N := N, k := k, F := Flags, X := Fields N, P := ${pubT}, M := ${memT}, A := Actions, W := World N, V := ${viewT} }
`);
  for (const { c, ns, info } of comps) {
    const parts = [
      info.hasWorld ? `  world := ⟨fun w => w.${ident(c.name)}, fun w x => { w with ${ident(c.name)} := x }⟩` : '',
      info.hasFields ? `  fields := ⟨fun x => x.${ident(c.name)}, fun x y => { x with ${ident(c.name)} := y }⟩` : '',
    ].filter(Boolean);
    emit(`def ctx_${c.name} (N k : Nat) : ${ns}.Ctx (sig N k) where\n${parts.join('\n')}\n`);
  }

  // Definitions on values (callees first), then sensors, view, algorithm, model, task
  const defTr = new Translator(env('Fin N', 'k'));
  for (const d of defTr.env.defs.values()) {
    const sig = [...d.params.map(p => p.type), d.ret];
    if (sig.some(mentionsRing)) fail(`definition ${d.name}: definitions on nodes, agents or configurations have no Lean translation yet`);
    const r = defTr.root(d.body, d.params.map(p => [p.name, ident(p.name), p.type]));
    if (r.nd) fail(`definition ${d.name} contains choices: it has no Lean translation yet`);
    const binders = d.params.map(p => `(${ident(p.name)} : ${defTr.type(defTr.resolve(p.type))})`).join(' ');
    emit(`def ${ident(d.name)}${binders ? ' ' + binders : ''} : ${defTr.type(defTr.resolve(d.ret))} :=\n  ${r.code}\n`, { kind: 'definition', name: d.name });
  }
  emit('section\nvariable (N k : Nat)\n', { kind: 'model' });
  const sensorVars = [['C', 'C', T.config], ['me', 'me', T.agent], ['frame', 'frame', T.frame]] as [string, string, Type][];
  const viewBinds: string[] = [];
  for (const name of algorithm.uses) {
    const s = lay.sensors.find(s => s.name === name)!;
    const owner = comps.find(x => x.c.name === s.owner);
    if (owner) {
      const args = (owner.c.params ?? []).map(p => wrap(modelTr.lit(owner.c.args![p.name], p.type)));
      viewBinds.push(`let ${ident(name)} ← ${owner.ns}.sensor_${ident(name)} (ctx_${owner.c.name} N k) ${args.join(' ')} ts C me frame`);
    } else {
      const r = modelTr.root(s.body, sensorVars, 'C');
      emit(`def sensor_${ident(name)} (ts : TState) (C : Config (sig N k)) (me : Fin k) (frame : Bool) : ND (${modelTr.type(r.t)}) :=\n  ${modelTr.nd(r)}\n`, { kind: 'sensor', name });
      viewBinds.push(`let ${ident(name)} ← sensor_${ident(name)} N k ts C me frame`);
    }
  }
  emit(`def view (ts : TState) (C : Config (sig N k)) (me : Fin k) (frame : Bool) : ND ${viewT} := do
${viewBinds.map(b => `  ${b}\n`).join('')}  pure ${viewT === 'View' ? `{ ${algorithm.uses.map(n => `${ident(n)} := ${ident(n)}`).join(', ')} }` : '()'}
`, { kind: 'algorithm' });

  const algTr = new Translator(env('Fin N', 'k'));
  const stepVars = [['mem', 'mem', algorithm.mem], ['pub', 'pub', algorithm.pub], ['view', 'view', lay.view]] as [string, string, Type][];
  const actOf = (get: (name: string) => string | undefined) =>
    `{ ${lay.actions.map(a => `${ident(a.name)} := ${get(a.name) ?? modelTr.lit(a.default, a.type)}`).join(', ')} }`;
  let stepCode: string;
  if (algorithm.native) fail(`algorithm ${algorithm.name} is native: it has no Lean translation`);
  if (algorithm.step.e === 'record') {
    const f = algorithm.step.fields;
    const tr = (n: string) => algTr.root(f[n], stepVars).code;
    stepCode = `{ move := ${tr('move')}, pub := ${tr('pub')}, mem := ${tr('mem')}, act := ${actOf(n => f[n] ? tr(n) : undefined)} }`;
  } else {
    const r = algTr.root(algorithm.step, stepVars);
    const has = (n: string) => r.t.k === 'record' && r.t.fields.some(x => x.name === n);
    stepCode = `let d := ${casesOnLines(r.code, '    ')}\n  { move := d.move, pub := d.pub, mem := d.mem, act := ${actOf(n => has(n) ? `d.${ident(n)}` : undefined)} }`;
  }
  emit(`def step (mem : ${memT}) (pub : ${pubT}) (view : ${viewT}) : Out (sig N k) :=\n  ${stepCode}\n`, { kind: 'algorithm', name: 'step' });

  const topo = model.topology.kind === 'ring' ? 'Ring.staticStates' : `Ring.dynamicStates N ${model.topology.k}`;
  const frame = model.frame.kind === 'common' ? '.common' : model.frame.kind === 'dynamicReflection' ? '.dynamic'
    : `.persistent (fun x => ${(() => {
      const f = model.frame.field;
      return `x.${ident(lay.agentFields.find(a => a.name === f)!.owner)}.${ident(f)}`;
    })()})`;
  const compCode = comps.map(({ c, ns }) => {
    const args = (c.params ?? []).map(p => wrap(modelTr.lit(c.args![p.name], p.type)));
    return `${ns}.component ${args.join(' ')} (ctx_${c.name} N k)`;
  });
  emit(`def model : Model (sig N k) where
  tstates := ${topo}
  components := [${compCode.join(',\n    ')}]
  frame := ${frame}
  round := .${model.round}
  view := view N k
  step := step N k
`, { kind: 'model' });
  const taskTr = new Translator(env('Fin N', 'k'));
  emit(`def verdict (C : Config (sig N k)) : Verdict :=\n  ${taskTr.root(task.verdict, [['C', 'C', T.config]], 'C').code}\n`, { kind: 'task' });
  if (algorithm.line) emit(`def line (mem : ${memT}) : Nat :=\n  ${casesOnLines(algTr.root(algorithm.line, [['mem', 'mem', algorithm.mem]]).code, '    ')}\n`, { kind: 'algorithm', name: 'line' });
  emit('end\n', { kind: 'model' });
  emit(`def goal : Goal := .${task.goal}\n`, { kind: 'goal' });

  // Each component's part of the world is written by that component only.
  for (const { c, ns } of withWorld) {
    emit(`instance (N k : Nat) : LawfulLens (ctx_${c.name} N k).world := ⟨fun _ _ => rfl⟩\n`);
    const cases = comps.map((x, i) => x.c.name === c.name
      ? '  · exact Or.inl rfl'
      : '  · exact Or.inr (Hooks.toComponent_preserves _ _ _ fun _ _ => rfl)');
    emit(`/-- The other components of the model preserve the part of the world that \`${c.name}\` owns. -/
theorem others_preserve_${c.name} (N k : Nat) :
    ∀ c ∈ (model N k).components, c = ${compCode[comps.findIndex(x => x.c.name === c.name)]} ∨ c.Preserves (ctx_${c.name} N k).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with ${comps.map(() => 'rfl').join(' | ')}
${cases.join('\n')}
`);
  }

  // Parameters, initial configurations, statements
  const initTr = new Translator(env('Fin N', 'k'));
  const binder = (p: Field) => p.name === sizeParam ? `(N : Nat) [NeZero N]` : `(${ident(p.name)} : ${initTr.type(p.type)})`;
  const kCode = initTr.root(exp.agents.count, []).code;
  const args = params.map(p => p.name === sizeParam ? 'N' : ident(p.name)).join(' ');
  for (const [i, p] of params.entries()) {
    if (!p.domain) continue;
    const r = initTr.root(p.domain, []);
    const before = params.slice(0, i).map(binder).join(' ');
    emit(`def domain_${ident(p.name)} ${before} : List (${initTr.type(p.type)}) :=\n  ${r.code}\n`, { kind: 'param', name: p.name });
  }
  const i = [['i', 'i', T.nat]] as [string, string, Type][];
  const pos = initTr.root(exp.agents.pos, i).code;
  const pub = initTr.root(algorithm.init.pub, i).code;
  const mem = initTr.root(algorithm.init.mem, i).code;
  const initLines: string[] = [];
  const fieldInits: string[] = [];
  for (const { c, ns, info } of withFields) {
    const cargs = (c.params ?? []).map(p => wrap(initTr.lit(c.args![p.name], p.type)));
    const inputs = info.inputs.map(x => ident(x.name));
    for (const f of c.agent!) {
      const v = `f_${c.name}_${f.name}`;
      initLines.push(`let ${v} ← (List.range ${wrap(kCode)}).mapM (fun i => ${ns}.init_${ident(f.name)} (N := N) ${[...cargs, ...inputs].join(' ')} i)`);
      fieldInits.push(`${ident(c.name)} := { ${ident(f.name)} := ${v}[i]! }`);
    }
  }
  for (const { c, ns, info } of withWorld) {
    const cargs = (c.params ?? []).map(p => wrap(initTr.lit(c.args![p.name], p.type)));
    initLines.push(`let w_${c.name} ← ${ns}.initWorld (N := N) ${[...cargs, ...info.inputs.map(x => ident(x.name))].join(' ')}`);
  }
  emit(`def count ${params.map(binder).join(' ')} : Nat := ${kCode}\n`, { kind: 'experiment', name: 'agents' });
  emit(`def init ${params.map(binder).join(' ')} : ND (Config (sig N (count ${args}))) := do
${initLines.map(l => `  ${l}\n`).join('')}  pure {
    agents := Vector.ofFn fun j =>
      let i := j.val
      { pos := ${pos}, flags := FlagSet.none, fields := { ${fieldInits.join(', ')} }, pub := ${pub}, mem := ${mem} },
    world := { ${withWorld.map(x => `${ident(x.c.name)} := w_${x.c.name}`).join(', ')} } }
`, { kind: 'experiment', name: 'position' });
  const quant = params.map(p => p.domain
    ? `∀ ${binder(p)}, ${ident(p.name === sizeParam ? 'N' : p.name)} ∈ domain_${ident(p.name)} ${params.slice(0, params.indexOf(p)).map(q => q.name === sizeParam ? 'N' : ident(q.name)).join(' ')} →`
    : `∀ ${binder(p)},`).join('\n  ');
  const m = `(model N (count ${args}))`;
  emit(`/-- Every admissible execution, for every value of the parameters, satisfies the task. -/
def Statement : Prop :=
  ${quant}
    ${m}.Correct act0 (init ${args}) (verdict N (count ${args})) goal

/-- Non-vacuity: an initial configuration exists, every reachable configuration has a successor,
and an admissible execution exists. -/
def NonVacuity : Prop :=
  ${quant}
    ${m}.HasInitial (init ${args}) ∧ ${m}.Total act0 (init ${args}) ∧ ${m}.HasExecution act0 (init ${args})
`, { kind: 'experiment' });

  // Assemble: header, local enums and components, records, body.
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
  const recordOrigin: Record<string, LeanOrigin> = { Pub: { kind: 'algorithm' }, Mem: { kind: 'algorithm' }, View: { kind: 'algorithm' } };
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

/** Whether a type needs the ring size or the agents in Lean. */
function mentionsRing(t: Type): boolean {
  switch (t.k) {
    case 'node': case 'agent': case 'config': case 'pub': return true;
    case 'option': case 'list': case 'multiset': return mentionsRing(t.of);
    case 'record': return t.fields.some(f => mentionsRing(f.type));
    default: return false;
  }
}
