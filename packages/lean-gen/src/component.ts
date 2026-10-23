/**
 * Generates a component as a Lean module that is generic over the
 * composition (docs/ir.md): the component sees its own world fields and
 * agent fields through lenses (`Ctx`), its own flags through a class, and
 * its own actions through a class. A model provides the instances. A lemma
 * about the component then applies to every model that contains it, whatever
 * its space: positions are the composition's `σ.S.Pos`.
 */
import type { Component, Expr, Field, Sensor, Type } from '@bramas/simulant-lang/ir';
import { T, showType, typeEq } from '@bramas/simulant-lang/types';
import { fail, ident, Translator, wrap, type Env } from './translate';

export type ComponentInfo = {
  name: string;
  namespace: string;
  /** Experiment parameters read by the initial values, with their types. */
  inputs: Field[];
  hasWorld: boolean;
  hasFields: boolean;
  enums: { name: string; ctors: string[] }[];
};

/** Enum types mentioned by a type. */
export function enumsOf(t: Type, out: Map<string, string[]> = new Map()): Map<string, string[]> {
  switch (t.k) {
    case 'enum': out.set(t.name, t.ctors); break;
    case 'option': case 'list': case 'multiset': enumsOf(t.of, out); break;
    case 'record': for (const f of t.fields) enumsOf(f.type, out); break;
  }
  return out;
}

export function enumsInExpr(e: Expr | undefined, out: Map<string, string[]>) {
  if (!e) return;
  const visit = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(visit); return; }
    const o = x as Record<string, unknown>;
    if (o.e === 'lit' || o.k) enumsOf((o.e === 'lit' ? o.type : o) as Type, out);
    for (const v of Object.values(o)) visit(v);
  };
  visit(e);
}

export function enumDecl(name: string, ctors: string[]): string {
  return `inductive ${ident(name)} where\n${ctors.map(c => `  | ${ident(c)}`).join('\n')}\nderiving DecidableEq, Repr, Inhabited\n`;
}

export function structDecl(name: string, params: string, fields: Field[], type: (t: Type) => string): string {
  if (!fields.length) return `structure ${name}${params} where\nderiving DecidableEq, Repr\n`;
  return `structure ${name}${params} where\n${fields.map(f => `  ${ident(f.name)} : ${type(f.type)}`).join('\n')}\nderiving DecidableEq, Repr\n`;
}

/** The experiment parameters read directly by initial values (`site := param site`). */
function inputsOf(c: Component): Field[] {
  const inputs = new Map<string, Type>();
  const fields = [...(c.world ?? []), ...(c.agent ?? [])];
  const visit = (x: unknown, expected?: Type): void => {
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (o.e === 'param') {
      const type = expected ?? inputs.get(o.name as string);
      if (!type) fail(`${c.name}: the type of parameter ${o.name} is not known (use it directly as an initial value)`);
      inputs.set(o.name as string, type);
      return;
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  for (const f of fields) {
    const init = c.init?.world?.[f.name] ?? c.init?.agent?.[f.name];
    if (init?.e === 'param') inputs.set(init.name, f.type);
  }
  // A transformed initializer may reuse an input whose type is fixed by another field.
  for (const f of fields) visit(c.init?.world?.[f.name] ?? c.init?.agent?.[f.name]);
  return [...inputs].map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
}

export function componentInfo(c: Component, namespace: string): ComponentInfo {
  const enums = new Map<string, string[]>();
  for (const f of [...(c.params ?? []), ...(c.world ?? []), ...(c.agent ?? []), ...(c.actions ?? [])]) enumsOf(f.type, enums);
  for (const e of [c.beforeLook, c.onCompute, c.beforeMove, c.afterMove, ...Object.values(c.init?.world ?? {}), ...Object.values(c.init?.agent ?? {}),
    ...(c.sensors ?? []).map(s => s.body)]) enumsInExpr(e, enums);
  return {
    name: c.name, namespace, inputs: inputsOf(c),
    hasWorld: !!c.world?.length, hasFields: !!c.agent?.length,
    enums: [...enums].map(([name, ctors]) => ({ name, ctors })),
  };
}

/** The Lean module of a component. */
export function generateComponent(c: Component, namespace: string): string {
  // The Lean round has no Compute instant yet (docs/scheduler-design.md, step 4): with atomic cycles,
  // a component's onCompute runs in the same step as its beforeMove, which it may stand for.
  if (c.onCompute && c.beforeMove) fail(`${c.name}: a component with both onCompute and beforeMove is not translated to Lean yet`);
  const info = componentInfo(c, namespace);
  const world = c.world ?? [];
  const fields = c.agent ?? [];
  const flags = c.flags ?? [];
  const actions = c.actions ?? [];
  const params = c.params ?? [];
  const worldT = T.record(world);
  const fieldsT = T.record(fields);
  const enumNames = new Set(info.enums.map(e => e.name));
  /** The parts of the world and of the agents' fields the component owns. */
  const ownW = world.length ? '(World σ.S.Pos)' : 'Unit';
  const ownX = fields.length ? '(Fields σ.S.Pos)' : 'Unit';

  const env = (space: string, pos: string, sig: string, k: string): Env => ({
    space, pos, sig, agent: `Fin ${k}`, k, pub: 'σ.P',
    // The composition's space maps vertex numbers to its positions.
    posOf: (v, t) => `(${space}.${t.k === 'int' ? 'ofInt' : 'ofNat'} ${wrap(v)})`,
    typeName: t => {
      if (t.k === 'enum' && enumNames.has(t.name)) return ident(t.name);
      if (t.k === 'record' && typeEq(t, worldT)) return `World ${pos}`;
      if (t.k === 'record' && typeEq(t, fieldsT)) return `Fields ${pos}`;
      return fail(`${c.name}: no Lean name for ${showType(t)}`);
    },
    worldField: (C, f) => `(L.world.get ${C}.world).${ident(f)}`,
    agentFlag: (a, f) => `(Flags.${ident(f)} ${a}.flags)`,
    agentField: (a, f) => `(L.fields.get ${a}.fields).${ident(f)}`,
    decisionAction: (d, a) => `(Actions.${ident(a)} ${d}.act)`,
    param: name => ident(name),
    paramType: name => info.inputs.find(i => i.name === name)?.type ?? fail(`unknown parameter ${name}`),
    effect: (w, raise, agents) => {
      const worldCode = w.length ? `fun x => { x with ${w.map(([f, v]) => `${ident(f)} := ${v}`).join(', ')} }` : 'id';
      const one = ([flag, r]: [string, { pred?: string; set?: string }]) => {
        const cond = r.pred ? `${r.pred} a` : `(${r.set}).contains a`;
        return `(if ${cond} then (Flags.raise_${ident(flag)} : σ.F) else FlagSet.none)`;
      };
      const raiseCode = raise.length
        ? raise.map(one).reduce((acc, x) => `FlagSet.merge ${acc} ${x}`)
        : 'FlagSet.none';
      const fieldsCode = agents ? `, fields := fun a _ => ${agents} a` : '';
      return `({ world := ${worldCode}, raise := fun a => ${raiseCode}${fieldsCode} } : OwnEffect σ ${ownW} ${ownX})`;
    },
    ds: 'ds',
    layout: { pub: T.pub, mem: T.unit, worldType: worldT, flags, agentFields: fields, actions },
    defs: new Map((c.defs ?? []).map(d => [d.name, d])),
    defName: n => ident(n),
  });

  const hookEnv = env('σ.S', 'σ.S.Pos', 'σ', 'σ.k');
  const initEnv = env('S', 'S.Pos', 'σ', 'σ.k');
  const tr = new Translator(hookEnv);
  const trInit = new Translator(initEnv);
  const paramVars = params.map(p => [p.name, ident(p.name), p.type] as [string, string, Type]);
  const paramBinders = params.map(p => `(${ident(p.name)} : ${tr.type(p.type)})`).join(' ');
  const inputBinders = info.inputs.map(p => `(${ident(p.name)} : ${trInit.type(p.type)})`).join(' ');
  const out: string[] = [];

  out.push(`import Simulant\n\n/-! Generated from the IR of component \`${c.name}\` by packages/lean-gen. Do not edit. -/\n\nset_option linter.unusedVariables false\n`);
  out.push(`namespace ${namespace}\nopen Simulant\n`);
  for (const e of info.enums) out.push(enumDecl(e.name, e.ctors));
  if (world.length) out.push(structDecl('World', ' (P : Type)', world, t => trInit.type(t).replace(/\bS\.Pos\b/g, 'P')));
  if (fields.length) out.push(structDecl('Fields', ' (P : Type)', fields, t => trInit.type(t).replace(/\bS\.Pos\b/g, 'P')));
  out.push(`/-- The flags declared by \`${c.name}\`, with the laws of a composition's flags. -/`);
  if (flags.length) {
    out.push(`class Flags (F : Type) [FlagSet F] where\n${flags.map(f => {
      const n = ident(f.name);
      return `  ${n} : F → Bool\n  raise_${n} : F\n  ${n}_raise : ${n} raise_${n} = true\n  ${n}_merge : ∀ a b : F, ${n} (FlagSet.merge a b) = (${n} a || ${n} b)\n  ${n}_none : ${n} (FlagSet.none : F) = false`;
    }).join('\n')}\n`);
  } else {
    out.push('class Flags (F : Type) [FlagSet F] where\n');
  }
  out.push(actions.length
    ? `class Actions (A : Type) where\n${actions.map(a => `  ${ident(a.name)} : A → ${trInit.type(a.type)}`).join('\n')}\n`
    : 'class Actions (A : Type) where\n');
  out.push(`/-- What the composition gives the component: lenses on the state it owns. -/\nstructure Ctx (σ : Sig) where\n${
    [world.length ? '  world : Lens σ.W (World σ.S.Pos)' : '', fields.length ? '  fields : Lens σ.X (Fields σ.S.Pos)' : ''].filter(Boolean).join('\n')}\n`);

  // Initial values
  if (world.length) {
    const binds = world.map(f => {
      const r = trInit.root(c.init!.world![f.name], paramVars);
      return [f.name, r] as const;
    });
    out.push(`def initWorld {S : Space} ${paramBinders} ${inputBinders} : ND (World S.Pos) := do\n${
      binds.map(([n, r]) => `  let ${ident(n)} ← ${trInit.nd(r)}`).join('\n')}\n  pure { ${world.map(f => `${ident(f.name)} := ${ident(f.name)}`).join(', ')} }\n`);
  }
  for (const f of fields) {
    const r = trInit.root(c.init!.agent![f.name], [['i', 'i', T.nat], ...paramVars]);
    out.push(`def init_${ident(f.name)} {S : Space} ${paramBinders} ${inputBinders} (i : Nat) : ND (${trInit.type(f.type)}) :=\n  ${trInit.nd(r)}\n`);
  }

  out.push(`section\nvariable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]\n`);
  for (const s of c.sensors ?? []) out.push(sensorDef(tr, s, `(L : Ctx σ) ${paramBinders}`, paramVars, 'σ'));
  const hook = (body: Expr | undefined, args: string) => {
    if (!body) return `fun ${args} => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩`;
    return `fun ${args} => ${tr.nd(tr.root(body, [['C', 'C', T.config], ...paramVars], 'C'))}`;
  };
  out.push(`/-- The hooks, on the parts of the state the component owns. -/
def hooks ${paramBinders} (L : Ctx σ) : Hooks σ ${ownW} ${ownX} where
  beforeLook := ${hook(c.beforeLook, 'ts C')}
  beforeMove := ${hook(c.onCompute ?? c.beforeMove, 'ts C ds')}
  afterMove := ${hook(c.afterMove, 'ts C')}

def component ${paramBinders} (L : Ctx σ) : Component σ :=
  (hooks ${params.map(p => ident(p.name)).join(' ')} L).toComponent ${world.length ? 'L.world' : '(Lens.unit σ.W)'} ${fields.length ? 'L.fields' : '(Lens.unit σ.X)'}
`);
  out.push(`end\n\nend ${namespace}\n`);
  return out.join('\n');
}

/**
 * A sensor, as a function of a Look: its Look-level bindings (with their choices), then its
 * value, a function of the location for a per-location sensor.
 */
export function sensorDef(tr: Translator, s: Sensor, binders: string, vars: [string, string, Type][], sig: string): string {
  const scope: [string, string, Type][] = [['L', 'Lk', T.look], ...vars];
  const binds: string[] = [];
  for (const b of s.look ?? []) {
    const r = tr.root(b.value, scope, 'Lk.config');
    binds.push(`let ${ident(b.name)} ← ${tr.nd(r)}`);
    scope.push([b.name, ident(b.name), r.t]);
  }
  const t = tr.resolve(s.type);
  let value: string;
  if (s.perLocation) {
    const r = tr.root(s.body, [...scope, ['l', 'l', T.loc]], 'Lk.config');
    if (r.nd) fail(`sensor ${s.name}: the per-location part cannot contain choices`);
    value = `pure (fun (l : Nat) => ${r.code})`;
  } else {
    value = tr.nd(tr.root(s.body, scope, 'Lk.config'));
  }
  const ret = s.perLocation ? `Nat → ${tr.type(t)}` : tr.type(t);
  return `def sensor_${ident(s.name)} ${binders} (Lk : Look ${sig}) : ND (${ret}) := do\n${binds.map(b => `  ${b}\n`).join('')}  ${value}\n`;
}
