/** Compiles a single `.sim` text against the standard library, in the browser or under Node. */
import { compile } from '../../../packages/lang/src/elab/elaborate';
import { Program, type SourceHost } from '../../../packages/lang/src/elab/program';
import type { Experiment } from '../../../packages/lang/src/ir';

export type SiteDiagnostic = { message: string; file?: string; line?: number; column?: number };
export type Compiled = { experiments: Record<string, Experiment>; diagnostics: SiteDiagnostic[] };

export const ENTRY = 'main.sim';

/** `sources` maps `std/<file>.sim` to the library's text. */
export function compileText(text: string, sources: Record<string, string>): Compiled {
  const host: SourceHost = {
    read: (path) => (path === ENTRY ? text : sources[path]),
    resolve: (from, spec) => {
      if (spec.startsWith('std/')) return spec;
      const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
      return dir + spec.replace(/^\.\//, '');
    },
  };
  const program = new Program(host, ENTRY);
  const diagnostics: SiteDiagnostic[] = [];
  const seen = new Set<string>();
  const add = (d: { message: string; span?: { file: string; start: { line: number; col: number } } }) => {
    const diagnostic = { message: d.message, file: d.span?.file, line: d.span?.start.line, column: d.span?.start.col };
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };
  const experiments: Record<string, Experiment> = {};
  try {
    const out = compile(program);
    out.diagnostics.forEach(add);
    for (const [name, result] of Object.entries(out.experiments)) {
      if (result.experiment) experiments[name] = result.experiment;
      result.diagnostics.forEach(add);
    }
  } catch (error) {
    program.diagnostics.forEach(add);
    add({ message: `Compiler error: ${error instanceof Error ? error.message : String(error)}` });
  }
  return { experiments, diagnostics };
}
