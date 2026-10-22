/**
 * CLI commands for projects checked by the explorer (plan, Phase 6):
 * `simProject` entries, which provide `check`, `checkAll`,
 * `checkFirstBranch` and `stateGraph`. Exit codes: 0 when the tested
 * configurations pass, 1 for a failure or an error, 2 when the exploration
 * is incomplete.
 */
import type { CheckOptions, CheckReport, ProjectType } from '@bramas/simulant-core/types/project';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { referenceOrderingWarning } from '@bramas/simulant-lang/caveats';

export type Print = (line: string) => void;

export const exitCode = (r: CheckReport) => r.status === 'success' ? 0 : r.status === 'failure' ? 1 : 2;

/** Prints a counterexample by replaying its path in the project's execution, as the simulator does. */
export function printTrace(project: ProjectType<any, any>, r: CheckReport, print: Print) {
  const trace = r.trace;
  if (!trace) return;
  const model = project.setup(trace.settings);
  const execution = project.execute(model);
  print(`Counterexample (${trace.kind === 'lasso' ? 'an execution that repeats forever' : 'a failing configuration'}):`);
  print(`  settings ${JSON.stringify(trace.settings)}, path [${trace.path.join(', ')}] (load both in the simulator to replay it)`);
  trace.path.forEach((_, i) => {
    const prefix = trace.path.slice(0, i + 1);
    const shown = project.debugConfig ? project.debugConfig(execution.get(prefix), model) : '';
    const label = trace.steps[i].label ? ` (${trace.steps[i].label})` : '';
    const cycle = trace.cycleStart === i ? '  <- the cycle starts here' : '';
    print(`  Step ${i}${label}: ${shown} [${trace.steps[i].verdict}]${cycle}`);
  });
  if (trace.kind === 'lasso') print(`  The last step returns to step ${trace.cycleStart} (up to symmetry); the steps after it repeat forever.`);
}

function printStats(r: CheckReport, print: Print) {
  const s = r.stats;
  const graphs = r.settings !== undefined ? `, ${r.settings} settings in ${r.graphs} state graph(s)` : '';
  print(`States: ${s.states} (expanded ${s.expanded}, edges ${s.edges}, depth ${s.maxDepth}, symmetry group of ${s.group})${graphs}`);
  if (r.revision) print(`Revision: ${r.revision}`);
}

function printVerdict(r: CheckReport, print: Print, what: string) {
  if (r.status === 'success') print(`✅ ${what}: ${r.reason}`);
  else if (r.status === 'failure') print(`❌ ${what}: ${r.reason}`);
  else print(`⚠️  ${what}: exploration incomplete (${r.reason})`);
}

/** The caveats of the experiment's semantics in the interpreter (`.sim` projects only). */
function printCaveats(project: ProjectType<any, any>, print: Print) {
  let ir: Experiment | undefined;
  try {
    ir = project.experiment?.().ir as Experiment | undefined;
  } catch {
    return; // The check reports why the experiment is unavailable.
  }
  const warning = ir && referenceOrderingWarning(ir);
  if (warning) print(`⚠️  ${warning}`);
}

export async function checkConfig(project: ProjectType<any, any>, name: string, settings: unknown, options: CheckOptions, print: Print): Promise<number> {
  print(`Checking every admissible execution of ${name} (explorer)...`);
  printCaveats(project, print);
  print(`Settings: ${JSON.stringify(settings)}`);
  const r = await project.check!(settings, options);
  print('');
  print('=== Result ===');
  printStats(r, print);
  printVerdict(r, print, 'Result');
  printTrace(project, r, print);
  return exitCode(r);
}

export async function checkAll(project: ProjectType<any, any>, name: string, options: CheckOptions, print: Print, progress?: (line: string) => void): Promise<number> {
  print(`Checking every generated setting of ${name} (explorer${options.perSetting ? ', one state graph per setting' : ', settings with the same instantiated model share a state graph'})...`);
  printCaveats(project, print);
  const r = await project.checkAll!(options, (done, total) => progress?.(`\rChecked ${done}/${total} settings`));
  progress?.('\n');
  print('');
  print('=== Summary ===');
  printStats(r, print);
  printVerdict(r, print, r.status === 'failure' ? 'FAILURE FOUND' : r.status === 'success' ? 'ALL CONFIGURATIONS PASSED' : 'INCOMPLETE');
  printTrace(project, r, print);
  return exitCode(r);
}

/** `simulant check`: the first branch of every generated setting. */
export function checkFirstBranches(project: ProjectType<any, any>, name: string, options: CheckOptions, print: Print): number {
  print(`Starting checks for project: ${name} (first branch of each setting, explorer)`);
  let tested = 0, succeeded = 0, failed = 0;
  for (const settings of project.settingsGenerator?.() ?? []) {
    tested++;
    const r = project.checkFirstBranch!(settings, options);
    if (r.status === 'success') { succeeded++; continue; }
    failed++;
    print(`Result: ${r.status === 'failure' ? 'Failure' : 'Incomplete'} (${r.reason})`);
    print(`Settings: ${JSON.stringify(settings)}`);
    printTrace(project, r, print);
    break;
  }
  print('\n--- Summary ---');
  print(`Project: ${name}`);
  print(`Total Tested: ${tested}`);
  print(`Succeeded: ${succeeded}`);
  print(`Failed: ${failed}`);
  print('---------------');
  return failed ? 1 : 0;
}

const tex = (s: string) => s.replace(/[\\{}&%$#_^~]/g, c => c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`);

/** The explored state graph in TikZ: states by depth, edges labelled with their witnesses. */
export function stateGraphTikz(project: ProjectType<any, any>, settings: unknown, options: CheckOptions): { tikz: string; states: number; complete: boolean } {
  const g = project.stateGraph!(settings, options);
  const model = project.setup(settings);
  const lines = [
    '\\begin{tikzpicture}[',
    '  node/.style={circle, draw, minimum size=1cm},',
    '  success/.style={node, fill=green!20},',
    '  failure/.style={node, fill=red!20},',
    '  inProgress/.style={node, fill=orange!20},',
    '  edge/.style={->, font=\\tiny}',
    ']',
    '',
  ];
  const perDepth = new Map<number, number>();
  for (const s of g.states) {
    const x = (perDepth.get(s.depth) ?? 0) * 3;
    perDepth.set(s.depth, x / 3 + 1);
    const shown = project.debugConfig ? tex(project.debugConfig(s.config, model)) : String(s.id);
    lines.push(`  \\node[${s.verdict}] (s${s.id}) at (${x},${-s.depth * 2}) {\\begin{tabular}{c}\\tiny s${s.id} \\\\ \\texttt{\\tiny ${shown}}\\end{tabular}};`);
  }
  lines.push('');
  for (const e of g.edges) {
    const loop = e.from === e.to ? ' [loop right]' : '';
    lines.push(`  \\draw[edge] (s${e.from}) to${loop} node[midway, sloped, above] {${tex(e.label)}} (s${e.to});`);
  }
  lines.push('\\end{tikzpicture}');
  return { tikz: lines.join('\n'), states: g.states.length, complete: g.complete };
}
