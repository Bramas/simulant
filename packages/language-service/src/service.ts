import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItemKind, DiagnosticSeverity, MarkupKind, SymbolKind,
  type CompletionItem, type Diagnostic, type FoldingRange, type Hover, type Location, type Position,
  type SignatureHelp, type SymbolInformation, type WorkspaceEdit,
} from 'vscode-languageserver-types';
import { compile } from '../../lang/src/elab/elaborate';
import { Program, type SourceHost } from '../../lang/src/elab/program';
import type { Experiment } from '../../lang/src/ir';
import { builtins, constructors, keywords, types } from './catalog';
import { document, range, recover, tokens } from './source';
import { Symbols, type Binding } from './symbols';

export interface LanguageHost extends SourceHost {
  /** File URIs available for project-wide references/rename; browser hosts can list their map keys. */
  files?(): Iterable<string>;
}

export type Analysis = { program: Program; symbols: Symbols; diagnostics: Map<string, Diagnostic[]>; experiments: Record<string, Experiment> };

/** No filesystem, VS Code or transport dependency: hosts own source storage and resolution. */
export class LanguageService {
  readonly documents = new Map<string, TextDocument>();
  private readonly cache = new Map<string, Analysis>();

  constructor(readonly host: LanguageHost, readonly stdlibUri?: string) {}

  setDocument(uri: string, text: string, version: number): boolean {
    const previous = this.documents.get(uri);
    if (previous && version <= previous.version) return false;
    this.documents.set(uri, document(uri, text, version));
    this.invalidate();
    return true;
  }

  closeDocument(uri: string) { this.documents.delete(uri); this.invalidate(); }
  invalidate() { this.cache.clear(); }
  read(uri: string): string | undefined { return this.documents.get(uri)?.getText() ?? this.host.read(uri); }

  analyze(uri: string): Analysis {
    const cached = this.cache.get(uri);
    if (cached) return cached;
    const host: SourceHost = { read: p => this.read(p), resolve: (from, spec) => this.host.resolve(from, spec) };
    const program = new Program(host, uri);
    const diagnostics = new Map<string, Diagnostic[]>();
    const experiments: Record<string, Experiment> = {};
    const seen = new Set<string>();
    const add = (d: Program['diagnostics'][number]) => {
      const file = d.span?.file ?? uri;
      const diagnostic: Diagnostic = { message: d.message, severity: DiagnosticSeverity.Error, source: 'simulant',
        range: d.span ? range(d.span) : { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
      const key = `${file}:${JSON.stringify(diagnostic)}`;
      if (seen.has(key)) return;
      seen.add(key);
      diagnostics.set(file, [...diagnostics.get(file) ?? [], diagnostic]);
    };
    try {
      const compiled = compile(program);
      for (const diagnostic of compiled.diagnostics) add(diagnostic);
      for (const [name, experiment] of Object.entries(compiled.experiments)) {
        if (experiment.experiment) experiments[name] = experiment.experiment;
        for (const diagnostic of experiment.diagnostics) add(diagnostic);
      }
    } catch (error) {
      for (const diagnostic of program.diagnostics) add(diagnostic);
      add({ message: `Compiler error: ${error instanceof Error ? error.message : String(error)}` });
    }
    const sources = new Map<string, string>();
    const files = [], indexed = new Set<string>();
    const pending = [...program.files];
    for (let i = 0; i < pending.length; i++) {
      const file = pending[i];
      if (indexed.has(file)) continue;
      indexed.add(file);
      const source = this.read(file);
      if (source === undefined) continue;
      sources.set(file, source);
      const ast = program.modules.get(file) ?? recover(source, file);
      files.push(ast);
      for (const decl of ast.decls) if (decl.d === 'import') pending.push(this.host.resolve(file, decl.path));
    }
    const analysis = { program, diagnostics, experiments, symbols: new Symbols(sources, files, this.stdlibUri) };
    this.cache.set(uri, analysis);
    return analysis;
  }

  private offset(uri: string, position: Position): number { return document(uri, this.read(uri) ?? '').offsetAt(position); }

  private word(uri: string, position: Position): { text: string; range: Location['range'] } | undefined {
    const text = this.read(uri) ?? '', offset = this.offset(uri, position);
    const token = tokens(text, uri).find(t => offset >= t.start.offset && offset <= t.end.offset && ['ident', 'dotIdent', 'field'].includes(t.kind));
    return token && { text: token.text, range: { start: document(uri, text).positionAt(token.start.offset), end: document(uri, text).positionAt(token.end.offset) } };
  }

  definition(uri: string, position: Position): Location | undefined {
    const analysis = this.analyze(uri);
    const offset = this.offset(uri, position);
    const occurrence = analysis.symbols.at(uri, offset);
    if (occurrence) return analysis.symbols.location(occurrence.binding);
    const token = tokens(this.read(uri) ?? '', uri).find(t => t.kind === 'string' && offset > t.start.offset && offset < t.end.offset);
    const imported = analysis.program.modules.get(uri)?.decls.find(d => d.d === 'import' && token && d.span.start.offset <= token.start.offset && d.span.end.offset >= token.end.offset);
    if (imported?.d === 'import') return { uri: this.host.resolve(uri, imported.path), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
    return undefined;
  }

  hover(uri: string, position: Position): Hover | undefined {
    const occurrence = this.analyze(uri).symbols.at(uri, this.offset(uri, position));
    if (occurrence) return { range: occurrence.range, contents: { kind: MarkupKind.Markdown,
      value: `\`\`\`simulant\n${occurrence.binding.signature}\n\`\`\`${occurrence.binding.doc ? `\n\n${occurrence.binding.doc}` : ''}` } };
    const word = this.word(uri, position);
    if (!word) return undefined;
    const builtin = builtins[word.text] ?? builtins[word.text.split('.').at(-1)!];
    if (builtin) return { range: word.range, contents: { kind: MarkupKind.Markdown, value: `\`\`\`simulant\n${builtin.signature}\n\`\`\`\n\n${builtin.detail}` } };
    if (types.includes(word.text)) return { range: word.range, contents: { kind: MarkupKind.Markdown, value: `Built-in type **${word.text}**.` } };
    return undefined;
  }

  completion(uri: string, position: Position): CompletionItem[] {
    const text = this.read(uri) ?? '', offset = this.offset(uri, position);
    const prefix = text.slice(0, offset);
    const analysis = this.analyze(uri);
    const items: CompletionItem[] = [];
    const importMatch = /\bimport\s+"([^"\n]*)$/.exec(prefix);
    if (importMatch) {
      const typed = importMatch[1];
      const parent = this.stdlibUri && typed.startsWith('std/') ? this.stdlibUri : this.host.resolve(uri, './');
      for (const file of this.host.files?.() ?? []) {
        if (!file.startsWith(parent) || !file.endsWith('.sim')) continue;
        const name = file.slice(parent.length);
        const label = typed.startsWith('std/') ? `std/${name}` : `./${name}`;
        if (label.startsWith(typed)) items.push({ label, kind: CompletionItemKind.File, textEdit: { range: {
          start: document(uri, text).positionAt(offset - typed.length), end: position }, newText: label } });
      }
      return items;
    }
    const member = /([\wÀ-ɏͰ-Ͽ']+(?:\.[\wÀ-ɏͰ-Ͽ']+)*)\.([\wÀ-ɏͰ-Ͽ']*)$/.exec(prefix);
    const typed = member?.[2] ?? /[\wÀ-ɏͰ-Ͽ']*$/.exec(prefix)![0];
    const suffix = /^[\wÀ-ɏͰ-Ͽ']*/.exec(text.slice(offset))![0].length;
    const replace = { start: document(uri, text).positionAt(offset - typed.length), end: document(uri, text).positionAt(offset + suffix) };
    const fromBinding = (b: Binding, label = b.name) => items.push({ label, kind: b.kind === SymbolKind.Function ? CompletionItemKind.Function
      : b.kind === SymbolKind.EnumMember ? CompletionItemKind.EnumMember : b.kind === SymbolKind.Field ? CompletionItemKind.Field
      : b.kind === SymbolKind.Struct || b.kind === SymbolKind.Enum ? CompletionItemKind.Class : CompletionItemKind.Variable,
      detail: b.signature, documentation: b.doc, textEdit: { range: replace, newText: label } });
    if (member) {
      const binding = analysis.symbols.resolve(uri, member[1], offset);
      if (binding) for (const b of analysis.symbols.members(binding)) fromBinding(b);
      for (const b of analysis.symbols.visible(uri, offset)) if (b.name.startsWith(`${member[1]}.`)) fromBinding(b, b.name.slice(member[1].length + 1));
      for (const [name, builtin] of Object.entries(builtins)) {
        const label = name.startsWith(`${member[1]}.`) ? name.slice(member[1].length + 1) : !name.includes('.') ? name : undefined;
        if (label) items.push({ label, kind: CompletionItemKind.Method, detail: builtin.signature, documentation: builtin.detail, textEdit: { range: replace, newText: label } });
      }
    } else {
      for (const b of analysis.symbols.visible(uri, offset)) fromBinding(b);
      for (const name of types) items.push({ label: name, kind: CompletionItemKind.Class, textEdit: { range: replace, newText: name } });
      for (const name of keywords) items.push({ label: name, kind: CompletionItemKind.Keyword, textEdit: { range: replace, newText: name } });
      for (const [name, builtin] of Object.entries(builtins)) items.push({ label: name, kind: CompletionItemKind.Function, detail: builtin.signature, documentation: builtin.detail, textEdit: { range: replace, newText: name } });
      if (/\.[\w]*$/.test(prefix)) {
        for (const name of [...constructors, ...analysis.symbols.bindings.filter(b => b.kind === SymbolKind.EnumMember).map(b => b.name)]) items.push({ label: name, kind: CompletionItemKind.EnumMember, textEdit: { range: replace, newText: name } });
      }
    }
    const unique = new Map<string, CompletionItem>();
    for (const item of items) if (item.label.toLowerCase().startsWith(typed.toLowerCase()) && !unique.has(item.label)) unique.set(item.label, item);
    return [...unique.values()];
  }

  private projectAnalyses(uri: string): Analysis[] {
    return [...new Set([uri, ...this.documents.keys(), ...this.host.files?.() ?? []])]
      .filter(f => (f === uri || this.documents.has(f) || f.endsWith('.sim')) && !(this.stdlibUri && f.startsWith(this.stdlibUri))).map(f => this.analyze(f));
  }

  references(uri: string, position: Position, includeDeclaration = true): Location[] {
    const binding = this.analyze(uri).symbols.at(uri, this.offset(uri, position))?.binding;
    if (!binding) return [];
    const found = new Map<string, Location>();
    for (const analysis of this.projectAnalyses(uri)) for (const o of analysis.symbols.occurrences) {
      if (o.binding.id === binding.id && (includeDeclaration || !o.declaration)) found.set(`${o.uri}:${o.start}:${o.end}`, { uri: o.uri, range: o.range });
    }
    return [...found.values()];
  }

  prepareRename(uri: string, position: Position): { range: Location['range']; placeholder: string } | undefined {
    const occurrence = this.analyze(uri).symbols.at(uri, this.offset(uri, position));
    return occurrence && !occurrence.binding.readonly ? { range: occurrence.range, placeholder: occurrence.binding.name.split('.').at(-1)! } : undefined;
  }

  rename(uri: string, position: Position, newName: string): WorkspaceEdit {
    const binding = this.analyze(uri).symbols.at(uri, this.offset(uri, position))?.binding;
    if (!binding || binding.readonly) throw new Error('Select an editable declaration or a reference to it.');
    const parsed = tokens(newName, '<rename>').filter(t => t.kind !== 'eof');
    if (parsed.length !== 1 || parsed[0].kind !== 'ident' || parsed[0].text !== newName || newName.includes('.') || keywords.includes(newName) || types.includes(newName) || newName in builtins) throw new Error('The new name must be a non-reserved identifier.');
    const sibling = this.analyze(uri).symbols.bindings.find(b => b.id !== binding.id && b.name === newName && b.parentId === binding.parentId
      && b.scope?.start === binding.scope?.start && b.scope?.end === binding.scope?.end);
    if (sibling) throw new Error(`Renaming to ${newName} would conflict with another declaration.`);
    if (binding.kind === SymbolKind.EnumMember) {
      for (const analysis of this.projectAnalyses(uri)) for (const [file, text] of analysis.symbols.sources) {
        for (const token of tokens(text, file)) if (token.kind === 'dotIdent' && token.text === binding.name && !analysis.symbols.at(file, token.start.offset + 1)) {
          throw new Error('An ambiguous constructor reference prevents a safe rename. Qualify it with the enum name first.');
        }
      }
    }
    const documents = new Map<string, { version: number | null; edits: { range: Location['range']; newText: string }[] }>();
    for (const location of this.references(uri, position)) {
      const symbols = this.analyze(location.uri).symbols;
      const conflict = symbols.resolve(location.uri, newName, this.offset(location.uri, location.range.start));
      if (conflict && conflict.id !== binding.id) throw new Error(`Renaming to ${newName} would conflict with another declaration.`);
      const target = documents.get(location.uri) ?? { version: this.documents.get(location.uri)?.version ?? null, edits: [] };
      target.edits.push({ range: location.range, newText: newName });
      documents.set(location.uri, target);
    }
    return { documentChanges: [...documents].map(([uri, target]) => ({ textDocument: { uri, version: target.version }, edits: target.edits })) };
  }

  documentSymbols(uri: string) { return this.analyze(uri).symbols.outline(uri); }

  workspaceSymbols(query: string): SymbolInformation[] {
    const found = new Map<string, SymbolInformation>();
    for (const uri of new Set([...this.documents.keys(), ...this.host.files?.() ?? []])) {
      if ((!this.documents.has(uri) && !uri.endsWith('.sim')) || this.stdlibUri && uri.startsWith(this.stdlibUri)) continue;
      for (const b of this.analyze(uri).symbols.bindings) if (!b.scope && !b.readonly && b.name.toLowerCase().includes(query.toLowerCase())) found.set(b.id, { name: b.name, kind: b.kind, location: { uri: b.uri, range: b.selection } });
    }
    return [...found.values()];
  }

  signatureHelp(uri: string, position: Position): SignatureHelp | undefined {
    const offset = this.offset(uri, position), symbols = this.analyze(uri).symbols;
    const applications = symbols.applications.filter(a => a.uri === uri && a.expr.span.start.offset <= offset && a.expr.span.end.offset >= offset)
      .sort((a, b) => (a.expr.span.end.offset - a.expr.span.start.offset) - (b.expr.span.end.offset - b.expr.span.start.offset));
    const app = applications[0]?.expr;
    if (!app) {
      const prefix = (this.read(uri) ?? '').slice(0, offset);
      const line = prefix.slice(prefix.lastIndexOf('\n') + 1);
      const ts = tokens(line, uri).filter(t => t.kind !== 'eof');
      for (let i = ts.length - 1; i >= 0; i--) {
        const binding = symbols.resolve(uri, ts[i].text, offset), builtin = builtins[ts[i].text];
        const params = binding?.params ?? builtin?.params;
        if (!params?.length) continue;
        return { signatures: [{ label: binding?.signature ?? builtin.signature, parameters: params.map(label => ({ label })) }],
          activeSignature: 0, activeParameter: Math.min(params.length - 1, ts.length - i - 1) };
      }
      return undefined;
    }
    const name = app.fn.t === 'name' ? app.fn.name : app.fn.t === 'proj' ? app.fn.field : '';
    const binding = symbols.resolve(uri, name, app.fn.span.start.offset);
    const builtin = builtins[name] ?? builtins[name.split('.').at(-1)!];
    const params = binding?.params ?? builtin?.params;
    if (!params?.length) return undefined;
    return { signatures: [{ label: binding?.signature ?? builtin.signature, parameters: params.map(label => ({ label })) }],
      activeSignature: 0, activeParameter: Math.min(params.length - 1, app.args.filter(a => a.value.span.end.offset < offset).length) };
  }

  foldingRanges(uri: string): FoldingRange[] {
    const result: FoldingRange[] = [], seen = new Set<string>();
    for (const span of this.analyze(uri).symbols.regions) {
      if (span.file !== uri || span.end.line <= span.start.line) continue;
      const key = `${span.start.line}:${span.end.line}`;
      if (!seen.has(key)) { seen.add(key); result.push({ startLine: span.start.line - 1, endLine: span.end.line - 1 }); }
    }
    return result;
  }
}
