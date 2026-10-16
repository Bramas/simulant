/** What a compiled `.sim` module exports (shared by the plugin and the pages that import it). */
import type { Experiment } from '@bramas/simulant-lang/ir';
import type { LeanRegion } from '@bramas/simulant-lean-gen/model';

/**
 * The Lean model of an experiment, as `simulant lean` generates it (in namespace
 * `Generated.<module>`), with the parts of the experiment each region translates, and the library
 * components it imports; or why it has no translation.
 */
export type SimLean =
  | { module: string; text: string; regions: LeanRegion[]; library: { component: string; module: string; text: string }[] }
  | { module: string; error: string };

export type SimDiagnostic = {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  /** The experiment the diagnostic is about, if any. */
  experiment?: string;
};

export type SimModule = {
  /** Experiments of the entry module that compiled. */
  experiments: Record<string, Experiment>;
  /** Experiments of the entry module that did not compile. */
  failed: string[];
  diagnostics: SimDiagnostic[];
  /** Source texts, by path, for the algorithm view. */
  sources: Record<string, string>;
  /** The generated Lean model of each experiment that compiled, for the model view. */
  lean?: Record<string, SimLean>;
  /** Identifies the sources and compiler version: results of another revision are out of date. */
  revision: string;
  /**
   * Calls `listener` with the new module after each successful or failed
   * recompilation (development server only; elsewhere, never). The module
   * accepts its own hot updates, so the modules importing it keep running.
   */
  subscribe?: (listener: (next: SimModule) => void) => () => void;
};

export function formatDiagnostic(d: SimDiagnostic): string {
  return `${d.file ? `${d.file}:${d.line}:${d.column}: ` : ''}${d.message}`;
}
