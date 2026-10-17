/**
 * Lexer of `.sim` sources. Tokens keep their position and whether they start
 * a line: the parser uses columns for layout, as Lean does.
 */

export type Pos = { line: number; col: number; offset: number };
export type Span = { file: string; start: Pos; end: Pos };

export type TokenKind =
  | 'ident'      // name, possibly qualified: Hazards.BlackHole
  | 'dotIdent'   // .cw, a constructor whose type is inferred
  | 'field'      // .pos right after an expression: a projection
  | 'number'
  | 'string'
  | 'op'         // punctuation and operators
  | 'keyword'
  | 'eof';

export type Token = {
  kind: TokenKind;
  text: string;
  start: Pos;
  end: Pos;
  /** First token of its line. */
  lineStart: boolean;
  /** Preceded by whitespace or a comment. */
  spaced: boolean;
};

export const KEYWORDS = new Set([
  'import', 'def', 'structure', 'inductive', 'sensor', 'task', 'goal', 'algorithm', 'experiment', 'where', 'let',
  'if', 'then', 'else', 'match', 'with', 'fun', 'choose', 'such', 'that', 'labels', 'param', 'flag', 'uses',
  'true', 'false', 'raise', 'nothing', 'action', 'in',
]);

/** Operators, longest first. Unicode and ASCII spellings are both accepted. */
const OPERATORS = [
  ':=', '=>', '->', '<-', '++', '==', '!=', '<=', '>=', '&&', '||',
  '→', '←', '≠', '≤', '≥', '∧', '∨', '¬', '·', '×',
  '=', '<', '>', '+', '-', '*', '/', '%', '!', '|', ',', ':', ';', '(', ')', '[', ']', '{', '}', '@',
];

const NORMALIZE: Record<string, string> = {
  '->': '→', '<-': '←', '!=': '≠', '<=': '≤', '>=': '≥', '&&': '∧', '||': '∨', '==': '=',
};

export class LexError extends Error {
  constructor(message: string, readonly span: Span) {
    super(message);
  }
}

const identStart = /[A-Za-z_À-ɏͰ-Ͽ]/;
const identPart = /[A-Za-z0-9_'À-ɏͰ-Ͽ₀-₉]/;

export function lex(source: string, file = '<input>'): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, col = 1;
  let lineStart = true, spaced = true;
  const pos = (): Pos => ({ line, col, offset: i });
  const advance = (n = 1) => {
    for (let j = 0; j < n; j++) {
      if (source[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  const fail = (msg: string, start: Pos): never => { throw new LexError(msg, { file, start, end: pos() }); };

  while (i < source.length) {
    const c = source[i];
    if (c === '\n') { advance(); lineStart = true; spaced = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { advance(); spaced = true; continue; }
    if (source.startsWith('--', i)) {
      while (i < source.length && source[i] !== '\n') advance();
      spaced = true;
      continue;
    }
    if (source.startsWith('/-', i)) {
      const start = pos();
      let depth = 0;
      do {
        if (source.startsWith('/-', i)) { depth++; advance(2); }
        else if (source.startsWith('-/', i)) { depth--; advance(2); }
        else if (i >= source.length) fail('unterminated comment', start);
        else advance();
      } while (depth > 0);
      spaced = true;
      continue;
    }
    const start = pos();
    const push = (kind: TokenKind, text: string) => {
      tokens.push({ kind, text, start, end: pos(), lineStart, spaced });
      lineStart = false;
      spaced = false;
    };
    const prev = tokens[tokens.length - 1];
    const afterTerm = !!prev && !spaced && (prev.kind === 'ident' || prev.kind === 'field' || prev.kind === 'dotIdent'
      || prev.kind === 'number' || prev.kind === 'string' || [')', ']', '}'].includes(prev.text) || prev.text === '·');
    if (c === '.' && identStart.test(source[i + 1] ?? '')) {
      // `.x` right after a term is a projection; otherwise a constructor.
      advance();
      const s = i;
      while (i < source.length && identPart.test(source[i])) advance();
      push(afterTerm ? 'field' : 'dotIdent', source.slice(s, i));
      continue;
    }
    if (identStart.test(c)) {
      const s = i;
      while (i < source.length && identPart.test(source[i])) advance();
      // A dotted name, as in Lean: `Hazards.BlackHole` or `C.world.site`; name resolution
      // decides which parts are namespaces and which are projections.
      while (source[i] === '.' && identStart.test(source[i + 1] ?? '')) {
        advance();
        while (i < source.length && identPart.test(source[i])) advance();
      }
      const text = source.slice(s, i);
      push(KEYWORDS.has(text) ? 'keyword' : 'ident', text);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const s = i;
      while (i < source.length && /[0-9]/.test(source[i])) advance();
      push('number', source.slice(s, i));
      continue;
    }
    if (c === '"') {
      advance();
      let text = '';
      while (source[i] !== '"') {
        if (i >= source.length || source[i] === '\n') fail('unterminated string', start);
        if (source[i] === '\\') { advance(); text += source[i] === 'n' ? '\n' : source[i]; advance(); continue; }
        text += source[i];
        advance();
      }
      advance();
      push('string', text);
      continue;
    }
    const op = OPERATORS.find(o => source.startsWith(o, i));
    if (!op) fail(`unexpected character '${c}'`, start);
    advance(op!.length);
    push('op', NORMALIZE[op!] ?? op!);
  }
  tokens.push({ kind: 'eof', text: '', start: pos(), end: pos(), lineStart: true, spaced: true });
  return tokens;
}
