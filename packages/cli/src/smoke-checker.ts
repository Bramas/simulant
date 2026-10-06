import { execute } from '@bramas/simulant-core/lib/system';
import type { ExecutionStatus } from '@bramas/simulant-core/types/project';
import { listProjects, loadProject, type ProjectSourceOptions } from './project-registry';

// This checks the first branch at each step. Use cli check-config for exhaustive checking.
export async function runSmokeChecker(projectName?: string, source: ProjectSourceOptions = {}) {
  if (!projectName) {
    console.log('Usage: simulant check <simulation-name>');
    console.log('Available projects:');
    for (const name of await listProjects(source)) console.log(`  - ${name}`);
    return;
  }

  const project = await loadProject(projectName, source);
  const { settingsGenerator, setup, executionStatusChecker, maxIterationsPerExecution } = project;

  if (!settingsGenerator || !setup || !executionStatusChecker) {
    console.error("The specified project module does not export the required functions: settingsGenerator, setup, executionStatusChecker.");
    process.exit(1);
  }

  console.log(`Starting checks for project: ${projectName}`);
  let tested = 0;
  let succeeded = 0;
  let failed = 0;

  const generator = settingsGenerator();

  while (true) {
    let settings;
    try {
      const result = generator.next();
      if (result.done) {
        console.log("All settings tested.");
        break;
      }
      settings = result.value;
    } catch (e) {
      throw new Error(`Error generating settings: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!settings) {
        console.log("No more settings to test or generator finished.");
        break;
    }
    tested++;

    try {
      const model = setup(settings);
      const execution = execute(model);
      const configs: any[] = [];
      const path = [0];
      const maxIterations = maxIterationsPerExecution || 1000;
      let status: ExecutionStatus = 'inProgress';

        if (tested % 100 === 0) {
        console.log(`Progress: Tested: ${tested}, current settings ${settings.N}: ${settings.initialConfig}`);
        }

      for (let i = 0; i < maxIterations; i++) {
        const config = execution.get(path);
        configs.push(config);
        status = executionStatusChecker(config, model, configs);
        if (status !== 'inProgress') {
          break;
        }
        if (i + 1 < maxIterations) {
          if (execution.getChildrenCount(path) === 0) break;
          path.push(0);
        }
      }

      if (status === 'success') {
        succeeded++;
        //console.log("Result: Success");
      } else if (status === 'failure') {
        failed++;
        console.error("Result: Failure");
        console.log("Counter example found!");
        console.log("Settings:", settings);
        console.log("Final config:", configs[configs.length - 1]);
        if (project.debugConfig) {
          configs.forEach((config, index) => console.log(`Config ${index}: ${project.debugConfig!(config, model)}`));
        }
        break; // Stop on first failure
      } else { // 'inProgress' after maxIterations
        failed++;
        console.error("Result: Failure (Did not terminate)");
        console.log("Algorithm did not terminate in", maxIterations, "steps");
        console.log("Settings:", settings);
        console.log("Final config:", configs[configs.length - 1]);
        break; // Stop on non-termination
      }
    } catch (e) {
      failed++;
      console.error(`Error testing settings: ${e instanceof Error ? e.message : String(e)}`);
      console.log("Settings:", settings);
      break; // Stop on error
    }
    //console.log(`Progress: Tested: ${tested}, Succeeded: ${succeeded}, Failed: ${failed}\n`);
  }

  console.log("\n--- Summary ---");
  console.log(`Project: ${projectName}`);
  console.log(`Total Tested: ${tested}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log("---------------");

  if (failed > 0) {
    process.exit(1);
  }
}

