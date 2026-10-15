import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Range } from 'vscode-languageserver-types';
import { lex, LexError, type Span, type Token } from '../../lang/src/parse/lexer';
import { parse } from '../../lang/src/parse/parser';
import type { SFile, SType } from '../../lang/src/parse/ast';

export function range(span: Span): Range {
  return { start: { line: span.start.line - 1, character: span.start.col - 1 }, end: { line: span.end.line - 1, character: span.end.col - 1 } };
}

export const document = (uri: string, text: string, version = 0) => TextDocument.create(uri, 'simulant', version, text);

/** Keep tokens preceding an unfinished string/comment usable while the user types. */
export function tokens(text: string, uri: string): Token[] {
  try { return lex(text, uri); } catch (error) {
    if (!(error instanceof LexError)) throw error;
    return lex(text.slice(0, error.span.start.offset), uri);
  }
}

/** Recovery is for navigation only; compiler diagnostics still use the unmodified source. */
export function recover(text: string, uri: string): SFile {
  try { return parse(text, uri); } catch { /* recover complete declarations independently */ }
  const starts = [...text.matchAll(/^(?:@\[[^\n]*\]\s*\n)?(?:import|def|structure|inductive|sensor|task|goal|algorithm|experiment)\b/gm)].map(m => m.index!);
  const decls: SFile['decls'] = [];
  starts.forEach((start, i) => {
    const prefix = text.slice(0, start).replace(/[^\r\n]/g, ' ');
    try { decls.push(...parse(prefix + text.slice(start, starts[i + 1] ?? text.length), uri).decls); } catch { /* unfinished declaration */ }
  });
  return { file: uri, decls };
}

export function typeText(type: SType): string {
  return type.t === 'record' ? `{ ${type.fields.map(f => `${f.name} : ${typeText(f.type)}`).join(', ')} }`
    : [type.name, ...type.args.map(a => a.t === 'name' && a.args.length ? `(${typeText(a)})` : typeText(a))].join(' ');
}

export function declarationDoc(text: string, offset: number): string | undefined {
  let prefix = text.slice(0, offset).trimEnd();
  while (/\s*@\[[^\]]*\]$/.test(prefix)) prefix = prefix.replace(/\s*@\[[^\]]*\]$/, '').trimEnd();
  if (!prefix.endsWith('-/')) return undefined;
  let depth = 0;
  for (let i = prefix.length - 2; i >= 0; i--) {
    if (prefix.slice(i, i + 2) === '-/') depth++;
    else if (prefix.slice(i, i + 2) === '/-' && --depth === 0) {
      return prefix.startsWith('/--', i) ? prefix.slice(i + 3, -2).trim() : undefined;
    }
  }
  return undefined;
}
