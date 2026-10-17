/**
 * Parser of `.sim` files (syntax: docs/sim-language.md).
 *
 * Layout follows Lean: a construct ends at a token that starts a line at or
 * to the left of the construct's column (the "guard"). Declarations start
 * at the left margin; items of a `where` block share a column.
 */
import type { SArg, SAttribute, SBinder, SDecl, SExpr, SFieldType, SFile, SPat, SRecordItem, SStmt, SType, SWhereItem } from './ast';
import { lex, type Pos, type Span, type Token } from './lexer';

export class ParseError extends Error {
  constructor(message: string, readonly span: Span) {
    super(message);
  }
}

const INFIX: Record<string, { prec: number; right?: boolean }> = {
  '∨': { prec: 30, right: true },
  '∧': { prec: 35, right: true },
  '=': { prec: 50 }, '≠': { prec: 50 }, '<': { prec: 50 }, '>': { prec: 50 }, '≤': { prec: 50 }, '≥': { prec: 50 },
  '++': { prec: 65 }, '+': { prec: 65 }, '-': { prec: 65 },
  '*': { prec: 70 }, '/': { prec: 70 }, '%': { prec: 70 },
};

const DECL_KEYWORDS = new Set(['import', 'def', 'structure', 'inductive', 'sensor', 'task', 'goal', 'algorithm', 'experiment']);

export class Parser {
  private i = 0;
  private guard = 0;
  /** The first token of a block item, which sits at the block's column. */
  private exempt = -1;
  private readonly tokens: Token[];

  constructor(source: string, readonly file: string) {
    this.tokens = lex(source, file);
  }

  // -------------------------------------------------------------------------
  // Tokens

  private peek(k = 0): Token {
    return this.tokens[Math.min(this.i + k, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.i++;
    return t;
  }

  /** The current construct ends here (layout or end of file). */
  private atEnd(): boolean {
    if (this.i === this.exempt) return false;
    const t = this.peek();
    return t.kind === 'eof' || (t.lineStart && t.start.col <= this.guard);
  }

  private is(text: string, k = 0): boolean {
    const t = this.peek(k);
    return (t.kind === 'op' || t.kind === 'keyword') && t.text === text && !(k === 0 && this.atEnd());
  }

  private span(start: Pos, end: Pos = this.tokens[Math.max(0, this.i - 1)].end): Span {
    return { file: this.file, start, end };
  }

  private fail(msg: string, t: Token = this.peek()): never {
    throw new ParseError(msg, { file: this.file, start: t.start, end: t.end });
  }

  private expect(text: string): Token {
    if (!this.is(text)) this.fail(`expected '${text}'${this.peek().kind === 'eof' ? ' before the end of the file' : `, found '${this.peek().text}'`}`);
    return this.next();
  }

  private ident(): string {
    const t = this.peek();
    if (t.kind !== 'ident' || this.atEnd()) this.fail(`expected a name, found '${t.text || 'end of file'}'`);
    return this.next().text;
  }

  /** Parses with a layout guard at `col`. */
  private guarded<X>(col: number, f: () => X): X {
    const saved = this.guard;
    this.guard = col;
    try {
      return f();
    } finally {
      this.guard = saved;
    }
  }

  // -------------------------------------------------------------------------
  // Files and declarations

  parseFile(): SFile {
    const decls: SDecl[] = [];
    while (this.peek().kind !== 'eof') decls.push(this.decl());
    return { file: this.file, decls };
  }

  private attributes(): SAttribute[] {
    const attrs: SAttribute[] = [];
    while (this.is('@')) {
      this.next();
      this.expect('[');
      do {
        const name = this.ident();
        const args: string[] = [];
        while (this.peek().kind === 'ident') args.push(this.next().text);
        attrs.push({ name, args });
      } while (this.is(',') && this.next());
      this.expect(']');
    }
    return attrs;
  }

  private decl(): SDecl {
    const attrs = this.attributes();
    const t = this.peek();
    if (!t.lineStart || t.start.col !== 1) this.fail('a declaration starts at the beginning of a line');
    if (t.kind !== 'keyword' || !DECL_KEYWORDS.has(t.text)) this.fail(`expected a declaration, found '${t.text}'`);
    const start = t.start;
    this.next();
    // The declaration's body is guarded by the left margin.
    return this.guarded(1, () => {
      const base = { attrs };
      switch (t.text) {
        case 'import': {
          const p = this.peek();
          const path = p.kind === 'string' || p.kind === 'ident' ? this.next().text : this.fail('expected a module path');
          return { ...base, d: 'import', path, span: this.span(start) };
        }
        case 'inductive': {
          const name = this.ident();
          if (this.is('where')) this.next();
          const ctors: string[] = [];
          while (this.is('|')) {
            this.next();
            ctors.push(this.ident());
          }
          if (!ctors.length) this.fail('an inductive type needs constructors: | a | b');
          return { ...base, d: 'inductive', name, ctors, span: this.span(start) };
        }
        case 'structure': {
          const name = this.ident();
          this.expect('where');
          const fields: SFieldType[] = [];
          this.block(() => {
            const fs = this.peek().start;
            const fname = this.ident();
            this.expect(':');
            const type = this.type();
            const def = this.is(':=') ? (this.next(), this.expr()) : undefined;
            fields.push({ name: fname, type, default: def, span: this.span(fs) });
          });
          return { ...base, d: 'structure', name, fields, span: this.span(start) };
        }
        case 'def': {
          const name = this.ident();
          const params = this.binders();
          const type = this.is(':') ? (this.next(), this.type()) : undefined;
          if (this.is('where')) {
            this.next();
            return { ...base, d: 'def', name, params, type, items: this.whereItems(), span: this.span(start) };
          }
          this.expect(':=');
          return { ...base, d: 'def', name, params, type, body: this.expr(), span: this.span(start) };
        }
        case 'sensor': case 'task': {
          const name = this.ident();
          const params = this.binders();
          this.expect(':');
          const type = this.type();
          this.expect(':=');
          return { ...base, d: t.text as 'sensor' | 'task', name, params, type, body: this.expr(), span: this.span(start) };
        }
        case 'goal': {
          const name = this.ident();
          this.expect(':=');
          let goal: 'eventually' | 'eventuallyAlways' | 'safety';
          const word = () => this.peek().kind === 'ident' ? this.peek().text : '';
          if (word() === 'eventually') {
            this.next();
            if (word() === 'always') { this.next(); goal = 'eventuallyAlways'; } else goal = 'eventually';
            const v = this.next();
            if (v.text !== 'success') this.fail('expected `.success`', v);
          } else if (word() === 'always') {
            this.next();
            this.expect('¬');
            const v = this.next();
            if (v.text !== 'failure') this.fail('expected `¬ .failure`', v);
            goal = 'safety';
          } else {
            return this.fail('expected `eventually .success`, `eventually always .success` or `always ¬ .failure`');
          }
          return { ...base, d: 'goal', name, goal, span: this.span(start) };
        }
        case 'algorithm': {
          const name = this.ident();
          const uses: string[] = [];
          if (this.is('uses')) {
            this.next();
            do uses.push(this.ident()); while (this.is(',') && this.next());
          }
          this.expect('where');
          return { ...base, d: 'algorithm', name, uses, items: this.whereItems(true), span: this.span(start) };
        }
        case 'experiment': {
          const name = this.ident();
          this.expect('where');
          return { ...base, d: 'experiment', name, items: this.whereItems(), span: this.span(start) };
        }
      }
      return this.fail('unreachable');
    });
  }

  /** Items on their own lines, indented at a common column. */
  private block(item: () => void) {
    const first = this.peek();
    if (this.atEnd() || !first.lineStart) {
      // A block may also start on the same line (one item).
      if (!this.atEnd()) item();
      return;
    }
    const col = first.start.col;
    while (!this.atEnd() && this.peek().lineStart && this.peek().start.col === col) {
      this.exempt = this.i;
      this.guarded(col, item);
    }
    if (!this.atEnd()) this.fail('unexpected indentation');
  }

  private whereItems(algorithm = false): SWhereItem[] {
    const items: SWhereItem[] = [];
    this.block(() => {
      const start = this.peek().start;
      if (algorithm && (this.is('def') || (this.peek().text === 'main' && this.peek(1).text === ':='))) {
        // `def p (x : T) := statements` or `main := statements`
        const isMain = !this.is('def');
        this.next();
        const name = isMain ? 'main' : this.ident();
        const params = isMain ? [] : this.binders();
        if (this.is(':')) { this.next(); this.type(); }
        this.expect(':=');
        const body = this.statements();
        items.push({ name, args: [], value: { t: 'nothing', span: this.span(start) }, span: this.span(start), proc: { params, body } });
        return;
      }
      // `output claim := expression`: what tasks may read of an agent.
      const output = algorithm && this.peek().text === 'output' && this.peek(1).kind === 'ident';
      if (output) this.next();
      if (this.is('param')) {
        // `param N : Nat in domain where predicate` (both clauses optional).
        // Keep `:=` as an alias for the original finite-domain syntax.
        this.next();
        const name = this.ident();
        this.expect(':');
        const type = this.type();
        const value: SExpr = this.is('in') || this.is(':=') ? (this.next(), this.expr()) : { t: 'nothing', span: this.span(start) };
        const accepts = this.is('where') ? (this.next(), this.expr()) : undefined;
        items.push({ name, args: [], value, span: this.span(start), param: { type, ...(accepts ? { accepts } : {}) } });
        return;
      }
      // Item names may be keywords: `algorithm := ...`, `task := ...`.
      const name = (output ? 'output.' : '') + (this.peek().kind === 'keyword' ? this.next().text : this.ident());
      const args: string[] = [];
      while (this.peek().kind === 'ident' && !this.atEnd()) args.push(this.next().text);
      if (this.atEnd() && !args.length) {
        // `topology` alone stands for `topology := topology`.
        items.push({ name, args, value: { t: 'name', name, span: this.span(start) }, span: this.span(start) });
        return;
      }
      this.expect(':=');
      // Capitalised items hold types: `World := { site : Node }`.
      const value: SExpr = /^[A-Z]/.test(name) && args.length === 0
        ? (() => { const s = this.peek().start; const type = this.type(); return { t: 'typeValue', type, span: this.span(s) } as SExpr; })()
        : this.expr();
      items.push({ name, args, value, span: this.span(start) });
    });
    return items;
  }

  private binders(): SBinder[] {
    const out: SBinder[] = [];
    while (this.is('(')) {
      const start = this.peek().start;
      this.next();
      const names: string[] = [];
      while (this.peek().kind === 'ident') names.push(this.next().text);
      if (!names.length) this.fail('expected parameter names');
      this.expect(':');
      const type = this.type();
      const def = this.is(':=') ? (this.next(), this.expr()) : undefined;
      this.expect(')');
      for (const name of names) out.push({ name, type, default: def, span: this.span(start) });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Statements (structured algorithms)

  /** A block: statements on the following lines, at a common column, or one statement on this line. */
  statements(): SStmt[] {
    if (this.peek().kind === 'ident' && this.peek().text === 'do' && !this.atEnd()) this.next();
    const out: SStmt[] = [];
    const first = this.peek();
    if (this.atEnd()) this.fail('expected statements');
    if (!first.lineStart) {
      out.push(this.statement());
      return out;
    }
    const col = first.start.col;
    while (!this.atEnd() && this.peek().lineStart && this.peek().start.col === col) {
      this.exempt = this.i;
      out.push(this.guarded(col, () => this.statement()));
    }
    if (!this.atEnd()) this.fail('unexpected indentation');
    return out;
  }

  /** `with { action := value, ... }` after `move`, `stay` or `halt`: the actions of that activation. */
  private actions(): SRecordItem[] | undefined {
    if (this.atEnd() || this.word() !== 'with') return undefined;
    this.next();
    const r = this.expr();
    if (r.t !== 'record' || r.base || r.items.some(i => i.t !== 'field' || !i.value)) this.fail('expected { action := value, ... } after with');
    return (r as { items: SRecordItem[] }).items;
  }

  /** The column of the `if` that starts the `else if` chain being parsed. */
  private elseColumn: number | undefined;

  private word(): string {
    const t = this.peek();
    return !this.atEnd() && (t.kind === 'ident' || t.kind === 'keyword') ? t.text : '';
  }

  private statement(): SStmt {
    const start = this.peek().start;
    const w = this.word();
    const done = <S extends object>(s: S) => ({ ...s, span: this.span(start) }) as unknown as SStmt;
    switch (w) {
      case 'move': { this.next(); const dir = this.expr(); return done({ s: 'move', dir, actions: this.actions() }); }
      case 'stay': this.next(); return done({ s: 'stay', actions: this.actions() });
      case 'halt': this.next(); return done({ s: 'halt', actions: this.actions() });
      case 'wait': { this.next(); return done({ s: 'wait', count: this.expr() }); }
      case 'repeat': this.next(); return done({ s: 'repeat', body: this.statements() });
      case 'while': {
        this.next();
        // The condition ends with its line (or at `do`): the body follows on the next lines.
        const cond = this.guarded(Number.MAX_SAFE_INTEGER, () => this.expr());
        if (this.word() === 'do') this.next();
        return done({ s: 'while', cond, body: this.statements() });
      }
      case 'if': {
        // In `else if` chains, every `else` sits at the column of the chain's first `if`.
        const column = this.elseColumn ?? start.col;
        this.elseColumn = undefined;
        this.next();
        const cond = this.expr();
        this.expect('then');
        const then = this.statements();
        let otherwise: SStmt[] | undefined;
        // `else` may sit at the column of its `if`.
        const t = this.peek();
        if (t.kind === 'keyword' && t.text === 'else' && (!t.lineStart || t.start.col >= column)) {
          this.next();
          if (this.word() === 'if' && !this.peek().lineStart) {
            this.elseColumn = column;
            otherwise = [this.statement()];
          } else {
            otherwise = this.statements();
          }
        }
        return done({ s: 'if', cond, then, ...(otherwise ? { else: otherwise } : {}) });
      }
      case 'let': {
        this.next();
        const name = this.ident();
        const type = this.is(':') ? (this.next(), this.type()) : undefined;
        this.expect(':=');
        return done({ s: 'let', name, type, value: this.expr() });
      }
    }
    if (this.peek().kind === 'ident' && this.peek(1).text === ':=') {
      const name = this.next().text;
      this.next();
      return done({ s: 'assign', name, value: this.expr() });
    }
    if (this.peek().kind === 'ident') {
      // A procedure call: `cautiousWalk 0 1 .cw`
      const name = this.next().text;
      const args: SExpr[] = [];
      while (this.canStartArgument()) args.push(this.postfix());
      return done({ s: 'call', name, args });
    }
    return this.fail('expected a statement: move, stay, halt, wait, repeat, while, if, let, an assignment or a procedure call');
  }

  // -------------------------------------------------------------------------
  // Types

  type(): SType {
    const start = this.peek().start;
    const head = this.typeAtom();
    if (head.t !== 'name') return head;
    const args: SType[] = [];
    while (!this.atEnd() && (this.peek().kind === 'ident' || this.is('(') || this.is('{'))) args.push(this.typeAtom());
    return args.length ? { ...head, args, span: this.span(start) } : head;
  }

  private typeAtom(): SType {
    const start = this.peek().start;
    if (this.is('(')) {
      this.next();
      const t = this.type();
      this.expect(')');
      return t;
    }
    if (this.is('{')) {
      this.next();
      const fields: SFieldType[] = [];
      while (!this.is('}')) {
        const fs = this.peek().start;
        const name = this.ident();
        this.expect(':');
        const type = this.type();
        const def = this.is(':=') ? (this.next(), this.expr()) : undefined;
        fields.push({ name, type, default: def, span: this.span(fs) });
        if (!this.is('}')) this.expect(',');
      }
      this.expect('}');
      return { t: 'record', fields, span: this.span(start) };
    }
    return { t: 'name', name: this.ident(), args: [], span: this.span(start) };
  }

  // -------------------------------------------------------------------------
  // Expressions

  expr(minPrec = 0): SExpr {
    const start = this.peek().start;
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      if (this.atEnd() || t.kind !== 'op') break;
      const info = INFIX[t.text];
      if (!info || info.prec < minPrec) break;
      this.next();
      const right = this.expr(info.right ? info.prec : info.prec + 1);
      left = { t: 'binop', op: t.text, l: left, r: right, span: this.span(start) };
    }
    return left;
  }

  private prefix(): SExpr {
    const start = this.peek().start;
    if (this.atEnd()) this.fail(this.peek().kind === 'eof' ? 'unexpected end of the file' : 'expected an expression (check the indentation)');
    if (this.is('fun')) {
      this.next();
      const params: { name: string; type?: SType }[] = [];
      while (!this.is('=>')) {
        if (this.is('(')) {
          this.next();
          const names: string[] = [];
          while (this.peek().kind === 'ident') names.push(this.next().text);
          this.expect(':');
          const type = this.type();
          this.expect(')');
          for (const name of names) params.push({ name, type });
        } else {
          params.push({ name: this.ident() });
        }
      }
      this.next();
      return { t: 'fun', params, body: this.expr(), span: this.span(start) };
    }
    if (this.is('let')) {
      const col = this.peek().start.col;
      this.next();
      const name = this.ident();
      const type = this.is(':') ? (this.next(), this.type()) : undefined;
      this.expect(':=');
      const value = this.guarded(col, () => this.expr());
      if (this.is(';')) this.next();
      return { t: 'let', name, type, value, body: this.expr(), span: this.span(start) };
    }
    if (this.is('if')) {
      this.next();
      const cond = this.expr();
      this.expect('then');
      const then = this.expr();
      this.expect('else');
      return { t: 'if', cond, then, else: this.expr(), span: this.span(start) };
    }
    if (this.is('match')) {
      this.next();
      const on = this.expr();
      this.expect('with');
      const cases: { pat: SPat; body: SExpr }[] = [];
      while (this.is('|')) {
        const col = this.peek().start.col;
        this.next();
        const pat = this.pattern();
        this.expect('=>');
        // The body continues on lines indented more than its `|`.
        cases.push({ pat, body: this.guarded(col, () => this.expr()) });
      }
      if (!cases.length) this.fail('expected `| pattern => value`');
      return { t: 'match', on, cases, span: this.span(start) };
    }
    if (this.is('choose')) {
      this.next();
      const from = this.application();
      let such: SExpr | undefined, labels: SExpr | undefined;
      for (;;) {
        if (this.is('such')) { this.next(); this.expect('that'); such = this.expr(); continue; }
        if (this.is('labels')) { this.next(); labels = this.is('fun') ? this.prefix() : this.application(); continue; }
        break;
      }
      return { t: 'choose', from, such, labels, span: this.span(start) };
    }
    if (this.is('¬')) {
      this.next();
      return { t: 'unop', op: '¬', e: this.expr(40), span: this.span(start) };
    }
    if (this.is('-')) {
      this.next();
      return { t: 'unop', op: '-', e: this.expr(75), span: this.span(start) };
    }
    return this.application();
  }

  private canStartArgument(): boolean {
    if (this.atEnd()) return false;
    const t = this.peek();
    if (t.kind === 'ident' && t.text === 'do') return false;
    if (t.kind === 'ident' || t.kind === 'dotIdent' || t.kind === 'number' || t.kind === 'string') return true;
    if (t.kind === 'keyword') return ['true', 'false', 'param', 'nothing', 'fun'].includes(t.text);
    return t.kind === 'op' && ['(', '[', '{', '!', '·'].includes(t.text);
  }

  private application(): SExpr {
    const start = this.peek().start;
    const fn = this.postfix();
    const args: SArg[] = [];
    while (this.canStartArgument()) {
      // A trailing `fun` is the last argument: `xs.filter fun b => ...`
      if (this.is('fun')) {
        args.push({ value: this.prefix() });
        break;
      }
      // Named argument: `(faults := [...])`
      if (this.is('(') && this.peek(1).kind === 'ident' && this.peek(2).text === ':=') {
        this.next();
        const name = this.next().text;
        this.next();
        const value = this.expr();
        this.expect(')');
        args.push({ name, value });
      } else {
        args.push({ value: this.postfix() });
      }
    }
    return args.length ? { t: 'app', fn, args, span: this.span(start) } : fn;
  }

  private postfix(): SExpr {
    const start = this.peek().start;
    let e = this.atom();
    while (this.peek().kind === 'field' && !this.peek().spaced && !this.atEnd()) {
      e = { t: 'proj', on: e, field: this.next().text, span: this.span(start) };
    }
    return e;
  }

  private atom(): SExpr {
    const t = this.peek();
    const start = t.start;
    if (t.kind === 'number') { this.next(); return { t: 'num', value: Number(t.text), span: this.span(start) }; }
    if (t.kind === 'string') { this.next(); return { t: 'str', value: t.text, span: this.span(start) }; }
    if (t.kind === 'ident') { this.next(); return { t: 'name', name: t.text, span: this.span(start) }; }
    if (t.kind === 'dotIdent') { this.next(); return { t: 'ctor', name: t.text, span: this.span(start) }; }
    if (t.kind === 'keyword') {
      if (t.text === 'true' || t.text === 'false') { this.next(); return { t: 'bool', value: t.text === 'true', span: this.span(start) }; }
      if (t.text === 'param') { this.next(); return { t: 'param', name: this.ident(), span: this.span(start) }; }
      if (t.text === 'nothing') { this.next(); return { t: 'nothing', span: this.span(start) }; }
      if (t.text === 'flag') return this.flagDecl();
      if (t.text === 'action') return this.actionDecl();
    }
    if (t.kind === 'op') {
      // As in Lean (`!b` is `notation:max "!" b:40`): `!v.at i` is `!(v.at i)`, `!a ∧ b` is `(!a) ∧ b`.
      if (t.text === '!') { this.next(); return { t: 'unop', op: '!', e: this.expr(40), span: this.span(start) }; }
      if (t.text === '·') { this.next(); return { t: 'hole', span: this.span(start) }; }
      if (t.text === '(') return this.paren();
      if (t.text === '[') {
        this.next();
        const items: SExpr[] = [];
        this.guarded(0, () => {
          while (!this.is(']')) {
            items.push(this.expr());
            if (!this.is(']')) this.expect(',');
          }
        });
        this.expect(']');
        return { t: 'list', items, span: this.span(start) };
      }
      if (t.text === '{') return this.record();
    }
    return this.fail(`unexpected '${t.text || 'end of file'}'`);
  }

  /** `( e )`, `( e : T )`, or a section `( · ≥ 3 )`. */
  private paren(): SExpr {
    const start = this.peek().start;
    this.next();
    if (this.is(')')) {
      this.next();
      return { t: 'unit', span: this.span(start) };
    }
    const inner = this.guarded(0, () => this.expr());
    let e: SExpr = inner;
    if (this.is(':')) {
      this.next();
      const type = this.guarded(0, () => this.type());
      e = { t: 'ascribe', e: inner, type, span: this.span(start) };
    }
    this.expect(')');
    return hasHole(e) ? { t: 'fun', params: [{ name: '·' }], body: fillHole(e), span: this.span(start) } : e;
  }

  private record(): SExpr {
    const start = this.peek().start;
    this.next();
    return this.guarded(0, () => {
      let base: SExpr | undefined;
      // `{ e with ... }`: look for `with` before the first `:=` or `,`.
      let j = this.i, depth = 0;
      for (; j < this.tokens.length; j++) {
        const x = this.tokens[j];
        if (['(', '[', '{'].includes(x.text) && x.kind === 'op') depth++;
        else if ([')', ']', '}'].includes(x.text) && x.kind === 'op') { if (depth === 0) break; depth--; }
        else if (depth === 0 && (x.text === ':=' || x.text === ',')) break;
        else if (depth === 0 && x.text === 'with' && x.kind === 'keyword') {
          base = this.expr();
          this.expect('with');
          break;
        }
      }
      const items: SRecordItem[] = [];
      while (!this.is('}')) {
        const is = this.peek().start;
        if (this.is('raise')) {
          this.next();
          const flag = this.ident();
          this.expect(':=');
          items.push({ t: 'raise', flag, value: this.expr(), span: this.span(is) });
        } else {
          const name = this.ident();
          const value = this.is(':=') ? (this.next(), this.expr()) : undefined;
          items.push({ t: 'field', name, value, span: this.span(is) });
        }
        if (!this.is('}')) this.expect(',');
      }
      this.expect('}');
      return { t: 'record', base, items, span: this.span(start) } as SExpr;
    });
  }

  /** `flag dead hidden, acts never` */
  private flagDecl(): SExpr {
    const start = this.peek().start;
    this.next();
    const name = this.ident();
    const vis = this.ident();
    if (vis !== 'visible' && vis !== 'hidden') this.fail('expected `visible` or `hidden`');
    let acts: 'never' | 'adversary' = 'never';
    if (this.is(',') && this.peek(1).text === 'acts') {
      this.next();
      this.next();
      const a = this.ident();
      if (a !== 'never' && a !== 'adversary') this.fail('expected `never` or `adversary`');
      acts = a;
    }
    return { t: 'flag', name, visibility: vis, acts, span: this.span(start) };
  }

  /** `action pebble : PebbleAction := .none` */
  private actionDecl(): SExpr {
    const start = this.peek().start;
    this.next();
    const name = this.ident();
    this.expect(':');
    const type = this.type();
    this.expect(':=');
    return { t: 'action', name, type, default: this.postfix(), span: this.span(start) };
  }

  private pattern(): SPat {
    const t = this.peek();
    const span = { file: this.file, start: t.start, end: t.end };
    if (t.kind === 'dotIdent') { this.next(); return { t: 'ctor', name: t.text, span }; }
    if (t.kind === 'keyword' && (t.text === 'true' || t.text === 'false')) { this.next(); return { t: 'bool', value: t.text === 'true', span }; }
    if (t.kind === 'ident') {
      this.next();
      if (t.text === '_') return { t: 'wild', span };
      if (t.text === 'none') return { t: 'none', span };
      if (t.text === 'some') return { t: 'some', name: this.ident(), span };
      return { t: 'ctor', name: t.text, span };
    }
    return this.fail('expected a pattern');
  }
}

function hasHole(e: SExpr): boolean {
  return e.t === 'hole' || children(e).some(hasHole);
}

function children(e: SExpr): SExpr[] {
  switch (e.t) {
    case 'proj': return [e.on];
    case 'app': return [e.fn, ...e.args.map(a => a.value)];
    case 'binop': return [e.l, e.r];
    case 'unop': return [e.e];
    case 'ascribe': return [e.e];
    default: return [];
  }
}

/** Replaces the hole of a section by the parameter `·`. */
function fillHole(e: SExpr): SExpr {
  switch (e.t) {
    case 'hole': return { t: 'name', name: '·', span: e.span };
    case 'proj': return { ...e, on: fillHole(e.on) };
    case 'app': return { ...e, fn: fillHole(e.fn), args: e.args.map(a => ({ ...a, value: fillHole(a.value) })) };
    case 'binop': return { ...e, l: fillHole(e.l), r: fillHole(e.r) };
    case 'unop': return { ...e, e: fillHole(e.e) };
    case 'ascribe': return { ...e, e: fillHole(e.e) };
    default: return e;
  }
}

export function parse(source: string, file = '<input>'): SFile {
  return new Parser(source, file).parseFile();
}
