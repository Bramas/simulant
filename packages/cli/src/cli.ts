import { Command, InvalidArgumentError } from 'commander';
import { readFileSync } from 'node:fs';

function depthArgument(value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number)) {
    throw new InvalidArgumentError('Expected a non-negative integer.');
  }
  return number;
}

function countArgument(value: string): number {
  const number = depthArgument(value);
  if (number === 0) throw new InvalidArgumentError('Expected a positive integer.');
  return number;
}
import { resolve as resolvePath } from 'node:path';
import type { ProjectType } from '@bramas/simulant-core/types/project';
import { listProjects as listAvailableProjects, loadProject as loadNamedProject, locateProject, type ProjectSourceOptions } from './project-registry';
import { leanCommand } from './lean';
import { runSmokeChecker } from './smoke-checker';
import * as explorer from './explorer-commands';
import { requestWatch, watchProject } from './watch';

const print = (line: string) => console.log(line);
/** Explorer limits from the options: no depth limit unless given (liveness needs the whole graph). */
const explorerOptions = (options: { maxDepth?: number; maxStates?: number; maxConfigs?: number; perSetting?: boolean }) => ({
  maxDepth: options.maxDepth, maxStates: options.maxStates, maxConfigs: options.maxConfigs, perSetting: options.perSetting,
});

const program = new Command();
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

program
  .name('simulant')
  .description('CLI tool for testing and generating artifacts from mobile entities projects')
  .version(metadata.version)
  .option('--root <directory>', 'Project or workspace directory (default: current directory)')
  .option('--registry <file>', 'Project registry module, relative to --root or the current directory');

const projectSource = () => program.opts<ProjectSourceOptions>();
const loadProject = (name: string, watch = false) => {
  if (watch) requestWatch();
  return loadNamedProject(name, projectSource());
};

/** A simulation that provides the explorer's commands (a `.sim` project, see `simProject`). */
async function loadExplorable(name: string, watch: boolean | undefined, needs: keyof ProjectType) {
  const project = await loadProject(name, watch);
  if (!project[needs]) {
    console.error(`Error: Project "${name}" does not provide ${needs} (simulations are .sim experiments registered with simProject)`);
    process.exit(1);
  }
  return project;
}

function parseSettings(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`Error: Invalid JSON in settings: ${e}`);
    process.exit(1);
  }
}

/** Runs once and exits with the run's code, or, with --watch, again on each new revision. */
async function runOrWatch(project: Awaited<ReturnType<typeof loadProject>>, watch: boolean | undefined, run: (signal?: AbortSignal) => Promise<number>) {
  if (!watch) process.exit(await run());
  await watchProject(project, run, print).done;
}
const watchOption = '-w, --watch';
const watchHelp = 'Run again on every change of the .sim sources';
const listProjects = () => listAvailableProjects(projectSource());

// Command: generate-config-graph
program
  .command('generate-config-graph')
  .description('Generate a configuration graph in TikZ format')
  .requiredOption('-p, --project <name>', 'Project name (e.g., gathering-on-rings)')
  .requiredOption('-s, --settings <json>', 'Settings as JSON string')
  .option('-d, --max-depth <number>', 'Maximum depth to explore (default: unlimited)', depthArgument)
  .option('--max-states <number>', 'Maximum number of states', countArgument)
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option(watchOption, watchHelp)
  .action(async (options) => {
    const projectName = options.project as string;
    const project = await loadExplorable(projectName, options.watch, 'stateGraph');
    const settings = parseSettings(options.settings);
    await runOrWatch(project, options.watch, async () => {
      try {
        const { tikz, states, complete } = explorer.stateGraphTikz(project, settings, explorerOptions(options));
        console.log(`State graph of ${projectName} with ${states} states${complete ? '' : ' (incomplete: limit reached)'}`);
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, tikz, 'utf-8');
          console.log(`TikZ output written to ${options.output}`);
        } else {
          console.log('\n=== TikZ Output ===\n');
          console.log(tikz);
        }
        return 0;
      } catch (e) {
        console.error(`Error generating graph: ${e instanceof Error ? e.stack : e}`);
        return 1;
      }
    });
  });

// Command: check-config
program
  .command('check-config')
  .description('Check all possible execution paths from a configuration')
  .requiredOption('-p, --project <name>', 'Project name')
  .requiredOption('-s, --settings <json>', 'Settings as JSON string')
  .option('-d, --max-depth <number>', 'Maximum depth to explore (default: unlimited)', depthArgument)
  .option('--max-states <number>', 'Maximum number of states', countArgument)
  .option(watchOption, watchHelp)
  .action(async (options) => {
    const projectName = options.project as string;
    const project = await loadExplorable(projectName, options.watch, 'check');
    const settings = parseSettings(options.settings);
    await runOrWatch(project, options.watch, async signal => {
      try {
        return await explorer.checkConfig(project, projectName, settings, { ...explorerOptions(options), signal }, print);
      } catch (e) {
        if (signal?.aborted) throw e;
        console.error(`Error checking config: ${e instanceof Error ? e.stack : e}`);
        return 1;
      }
    });
  });

// Command: check-all
program
  .command('check-all')
  .description('Check every setting of the experiment\'s parameter domains')
  .requiredOption('-p, --project <name>', 'Project name')
  .option('-d, --max-depth <number>', 'Maximum depth to explore per configuration (default: unlimited)', depthArgument)
  .option('--max-states <number>', 'Maximum number of states per state graph', countArgument)
  .option('--max-configs <number>', 'Maximum number of configurations to test (default: all)', countArgument)
  .option('--per-setting', 'One state graph per setting, instead of one per instantiated model (space and observation parameters)')
  .option(watchOption, watchHelp)
  .action(async (options) => {
    const projectName = options.project as string;
    const project = await loadExplorable(projectName, options.watch, 'checkAll');
    const progress = process.stdout.isTTY ? (line: string) => process.stdout.write(line) : undefined;
    await runOrWatch(project, options.watch, async signal => {
      try {
        return await explorer.checkAll(project, projectName, { ...explorerOptions(options), signal }, print, progress);
      } catch (e) {
        if (signal?.aborted) throw e;
        console.error(`\n\nError during testing: ${e instanceof Error ? e.stack : e}`);
        return 1;
      }
    });
  });

program
  .command('lean')
  .description('Generate into <project>/lean/Generated; preserves Proofs/ and existing Lake configuration')
  .option('-p, --project <name>', 'Simulation name (inferred when exactly one is available)')
  .option('-o, --out <directory>', 'Lean directory (default: <project>/lean)')
  .option('-b, --build', 'Run lake build afterwards (checks the model and the proofs)')
  .option(watchOption, 'Generate again (and build, with --build) on every change of the .sim sources')
  .action(async (options) => {
    if (options.watch) requestWatch();
    let name = options.project as string | undefined;
    if (!name) {
      const names = await listProjects();
      if (!names.length) throw new Error('No simulations found. Run from a project directory, or select one with --root or --registry.');
      if (names.length > 1) throw new Error(`Several simulations are available: ${names.join(', ')}. Choose one with --project <name> (or -p <name>).`);
      name = names[0];
    }
    const { project, directory } = await locateProject(name, projectSource());
    await runOrWatch(project, options.watch, async signal => {
      try {
        return await leanCommand(project, name, directory, { out: options.out && resolvePath(options.out), build: options.build, signal }, print);
      } catch (e) {
        if (signal?.aborted) throw e;
        console.error(`Error: ${e instanceof Error ? e.message : e}`);
        return 1;
      }
    });
  });

program
  .command('list-projects')
  .description('List simulations from public packages and available local private projects')
  .action(async () => {
    for (const name of await listProjects()) console.log(name);
  });

program
  .command('check [project]')
  .description('Smoke check the first execution branch for each generated setting')
  .option('-p, --project <name>', 'Simulation name')
  .option(watchOption, watchHelp)
  .action(async (name, options) => {
    const projectName = options.project ?? name;
    if (options.watch && projectName) {
      const project = await loadExplorable(projectName, true, 'checkFirstBranch');
      await runOrWatch(project, true, async () => explorer.checkFirstBranches(project, projectName, {}, print));
      return;
    }
    await runSmokeChecker(projectName, projectSource());
  });

program.parseAsync().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
