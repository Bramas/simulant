/**
 * Loading a `.sim` program: an entry module and everything it imports.
 * Imports are relative paths (`"./models.sim"`) or standard-library paths
 * (`"std/models.sim"`). Every declaration of an imported module is visible.
 */
import type { SDecl, SFile } from '../parse/ast';
import { LexError, type Span } from '../parse/lexer';
import { parse, ParseError } from '../parse/parser';

export type Diagnostic = { message: string; span?: Span };

export interface SourceHost {
  read(path: string): string | undefined;
  /** The path of module `spec` imported from `from`. */
  resolve(from: string, spec: string): string;
}

export class Program {
  readonly modules = new Map<string, SFile>();
  readonly diagnostics: Diagnostic[] = [];
  /** Every file read, including those that failed: watched for changes. */
  readonly files = new Set<string>();

  constructor(readonly host: SourceHost, readonly entry: string) {
    this.load(entry);
  }

  private load(path: string, importedAt?: Span) {
    if (this.modules.has(path) || this.files.has(path)) return;
    this.files.add(path);
    const source = this.host.read(path);
    if (source === undefined) {
      this.diagnostics.push({ message: `cannot read module ${path}`, span: importedAt });
      return;
    }
    let file: SFile;
    try {
      file = parse(source, path);
    } catch (e) {
      if (e instanceof ParseError || e instanceof LexError) {
        this.diagnostics.push({ message: e.message, span: e.span });
        return;
      }
      throw e;
    }
    this.modules.set(path, file);
    for (const d of file.decls) {
      if (d.d === 'import') this.load(this.host.resolve(path, d.path), d.span);
    }
  }

  /** All declarations of the program, entry module last. */
  decls(): SDecl[] {
    return [...this.modules.values()].reverse().flatMap(f => f.decls);
  }
}
