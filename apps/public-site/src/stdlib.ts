/**
 * The standard library as the site presents it, read from the `.sim` sources
 * themselves: declarations, doc comments, signatures, and what each one needs
 * (experiment parameters, components owning the fields it reads, algorithm outputs).
 */
import type { SBinder, SDecl, SExpr, SStmt, SType, SWhereItem } from '../../../packages/lang/src/parse/ast';
import { parse } from '../../../packages/lang/src/parse/parser';

export type Kind = 'model' | 'space' | 'component' | 'scheduler' | 'sensor' | 'task' | 'type' | 'algorithm' | 'experiment' | 'definition';

export type Param = { name: string; type: string; default?: string };
export type Field = { name: string; type: string };

export type Entry = {
  kind: Kind;
  name: string;
  /** The module, as imported: `std/models.sim`. */
  module: string;
  doc?: string;
  attrs: string[];
  params: Param[];
  /** Result type, for sensors, tasks and definitions. */
  type?: string;
  /** The declaration as written. */
  source: string;
  ctors?: string[];
  world?: Field[];
  agent?: Field[];
  flags?: string[];
  actions?: string[];
  hooks?: string[];
  /** Experiment parameters read by `param x`, with the type of the field they initialize. */
  reads?: Field[];
  /** Components owning the world or agent fields this declaration reads. */
  requires?: string[];
  /** Components and sensors a model always includes. */
  includes?: string[];
  /** Agent attributes a task reads: `pub.bh`, or an algorithm output such as `claim`. */
  outputs?: string[];
  implements?: string;
  goal?: string;
  /** A scheduler's cut of the cycle and its fairness, as written. */
  events?: string;
  fairness?: string;
};

export type Library = { modules: { path: string; doc?: string }[]; entries: Entry[] };

/** Fields every agent has, as opposed to algorithm outputs and component fields. */
const agentAttributes = new Set(['pos', 'pub']);

export function typeText(type: SType): string {
  return type.t === 'record'
    ? `{ ${type.fields.map((f) => `${f.name} : ${typeText(f.type)}`).join(', ')} }`
    : [type.name, ...type.args.map((a) => (a.t === 'name' && a.args.length ? `(${typeText(a)})` : typeText(a)))].join(' ');
}

/** The `/-- … -/` comment before a declaration and its attributes (the parser keeps no comments). */
function docBefore(source: string, offset: number): string | undefined {
  let prefix = source.slice(0, offset).trimEnd();
  while (/@\[[^\]]*\]$/.test(prefix)) prefix = prefix.replace(/\s*@\[[^\]]*\]$/, '').trimEnd();
  if (!prefix.endsWith('-/')) return undefined;
  const start = prefix.lastIndexOf('/-');
  return start >= 0 && prefix.startsWith('/--', start) ? prefix.slice(start + 3, -2).trim() : undefined;
}

/** Attribute lines (`@[equivariant …]`) written before a declaration, which its span excludes. */
const attributesBefore = (source: string, offset: number) =>
  /(?:@\[[^\]]*\][ \t]*\n[ \t]*)*$/.exec(source.slice(0, offset))?.[0].replace(/[ \t]+$/, '') ?? '';

const slice = (source: string, span: { start: { offset: number }; end: { offset: number } }) =>
  source.slice(span.start.offset, span.end.offset);

function kindOf(d: SDecl): Kind | undefined {
  switch (d.d) {
    case 'sensor': case 'task': case 'algorithm': case 'experiment': return d.d;
    case 'inductive': case 'structure': return 'type';
    case 'def': {
      const t = d.type?.t === 'name' ? d.type.name : undefined;
      return t === 'Component' ? 'component' : t === 'Scheduler' ? 'scheduler' : t === 'Model' ? 'model' : t === 'Space' ? 'space'
        : t === 'Sensor' ? 'sensor' : 'definition';
    }
    default: return undefined;
  }
}

/** Every expression below `e`, `e` included. */
function* subexpressions(e: SExpr | undefined): Generator<SExpr> {
  if (!e) return;
  yield e;
  for (const value of Object.values(e)) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (!item || typeof item !== 'object' || 'file' in item) continue;
      if ('t' in item && 'span' in item && typeof item.t === 'string') yield* subexpressions(item as SExpr);
      else for (const nested of Object.values(item)) {
        if (nested && typeof nested === 'object' && 't' in nested && 'span' in nested) yield* subexpressions(nested as SExpr);
      }
    }
  }
}

function* statementExpressions(body: SStmt[]): Generator<SExpr> {
  for (const s of body) {
    for (const value of Object.values(s)) {
      if (Array.isArray(value)) {
        if (value.length && typeof value[0] === 'object' && 's' in value[0]) yield* statementExpressions(value as SStmt[]);
      } else if (value && typeof value === 'object' && 't' in value && 'span' in value) yield* subexpressions(value as SExpr);
    }
  }
}

function expressionsOf(d: SDecl): SExpr[] {
  const items: SWhereItem[] = 'items' in d && d.items ? d.items : [];
  const fromItems = items.flatMap((item) => [...subexpressions(item.value), ...(item.proc ? statementExpressions(item.proc.body) : [])]);
  const body = 'body' in d && d.body ? [...subexpressions(d.body)] : [];
  return [...fromItems, ...body];
}

/** Dotted access paths read by an expression: `C.world.site`, `a.pub.bh`, `a.slot`. */
function paths(exprs: SExpr[]): string[][] {
  const found: string[][] = [];
  for (const e of exprs) {
    if (e.t === 'name' && e.name.includes('.')) found.push(e.name.split('.'));
    if (e.t === 'proj') {
      const chain = [e.field];
      let on: SExpr = e.on;
      while (on.t === 'proj') { chain.unshift(on.field); on = on.on; }
      if (on.t === 'name') found.push([...on.name.split('.'), ...chain]);
    }
  }
  return found;
}

const recordFields = (value: SExpr | undefined): Field[] =>
  value?.t === 'typeValue' && value.type.t === 'record'
    ? value.type.fields.map((f) => ({ name: f.name, type: typeText(f.type) }))
    : [];

const params = (source: string, binders: SBinder[]): Param[] =>
  binders.map((b) => ({ name: b.name, type: typeText(b.type), ...(b.default ? { default: slice(source, b.default.span) } : {}) }));

export function readLibrary(sources: Record<string, string>): Library {
  const modules: Library['modules'] = [];
  const entries: Entry[] = [];
  const decls: { d: SDecl; entry: Entry }[] = [];

  for (const [path, source] of Object.entries(sources)) {
    const file = parse(source, path);
    const moduleDoc = /^\s*\/-!([\s\S]*?)-\//.exec(source)?.[1].trim();
    modules.push({ path, doc: moduleDoc });
    for (const d of file.decls) {
      const kind = kindOf(d);
      if (!kind || !('name' in d)) continue;
      const attrs = d.attrs.flatMap((a) => (a.args.length ? a.args.map((arg) => `${a.name} ${arg}`) : [a.name]));
      const entry: Entry = {
        kind, name: d.name, module: path, doc: d.doc ?? docBefore(source, d.span.start.offset), attrs,
        params: 'params' in d ? params(source, d.params) : [],
        source: attributesBefore(source, d.span.start.offset) + slice(source, d.span).trimEnd(),
      };
      if (d.d === 'def' && d.type && kind === 'definition') entry.type = typeText(d.type);
      if (d.d === 'sensor' || d.d === 'task') entry.type = typeText(d.type);
      if (d.d === 'inductive') entry.ctors = d.ctors;
      if (d.d === 'structure') entry.world = d.fields.map((f) => ({ name: f.name, type: typeText(f.type) }));
      const implemented = d.attrs.find((a) => a.name === 'implements');
      if (implemented) entry.implements = implemented.args[0];
      if (d.d === 'def' && kind === 'scheduler') {
        const item = (name: string) => d.items?.find((i) => i.name === name && !i.args.length);
        entry.world = recordFields(item('World')?.value);
        entry.agent = recordFields(item('Agent')?.value);
        const text = (name: string) => { const i = item(name); return i && slice(source, i.value.span); };
        // Events given by an argument (`events := events`) show the argument and its default.
        const events = text('events');
        const arg = entry.params.find((p) => p.name === events);
        entry.events = !events ? '[[.look, .compute, .move]]' : arg ? `the argument ${arg.name}${arg.default ? ` (default ${arg.default})` : ''}` : events;
        entry.fairness = text('fairness') ?? '.activation';
      }
      if (d.d === 'def' && kind === 'component') {
        const item = (name: string) => d.items?.find((i) => i.name === name && !i.args.length);
        entry.world = recordFields(item('World')?.value);
        entry.agent = recordFields(item('Agent')?.value);
        const list = (name: string) => item(name)?.value.t === 'list' ? (item(name)!.value as Extract<SExpr, { t: 'list' }>).items : [];
        entry.flags = list('flags').flatMap((f) => (f.t === 'flag' ? [`${f.name} (${f.visibility}, acts ${f.acts})`] : []));
        entry.actions = list('actions').flatMap((a) => (a.t === 'action' ? [`${a.name} : ${typeText(a.type)}`] : []));
        entry.hooks = (d.items ?? []).filter((i) => ['beforeLook', 'onCompute', 'beforeMove', 'afterMove'].includes(i.name)).map((i) => i.name);
        const reads: Field[] = [];
        for (const init of (d.items ?? []).filter((i) => i.name === 'init' && i.value.t === 'record')) {
          const record = init.value as Extract<SExpr, { t: 'record' }>;
          for (const field of record.items) {
            if (field.t !== 'field' || field.value?.t !== 'param') continue;
            const type = [...entry.world, ...entry.agent].find((f) => f.name === field.name)?.type ?? 'Nat';
            reads.push({ name: field.value.name, type });
          }
        }
        entry.reads = reads;
      }
      entries.push(entry);
      decls.push({ d, entry });
    }
    for (const d of file.decls) {
      if (d.d !== 'goal') continue;
      const task = entries.find((e) => e.kind === 'task' && e.name === d.name);
      if (!task) continue;
      task.goal = d.goal;
      task.source += `\n\n${slice(source, d.span).trimEnd()}`;
    }
  }

  // Requirements need every component's fields, so they come after reading all modules.
  const components = entries.filter((e) => e.kind === 'component');
  const owners = (field: string, side: 'world' | 'agent') =>
    components.filter((c) => c[side]?.some((f) => f.name === field)).map((c) => c.name);
  const flags = new Set(components.flatMap((c) => c.flags?.map((f) => f.split(' ')[0]) ?? []));
  for (const { d, entry } of decls) {
    if (!['sensor', 'task'].includes(entry.kind)) continue;
    const requires = new Set<string>();
    const outputs = new Set<string>();
    const exprs = expressionsOf(d);
    // Agents are bound by `fun a => ...` over `C.agents` or `L.occupants l`, or are the observer `L.me`.
    const agents = new Set(['me', ...exprs.flatMap((e) => (e.t === 'fun' ? e.params.map((p) => p.name) : []))]);
    for (const raw of paths(exprs)) {
      const path = raw[0] === 'L' && raw[1] === 'me' ? raw.slice(1) : raw;
      if ((path[0] === 'C' || path[0] === 'L') && path[1] === 'world' && path[2]) owners(path[2], 'world').forEach((c) => requires.add(c));
      else if (agents.has(path[0]) && path.length >= 2) {
        const [, attribute, field] = path;
        const agentOwners = owners(attribute, 'agent');
        if (agentOwners.length) agentOwners.forEach((c) => requires.add(c));
        else if (entry.kind !== 'task' || flags.has(attribute)) continue;
        else if (attribute === 'pub' && field) outputs.add(`pub.${field}`);
        else if (!agentAttributes.has(attribute)) outputs.add(attribute);
      }
    }
    requires.delete(entry.name);
    entry.requires = [...requires];
    if (entry.kind === 'task') entry.outputs = [...outputs];
  }
  for (const { d, entry } of decls) {
    if (entry.kind !== 'model') continue;
    const named = new Set(expressionsOf(d).flatMap((e) => (e.t === 'name' ? [e.name] : e.t === 'app' && e.fn.t === 'name' ? [e.fn.name] : [])));
    entry.includes = entries.filter((e) => (e.kind === 'component' || e.kind === 'sensor') && named.has(e.name)).map((e) => e.name);
  }
  return { modules, entries };
}

const binder = (p: Param) => `(${p.name} : ${p.type}${p.default !== undefined ? ` := ${p.default}` : ''})`;

/** A one-line header, as the declaration would start. */
export function signature(e: Entry): string {
  const params = e.params.map(binder).join(' ');
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  switch (e.kind) {
    case 'type': return e.ctors ? join('inductive', e.name, ...e.ctors.map((c) => `| ${c}`)) : join('structure', e.name);
    case 'component': return join('def', e.name, params, ': Component');
    case 'scheduler': return join('def', e.name, params, ': Scheduler');
    case 'model': return join('def', e.name, params, ': Model');
    case 'space': return join('def', e.name, params, ': Space');
    case 'sensor': return join('sensor', e.name, params, `: ${e.type ?? 'Sensor'}`);
    case 'task': return join('task', e.name, params, `: ${e.type}`);
    case 'definition': return join('def', e.name, params, e.type ? `: ${e.type}` : '');
    default: return join(e.kind, e.name);
  }
}

export const goalText: Record<string, string> = {
  eventually: 'eventually .success',
  eventuallyAlways: 'eventually always .success',
  safety: 'always ¬ .failure',
};
