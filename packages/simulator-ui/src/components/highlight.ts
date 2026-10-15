/**
 * Highlighting of `.sim` source lines, shared by the algorithm view and the model view (colors
 * in AlgorithmViewer.css). A line-by-line approximation of the lexer, enough for display.
 */

const KEYWORDS = new Set([
  'algorithm', 'uses', 'where', 'def', 'let', 'if', 'then', 'else', 'repeat', 'while', 'do', 'fun', 'init', 'output', 'with', 'match',
  'import', 'structure', 'inductive', 'sensor', 'task', 'goal', 'experiment', 'param', 'choose', 'such', 'that', 'labels', 'flag',
  'action', 'raise', 'nothing', 'eventually', 'always',
]);
/** Statements that end the agent's activation. */
const ACTIONS = new Set(['move', 'stay', 'halt', 'wait']);
const CONSTANTS = new Set(['some', 'none', 'true', 'false']);
/** Builtin functions, and methods (`otherStates.any ...`). */
const FUNCTIONS = new Set([
  'any', 'all', 'count', 'filter', 'map', 'sum', 'length', 'isEmpty', 'isSome', 'isNone', 'getD', 'contains', 'dedup', 'diff',
  'toList', 'toMultiset', 'subsetsUpTo', 'opposite', 'card', 'at', 'show', 'min', 'max', 'range', 'node', 'target', 'advance',
]);

export type Kind = 'keyword' | 'action' | 'function' | 'comment' | 'constant' | 'number' | 'type' | 'string';
export type Token = { text: string; kind?: Kind };
export type Line = { number: number; text: string; tokens: Token[] };

/** Tokens of one line; `inComment` is whether the line starts inside a `/- ... -/` comment. */
function tokenize(line: string, inComment: boolean, procedures: Set<string>): { tokens: Token[]; inComment: boolean } {
  const tokens: Token[] = [];
  let rest = line;
  if (inComment) {
    const end = rest.indexOf('-/');
    if (end < 0) return { tokens: [{ text: rest, kind: 'comment' }], inComment: true };
    tokens.push({ text: rest.slice(0, end + 2), kind: 'comment' });
    rest = rest.slice(end + 2);
  }
  // A constructor is `.name` not after an expression (`pub.id` and `(·.id)` are field accesses).
  const pattern = /(\/-[\s\S]*?(?:-\/|$)|--.*$|"(?:[^"\\]|\\.)*"|(?<![\w)\]}·])\.[a-z]\w*|\b\d+\b|\b[A-Z]\w*\b|\b[a-z]\w*\b)/g;
  let last = 0;
  let open = false;
  for (const m of rest.matchAll(pattern)) {
    if (m.index! > last) tokens.push({ text: rest.slice(last, m.index) });
    const t = m[0];
    const method = rest[m.index! - 1] === '.';
    const kind: Kind | undefined = t.startsWith('/-') || t.startsWith('--') ? 'comment'
      : t.startsWith('"') ? 'string'
      : t.startsWith('.') ? 'constant' : /^\d/.test(t) ? 'number' : /^[A-Z]/.test(t) ? 'type'
      : method ? (FUNCTIONS.has(t) ? 'function' : undefined)
      : ACTIONS.has(t) ? 'action' : KEYWORDS.has(t) ? 'keyword' : CONSTANTS.has(t) ? 'constant'
      : procedures.has(t) || FUNCTIONS.has(t) ? 'function' : undefined;
    if (t.startsWith('/-') && !t.endsWith('-/')) open = true;
    tokens.push({ text: t, kind });
    last = m.index! + t.length;
  }
  if (last < rest.length) tokens.push({ text: rest.slice(last) });
  return { tokens, inComment: open };
}

export function tokenizeAll(lines: { number: number; text: string }[], procedures: Set<string> = new Set()): Line[] {
  let inComment = false;
  return lines.map(line => {
    const t = tokenize(line.text, inComment, procedures);
    inComment = t.inComment;
    return { ...line, tokens: t.tokens };
  });
}

const LEAN_KEYWORDS = new Set([
  'import', 'namespace', 'end', 'open', 'section', 'variable', 'def', 'theorem', 'abbrev', 'structure', 'inductive',
  'instance', 'where', 'deriving', 'match', 'with', 'fun', 'let', 'if', 'then', 'else', 'do', 'by', 'set_option', 'at',
]);
const LEAN_TACTICS = new Set(['intro', 'simp', 'only', 'exact', 'rcases', 'obtain', 'cases', 'decide', 'rfl']);

/** Highlighting of Lean lines (generated models): keywords, comments, strings, numbers, types. */
export function tokenizeLean(lines: { number: number; text: string }[]): Line[] {
  let inComment = false;
  return lines.map(line => {
    const tokens: Token[] = [];
    let rest = line.text;
    if (inComment) {
      const end = rest.indexOf('-/');
      if (end < 0) return { ...line, tokens: [{ text: rest, kind: 'comment' }] };
      tokens.push({ text: rest.slice(0, end + 2), kind: 'comment' });
      rest = rest.slice(end + 2);
      inComment = false;
    }
    const pattern = /(\/-[\s\S]*?(?:-\/|$)|--.*$|"(?:[^"\\]|\\.)*"|\b\d+\b|\b[A-Z][\w.]*\b|\b[a-z_][\w]*\b|[∀∃→←∧∨¬≠≤≥∈⟨⟩])/g;
    let last = 0;
    for (const m of rest.matchAll(pattern)) {
      if (m.index! > last) tokens.push({ text: rest.slice(last, m.index) });
      const t = m[0];
      const kind: Kind | undefined = t.startsWith('/-') || t.startsWith('--') ? 'comment'
        : t.startsWith('"') ? 'string' : /^\d/.test(t) ? 'number' : /^[A-Z]/.test(t) ? 'type'
        : LEAN_KEYWORDS.has(t) ? 'keyword' : LEAN_TACTICS.has(t) ? 'function'
        : /^[∀∃→←∧∨¬≠≤≥∈⟨⟩]$/.test(t) ? 'constant' : undefined;
      if (t.startsWith('/-') && !t.endsWith('-/')) inComment = true;
      tokens.push({ text: t, kind });
      last = m.index! + t.length;
    }
    if (last < rest.length) tokens.push({ text: rest.slice(last) });
    return { ...line, tokens };
  });
}
