import { listProjects, loadProject, type ProjectSourceOptions } from './project-registry';
import { checkFirstBranches } from './explorer-commands';

// This checks the first branch at each step. Use cli check-config for exhaustive checking.
export async function runSmokeChecker(projectName?: string, source: ProjectSourceOptions = {}) {
  if (!projectName) {
    console.log('Usage: simulant check <simulation-name>');
    console.log('Available projects:');
    for (const name of await listProjects(source)) console.log(`  - ${name}`);
    return;
  }

  const project = await loadProject(projectName, source);
  if (!project.checkFirstBranch) {
    console.error(`Error: Project "${projectName}" does not provide checkFirstBranch (simulations are .sim experiments registered with simProject)`);
    process.exit(1);
  }
  // The first branch, judged by the explorer's goal semantics.
  const code = checkFirstBranches(project, projectName, {}, line => console.log(line));
  if (code) process.exit(code);
}
