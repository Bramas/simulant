import { SymbolKind, type DocumentSymbol, type Location, type Range } from 'vscode-languageserver-types';
import type { SBinder, SDecl, SExpr, SFile, SStmt, SType, SWhereItem } from '../../lang/src/parse/ast';
import type { Span, Token } from '../../lang/src/parse/lexer';
import { document, range, tokens, typeText, declarationDoc } from './source';

export type Binding = {
  id: string; name: string; uri: string; kind: SymbolKind; signature: string; doc?: string;
  span: Span; selection: Range; start: number; end: number;
  scope?: { start: number; end: number; visible: number };
  type?: SType; params?: string[]; children: Binding[]; readonly?: boolean;
  parentId?: string;
  role?: 'mem' | 'pub' | 'view' | 'config';
};

export type Occurrence = { binding: Binding; uri: string; range: Range; start: number; end: number; declaration: boolean };

export class Symbols {
  readonly bindings: Binding[] = [];
  readonly occurrences: Occurrence[] = [];
  readonly applications: { uri: string; expr: Extract<SExpr, { t: 'app' }> }[] = [];
  readonly regions: Span[] = [];
  private readonly global = new Map<string, Binding[]>();
  private readonly declarations = new Map<string, Binding>();
  private readonly namedArguments = new Map<string, Binding>();
  private readonly fileTokens = new Map<string, Token[]>();

  constructor(readonly sources: Map<string, string>, files: Iterable<SFile>, readonly stdlibUri?: string) {
    for (const [uri, text] of sources) this.fileTokens.set(uri, tokens(text, uri));
    for (const file of files) for (const decl of file.decls) this.declaration(file.file, decl);
    for (const { uri, expr } of this.applications) {
      if (expr.fn.t !== 'name') continue;
      const callee = this.resolve(uri, expr.fn.name, expr.fn.span.start.offset);
      if (!callee) continue;
      for (const arg of expr.args) {
        if (!arg.name) continue;
        const parameter = callee.children.find(b => b.name === arg.name && b.kind === SymbolKind.Variable && b.scope?.start === callee.span.start.offset);
        const token = this.fileTokens.get(uri)?.filter(t => t.text === arg.name && t.start.offset >= expr.fn.span.end.offset && t.end.offset <= arg.value.span.start.offset).at(-1);
        if (parameter && token) this.namedArguments.set(`${uri}:${token.start.offset}:${token.end.offset}`, parameter);
      }
    }
    for (const [uri, ts] of this.fileTokens) for (const token of ts) this.token(uri, token);
  }

  private add(uri: string, name: string, span: Span, kind: SymbolKind, signature: string,
    options: Partial<Pick<Binding, 'scope' | 'type' | 'doc' | 'params' | 'readonly' | 'role'>> = {}, parent?: Binding, global = false): Binding {
    const found = this.fileTokens.get(uri)?.find(t => t.start.offset >= span.start.offset && t.end.offset <= span.end.offset && t.text === name);
    const base = name.split('.').at(-1)!;
    const end = found?.end.offset ?? span.start.offset;
    const start = found ? end - base.length : end;
    const doc = document(uri, this.sources.get(uri) ?? '');
    const binding: Binding = {
      id: `${uri}:${start}:${name}`, name, uri, span, kind, signature, start, end,
      selection: { start: doc.positionAt(start), end: doc.positionAt(end) }, children: [],
      parentId: parent?.id,
      readonly: !!this.stdlibUri && uri.startsWith(this.stdlibUri), ...options,
    };
    this.bindings.push(binding);
    this.regions.push(span);
    parent?.children.push(binding);
    if (found) this.declarations.set(`${uri}:${found.start.offset}:${found.end.offset}`, binding);
    if (global) this.global.set(name, [...this.global.get(name) ?? [], binding]);
    return binding;
  }

  private params(uri: string, params: SBinder[], span: Span, parent: Binding) {
    for (const p of params) {
      this.add(uri, p.name, p.span, SymbolKind.Variable, `${p.name} : ${typeText(p.type)}`,
        { type: p.type, scope: { start: span.start.offset, end: span.end.offset, visible: p.span.end.offset } }, parent);
      if (p.default) this.expression(uri, p.default, parent);
    }
  }

  private fields(uri: string, type: SType, parent: Binding) {
    if (type.t !== 'record') return;
    for (const f of type.fields) {
      this.add(uri, f.name, f.span, SymbolKind.Field, `${f.name} : ${typeText(f.type)}`, { type: f.type, readonly: true }, parent);
      if (f.default) this.expression(uri, f.default, parent);
    }
  }

  private declaration(uri: string, decl: SDecl) {
    if (decl.d === 'import' || decl.d === 'goal') return;
    const signature = this.sources.get(uri)!.slice(decl.span.start.offset, decl.span.end.offset).split(/:=|\bwhere\b/)[0].trim();
    const kind = decl.d === 'inductive' ? SymbolKind.Enum : decl.d === 'structure' ? SymbolKind.Struct
      : decl.d === 'experiment' ? SymbolKind.Object : decl.d === 'algorithm' ? SymbolKind.Class : SymbolKind.Function;
    const b = this.add(uri, decl.name, decl.span, kind, signature, { doc: decl.doc ?? declarationDoc(this.sources.get(uri)!, decl.span.start.offset) }, undefined, true);
    if (decl.d === 'inductive') {
      for (const ctor of decl.ctors) {
        const child = this.add(uri, ctor, decl.span, SymbolKind.EnumMember, `${decl.name}.${ctor} : ${decl.name}`, {}, b);
        this.global.set(`${decl.name}.${ctor}`, [child]);
      }
    } else if (decl.d === 'structure') {
      this.fields(uri, { t: 'record', fields: decl.fields, span: decl.span }, b);
    } else if (decl.d === 'algorithm' || decl.d === 'experiment') {
      this.items(uri, decl.items, b);
    } else {
      b.params = decl.params.map(p => `${p.name} : ${typeText(p.type)}`);
      this.params(uri, decl.params, decl.span, b);
      if (decl.d === 'def' && decl.items) this.items(uri, decl.items, b);
      else if (decl.body) this.expression(uri, decl.body, b);
    }
  }

  private items(uri: string, items: SWhereItem[], parent: Binding) {
    const scope = { start: parent.span.start.offset, end: parent.span.end.offset, visible: parent.span.start.offset };
    for (const item of items) {
      if (item.proc) {
        const params = item.proc.params.map(p => `${p.name} : ${typeText(p.type)}`);
        const b = this.add(uri, item.name, item.span, SymbolKind.Function, `${item.name} ${params.map(p => `(${p})`).join(' ')}`,
          { scope, params, readonly: item.name === 'main' || parent.readonly }, parent);
        this.params(uri, item.proc.params, item.span, b);
        this.statements(uri, item.proc.body, item.span, b);
      } else if (item.param) {
        const b = this.add(uri, item.name, item.span, SymbolKind.Variable, `${item.name} : ${typeText(item.param.type)}`, { type: item.param.type, scope, readonly: true }, parent);
        this.expression(uri, item.value, b);
        if (item.param.accepts) this.expression(uri, item.param.accepts, b);
      } else {
        if (item.value.t === 'typeValue') {
          const b = this.add(uri, item.name, item.span, SymbolKind.Struct, `${item.name} := ${typeText(item.value.type)}`, { scope, type: item.value.type, readonly: true }, parent);
          this.fields(uri, item.value.type, b);
          if (item.name === 'Pub' || item.name === 'Mem') {
            this.add(uri, item.name.toLowerCase(), item.span, SymbolKind.Variable, `${item.name.toLowerCase()} : ${typeText(item.value.type)}`,
              { scope, type: item.value.type, readonly: true }, parent);
          }
        }
        // Hook/step arguments are implicit runtime binders in the surface syntax.
        for (const [i, arg] of item.args.entries()) {
          const role = item.name === 'step' ? (['mem', 'pub', 'view'] as const)[i]
            : ['beforeLook', 'beforeMove', 'afterMove'].includes(item.name) ? 'config' as const : undefined;
          const type = role === 'pub' || role === 'mem' ? parent.children.find(b => b.name.toLowerCase() === role)?.type : undefined;
          this.add(uri, arg, item.span, SymbolKind.Variable, `${arg} : ${type ? typeText(type) : role === 'view' ? 'View' : role === 'config' ? 'Config' : 'runtime argument'}`,
            { role, type, scope: { start: item.span.start.offset, end: item.span.end.offset, visible: item.span.start.offset } }, parent);
        }
        this.expression(uri, item.value, parent);
      }
    }
  }

  private statements(uri: string, stmts: SStmt[], scope: Span, parent: Binding) {
    for (const stmt of stmts) {
      this.regions.push(stmt.span);
      switch (stmt.s) {
        case 'let':
          this.expression(uri, stmt.value, parent);
          this.add(uri, stmt.name, stmt.span, SymbolKind.Variable, stmt.type ? `${stmt.name} : ${typeText(stmt.type)}` : `let ${stmt.name}`,
            { type: stmt.type, scope: { start: scope.start.offset, end: scope.end.offset, visible: stmt.value.span.end.offset } }, parent);
          break;
        case 'if':
          this.expression(uri, stmt.cond, parent);
          this.statements(uri, stmt.then, this.block(stmt.then, stmt.span), parent);
          if (stmt.else) this.statements(uri, stmt.else, this.block(stmt.else, stmt.span), parent);
          break;
        case 'while': this.expression(uri, stmt.cond, parent); this.statements(uri, stmt.body, this.block(stmt.body, stmt.span), parent); break;
        case 'repeat': this.statements(uri, stmt.body, this.block(stmt.body, stmt.span), parent); break;
        case 'move': this.expression(uri, stmt.dir, parent); for (const a of stmt.actions ?? []) if (a.value) this.expression(uri, a.value, parent); break;
        case 'wait': this.expression(uri, stmt.count, parent); break;
        case 'assign': this.expression(uri, stmt.value, parent); break;
        case 'call': for (const arg of stmt.args) this.expression(uri, arg, parent); break;
        case 'stay': case 'halt': for (const a of stmt.actions ?? []) if (a.value) this.expression(uri, a.value, parent); break;
      }
    }
  }

  private block(stmts: SStmt[], fallback: Span): Span {
    return stmts.length ? { file: fallback.file, start: stmts[0].span.start, end: stmts.at(-1)!.span.end } : fallback;
  }

  private expression(uri: string, expr: SExpr, parent: Binding) {
    this.regions.push(expr.span);
    if (expr.t === 'app') this.applications.push({ uri, expr });
    if (expr.t === 'let') {
      this.expression(uri, expr.value, parent);
      this.add(uri, expr.name, expr.span, SymbolKind.Variable, expr.type ? `${expr.name} : ${typeText(expr.type)}` : `let ${expr.name}`,
        { type: expr.type, scope: { start: expr.body.span.start.offset, end: expr.body.span.end.offset, visible: expr.body.span.start.offset } }, parent);
      this.expression(uri, expr.body, parent);
      return;
    }
    if (expr.t === 'fun') {
      for (const p of expr.params) this.add(uri, p.name, expr.span, SymbolKind.Variable, p.type ? `${p.name} : ${typeText(p.type)}` : `${p.name} (lambda parameter)`,
        { type: p.type, scope: { start: expr.body.span.start.offset, end: expr.body.span.end.offset, visible: expr.body.span.start.offset } }, parent);
    }
    if (expr.t === 'match') {
      this.expression(uri, expr.on, parent);
      for (const c of expr.cases) {
        if (c.pat.t === 'some') this.add(uri, c.pat.name, c.pat.span, SymbolKind.Variable, `${c.pat.name} (option value)`,
          { scope: { start: c.body.span.start.offset, end: c.body.span.end.offset, visible: c.body.span.start.offset } }, parent);
        this.expression(uri, c.body, parent);
      }
      return;
    }
    // AST nodes carry discriminants, so this walk never descends into source spans or types.
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const item of value) walk(item); return; }
      const node = value as Record<string, unknown>;
      if (node !== expr && typeof node.t === 'string' && 'span' in node && !['name', 'record'].includes(String(node.t))) {
        this.expression(uri, node as SExpr, parent); return;
      }
      if (node !== expr && (node.t === 'name' || node.t === 'record') && 'span' in node) {
        // Both expressions and types have these tags. Expression records have `items`; names have no `args`.
        if ('items' in node || !('args' in node || 'fields' in node)) { this.expression(uri, node as SExpr, parent); return; }
      }
      for (const [key, child] of Object.entries(node)) if (key !== 'span' && key !== 'type' && key !== 'pat') walk(child);
    };
    for (const [key, value] of Object.entries(expr)) if (key !== 'span' && key !== 'type') walk(value);
  }

  visible(uri: string, offset: number): Binding[] {
    const locals = this.bindings.filter(b => b.uri === uri && b.scope && offset >= b.scope.start && offset <= b.scope.end && offset >= b.scope.visible);
    locals.sort((a, b) => (a.scope!.end - a.scope!.start) - (b.scope!.end - b.scope!.start) || b.scope!.visible - a.scope!.visible);
    const named = new Map<string, Binding>();
    for (const b of [...locals, ...this.bindings.filter(b => !b.scope && this.global.get(b.name)?.length === 1)]) if (!named.has(b.name)) named.set(b.name, b);
    return [...named.values()];
  }

  resolve(uri: string, name: string, offset: number): Binding | undefined {
    const exact = this.global.get(name);
    if (exact?.length === 1 && name.includes('.')) return exact[0];
    return this.visible(uri, offset).find(b => b.name === name);
  }

  private token(uri: string, token: Token) {
    if (!['ident', 'dotIdent', 'field'].includes(token.kind)) return;
    const declaration = this.declarations.get(`${uri}:${token.start.offset}:${token.end.offset}`);
    if (declaration) { this.record(uri, declaration, declaration.start, declaration.end, true); return; }
    const argument = this.namedArguments.get(`${uri}:${token.start.offset}:${token.end.offset}`);
    if (argument) { this.record(uri, argument, token.start.offset, token.end.offset); return; }
    const exact = this.resolve(uri, token.text, token.start.offset);
    if (exact) {
      this.record(uri, exact, token.end.offset - exact.name.split('.').at(-1)!.length, token.end.offset);
      if (exact.kind === SymbolKind.EnumMember && token.text.includes('.')) {
        const owner = token.text.slice(0, token.text.lastIndexOf('.'));
        const enumBinding = this.resolve(uri, owner, token.start.offset);
        if (enumBinding) {
          const end = token.start.offset + owner.length;
          this.record(uri, enumBinding, end - owner.split('.').at(-1)!.length, end);
        }
      }
      return;
    }
    if (token.kind === 'dotIdent') {
      const choices = this.bindings.filter(b => b.kind === SymbolKind.EnumMember && b.name === token.text);
      if (choices.length === 1) this.record(uri, choices[0], token.start.offset + 1, token.end.offset);
      return;
    }
    const parts = token.text.split('.');
    if (parts.length > 1) {
      const first = this.resolve(uri, parts[0], token.start.offset);
      if (first) {
        this.record(uri, first, token.start.offset, token.start.offset + parts[0].length);
        const field = first.role === 'view' ? this.global.get(parts[1])?.find(b => b.kind === SymbolKind.Function)
          : this.members(first).find(b => b.name === parts[1]);
        if (field) this.record(uri, field, token.start.offset + parts[0].length + 1, token.start.offset + parts[0].length + 1 + parts[1].length);
      }
    }
  }

  members(binding: Binding): Binding[] {
    if (binding.children.length) return binding.children.filter(b => b.kind === SymbolKind.Field || b.kind === SymbolKind.EnumMember);
    if (binding.type?.t === 'name') return this.global.get(binding.type.name)?.[0]?.children.filter(b => b.kind === SymbolKind.Field) ?? [];
    if (binding.type?.t === 'record') {
      const owner = this.bindings.find(b => b.kind === SymbolKind.Struct && b.uri === binding.uri && b.type === binding.type);
      return owner?.children ?? [];
    }
    return [];
  }

  private record(uri: string, binding: Binding, start: number, end: number, declaration = false) {
    const doc = document(uri, this.sources.get(uri)!);
    this.occurrences.push({ binding, uri, start, end, declaration, range: { start: doc.positionAt(start), end: doc.positionAt(end) } });
  }

  at(uri: string, offset: number): Occurrence | undefined {
    return this.occurrences.find(o => o.uri === uri && offset >= o.start && offset < o.end)
      ?? this.occurrences.find(o => o.uri === uri && offset === o.end);
  }

  location(binding: Binding): Location { return { uri: binding.uri, range: binding.selection }; }

  outline(uri: string): DocumentSymbol[] {
    const toSymbol = (b: Binding): DocumentSymbol => ({ name: b.name, detail: b.signature, kind: b.kind,
      range: range(b.span), selectionRange: b.selection, children: b.children.filter(c => !c.readonly || c.start !== c.end).map(toSymbol) });
    return this.bindings.filter(b => b.uri === uri && this.global.get(b.name)?.includes(b) && !b.scope && b.kind !== SymbolKind.EnumMember).map(toSymbol);
  }
}
