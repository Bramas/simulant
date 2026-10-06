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
import { listProjects as listAvailableProjects, loadProject as loadNamedProject, type ProjectSourceOptions } from './project-registry';
import { runSmokeChecker } from './smoke-checker';

// Generic TikZ export for configuration graph (works for all projects)
function toTikz(nodes: any[], debugConfig: (config: any, model: any) => string, model: any): string {
  const lines: string[] = [];
  
  // TikZ header
  lines.push('\\begin{tikzpicture}[');
  lines.push('  node/.style={circle, draw, minimum size=1cm},');
  lines.push('  success/.style={node, fill=green!20},');
  lines.push('  failure/.style={node, fill=red!20},');
  lines.push('  inProgress/.style={node, fill=orange!20}');
  lines.push(']');
  lines.push('');
  
  // Calculate positions
  const nodesPerDepth = new Map<number, number>();
  const nodePositions = new Map<string, { x: number; y: number }>();
  const nodesByPath = new Map(nodes.map(node => [node.path.join('-'), node]));
  
  for (const node of nodes) {
    const depth = node.depth;
    const countAtDepth = nodesPerDepth.get(depth) || 0;
    nodesPerDepth.set(depth, countAtDepth + 1);
    
    const x = countAtDepth * 3;
    const y = -depth * 2;
    
    nodePositions.set(node.path.join('-'), { x, y });
  }
  
  // Draw nodes
  for (const node of nodes) {
    const pos = nodePositions.get(node.path.join('-'))!;
    const style = node.status === 'success' ? 'success' : 
                 node.status === 'failure' ? 'failure' : 'inProgress';
    
    const configStr = debugConfig(node.config, model);
    const label = `[${node.path.join(',')}]`;
    
    lines.push(`  \\node[${style}] (n${node.path.join('_')}) at (${pos.x},${pos.y}) {`);
    lines.push(`    \\begin{tabular}{c}`);
    lines.push(`      \\tiny ${label} \\\\`);
    lines.push(`      \\texttt{\\tiny ${configStr}}`);
    lines.push(`    \\end{tabular}`);
    lines.push(`  };`);
  }
  
  lines.push('');
  
  // Draw edges
  for (const node of nodes) {
    if (node.path.length === 1) continue;
    
    const parentPath = node.path.slice(0, -1);
    const parent = nodesByPath.get(parentPath.join('-'));
    
    if (parent) {
      lines.push(`  \\draw[->] (n${parent.path.join('_')}) -- (n${node.path.join('_')});`);
    }
  }
  
  lines.push('\\end{tikzpicture}');
  
  return lines.join('\n');
}

const program = new Command();
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

program
  .name('simulant')
  .description('CLI tool for testing and generating artifacts from mobile entities projects')
  .version(metadata.version)
  .option('--root <directory>', 'Project or workspace directory (default: current directory)')
  .option('--registry <file>', 'Project registry module, relative to --root or the current directory');

const projectSource = () => program.opts<ProjectSourceOptions>();
const loadProject = (name: string) => loadNamedProject(name, projectSource());
const listProjects = () => listAvailableProjects(projectSource());

// Command: generate-config-graph
program
  .command('generate-config-graph')
  .description('Generate a configuration graph in TikZ format')
  .requiredOption('-p, --project <name>', 'Project name (e.g., gathering-on-rings)')
  .requiredOption('-s, --settings <json>', 'Settings as JSON string')
  .option('-d, --max-depth <number>', 'Maximum depth to explore', depthArgument, 10)
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action(async (options) => {
    const projectName = options.project as string;
    
    const project = await loadProject(projectName);
    
    // Check if project has required exports
    if (!project.setup) {
      console.error(`Error: Project "${projectName}" does not export setup function`);
      process.exit(1);
    }
    
    if (!project.executionStatusChecker) {
      console.error(`Error: Project "${projectName}" does not export executionStatusChecker`);
      process.exit(1);
    }
    
    if (!project.debugConfig) {
      console.error(`Error: Project "${projectName}" does not export debugConfig function`);
      process.exit(1);
    }
    
    // Parse settings
    let settings;
    try {
      settings = JSON.parse(options.settings);
    } catch (e) {
      console.error(`Error: Invalid JSON in settings: ${e}`);
      process.exit(1);
    }
    
    console.log(`Generating config graph for ${projectName}...`);
    console.log(`Settings: ${JSON.stringify(settings, null, 2)}`);
    console.log(`Max depth: ${options.maxDepth}`);
    
    // Import execute function
    const { execute } = await import('@bramas/simulant-core/lib/system');
    
    // Generate the graph
    try {
      const model = project.setup(settings);
      const execution = execute(model as any);
      
      const maxDepth = options.maxDepth as number;
      const nodes: any[] = [];
      const queue: number[][] = [[0]];
      const visited = new Set<string>();
      
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const path = queue[cursor];
        const pathKey = path.join('-');
        
        if (visited.has(pathKey)) continue;
        visited.add(pathKey);
        
        const config = (execution as any).get(path);
        
        // Build history
        const history: any[] = [];
        for (let i = 1; i <= path.length; i++) {
          history.push((execution as any).get(path.slice(0, i)));
        }
        
        const status = project.executionStatusChecker(config, model as any, history);
        const depth = path.length - 1;
        const childrenCount = depth < maxDepth && status === 'inProgress'
          ? execution.getChildrenCount(path) : 0;
        
        nodes.push({
          path: [...path],
          status,
          depth,
          childrenCount,
          config
        });
        
        if (depth < maxDepth && status === 'inProgress') {
          for (let i = 0; i < childrenCount; i++) {
            queue.push([...path, i]);
          }
        }
      }
      
      console.log(`Graph generated with ${nodes.length} nodes`);
      
      // Generate TikZ using the generic function
      const tikz = toTikz(nodes, project.debugConfig, model);
      
      // Output
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, tikz, 'utf-8');
        console.log(`TikZ output written to ${options.output}`);
      } else {
        console.log('\n=== TikZ Output ===\n');
        console.log(tikz);
      }
      
    } catch (e) {
      console.error(`Error generating graph: ${e}`);
      if (e instanceof Error) {
        console.error(e.stack);
      }
      process.exit(1);
    }
  });

// Command: check-config
program
  .command('check-config')
  .description('Check all possible execution paths from a configuration')
  .requiredOption('-p, --project <name>', 'Project name')
  .requiredOption('-s, --settings <json>', 'Settings as JSON string')
  .option('-d, --max-depth <number>', 'Maximum depth to explore', depthArgument, 50)
  .action(async (options) => {
    const projectName = options.project as string;
    
    const project = await loadProject(projectName);
    
    // Check if project has required exports
    if (!project.setup) {
      console.error(`Error: Project "${projectName}" does not export setup function`);
      process.exit(1);
    }
    
    if (!project.executionStatusChecker) {
      console.error(`Error: Project "${projectName}" does not export executionStatusChecker`);
      process.exit(1);
    }
    
    let settings;
    try {
      settings = JSON.parse(options.settings);
    } catch (e) {
      console.error(`Error: Invalid JSON in settings: ${e}`);
      process.exit(1);
    }
    
    console.log(`Checking all execution paths for ${projectName}...`);
    console.log(`Settings: ${JSON.stringify(settings, null, 2)}`);
    console.log(`Max depth: ${options.maxDepth}`);
    console.log('');
    
    // Check if initial configuration should be skipped
    if (project.shouldSkipConfig && settings.initialConfig) {
      const shouldSkip = project.shouldSkipConfig(settings.initialConfig);
      if (shouldSkip) {
        console.error(`Error: Initial configuration "${settings.initialConfig}" is not valid`);
        console.error('The configuration was rejected by shouldSkipConfig');
        process.exit(1);
      }
    }
    
    const { execute } = await import('@bramas/simulant-core/lib/system');
    
    try {
      const model = project.setup(settings);
      const execution = execute(model as any);
      
      const maxDepth = options.maxDepth as number;
      const queue: number[][] = [[0]];
      const visited = new Set<string>();
      
      let pathsExplored = 0;
      
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const path = queue[cursor];
        const pathKey = path.join('-');
        
        if (visited.has(pathKey)) continue;
        visited.add(pathKey);
        
        pathsExplored++;
        
        const config = (execution as any).get(path);
        
        // Build history
        const history: any[] = [];
        for (let i = 1; i <= path.length; i++) {
          history.push((execution as any).get(path.slice(0, i)));
        }
        
        const status = project.executionStatusChecker(config, model as any, history);
        const depth = path.length - 1;
        
        if (status === 'failure') {
          console.log(`✗ Failed path found at depth ${depth}: [${path.join(', ')}]`);
          console.log('');
          console.log('=== Result ===');
          console.log(`Paths explored: ${pathsExplored}`);
          console.log('❌ Algorithm has failing execution paths!');
          process.exit(1);
        } else if (depth >= maxDepth && status === 'inProgress') {
          console.log(`⚠ Max depth reached at: [${path.join(', ')}]`);
          console.log('');
          console.log('=== Result ===');
          console.log(`Paths explored: ${pathsExplored}`);
          console.log('⚠️  Max depth reached - unable to verify all paths');
          process.exit(2);
        } else if (status === 'inProgress') {
          // Continue exploring
          const childrenCount = (execution as any).getChildrenCount(path);
          if (childrenCount === 0) {
            console.log(`Unresolved terminal path: [${path.join(', ')}]`);
            process.exit(2);
          }
          for (let i = 0; i < childrenCount; i++) {
            queue.push([...path, i]);
          }
        }
        // If status is 'success', we just continue to the next path
      }
      
      // If we get here, all paths succeeded
      console.log('');
      console.log('=== Result ===');
      console.log(`Paths explored: ${pathsExplored}`);
      console.log('✅ All execution paths succeeded!');
      process.exit(0);
      
    } catch (e) {
      console.error(`Error checking config: ${e}`);
      if (e instanceof Error) {
        console.error(e.stack);
      }
      process.exit(1);
    }
  });

// Command: check-all
program
  .command('check-all')
  .description('Check all configurations generated by settingsGenerator')
  .requiredOption('-p, --project <name>', 'Project name')
  .option('-d, --max-depth <number>', 'Maximum depth to explore per configuration', depthArgument, 50)
  .option('--max-configs <number>', 'Maximum number of configurations to test (default: all)', countArgument)
  .action(async (options) => {
    const projectName = options.project as string;
    
    const project = await loadProject(projectName);
    
    // Check if project has required exports
    if (!project.setup) {
      console.error(`Error: Project "${projectName}" does not export setup function`);
      process.exit(1);
    }
    
    if (!project.executionStatusChecker) {
      console.error(`Error: Project "${projectName}" does not export executionStatusChecker`);
      process.exit(1);
    }
    
    if (!project.settingsGenerator) {
      console.error(`Error: Project "${projectName}" does not export settingsGenerator`);
      process.exit(1);
    }
    
    console.log(`Testing all configurations for ${projectName}...`);
    console.log(`Max depth per config: ${options.maxDepth}`);
    console.log('');
    
    const { execute } = await import('@bramas/simulant-core/lib/system');
    const maxDepth = options.maxDepth as number;
    const maxConfigs = options.maxConfigs ? options.maxConfigs as number : Infinity;
    
    let configCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    
    try {
      for (const settings of project.settingsGenerator()) {
        if (configCount >= maxConfigs) {
          console.log(`\nReached maximum number of configurations (${maxConfigs})`);
          break;
        }
        
        // Check if configuration should be skipped
        if (project.shouldSkipConfig && settings.initialConfig) {
          const shouldSkip = project.shouldSkipConfig(settings.initialConfig);
          if (shouldSkip) {
            continue; // Skip this configuration
          }
        }
        
        configCount++;
        process.stdout.write(`\rTesting config ${configCount}: ${JSON.stringify(settings).substring(0, 60)}...`);
        
        const model = project.setup(settings);
        const execution = execute(model as any);
        
        const queue: number[][] = [[0]];
        const visited = new Set<string>();
        
        let pathsExplored = 0;
        let foundFailure = false;
        let failurePath: number[] | null = null;
        let inconclusive = false;
        let unresolvedPath: number[] | null = null;
        
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const path = queue[cursor];
          const pathKey = path.join('-');
          
          if (visited.has(pathKey)) continue;
          visited.add(pathKey);
          
          pathsExplored++;
          
          const config = (execution as any).get(path);
          
          // Build history
          const history: any[] = [];
          for (let i = 1; i <= path.length; i++) {
            history.push((execution as any).get(path.slice(0, i)));
          }
          
          const status = project.executionStatusChecker(config, model as any, history);
          const depth = path.length - 1;
          
          if (status === 'failure') {
            foundFailure = true;
            failurePath = path;
            break;
          } else if (depth >= maxDepth && status === 'inProgress') {
            inconclusive = true;
            unresolvedPath = path;
            break;
          } else if (status === 'inProgress') {
            const childrenCount = (execution as any).getChildrenCount(path);
            if (childrenCount === 0) {
              inconclusive = true;
              unresolvedPath = path;
              break;
            }
            for (let i = 0; i < childrenCount; i++) {
              queue.push([...path, i]);
            }
          }
        }
        
        if (foundFailure) {
          console.log('\n\n❌ FAILURE FOUND!');
          console.log('================');
          console.log(`Configuration #${configCount}`);
          console.log(`Settings: ${JSON.stringify(settings, null, 2)}`);
          console.log(`Failed at path: [${failurePath!.join(', ')}]`);
          console.log(`Paths explored before failure: ${pathsExplored}`);
          console.log('');
          
          // Show execution trace
          console.log('Execution trace:');
          for (let i = 1; i <= failurePath!.length; i++) {
            const tracePath = failurePath!.slice(0, i);
            const traceConfig = (execution as any).get(tracePath);
            const configStr = project.debugConfig ? project.debugConfig(traceConfig, model) : JSON.stringify(traceConfig);
            console.log(`  Step ${i}: [${tracePath.join(',')}] -> ${configStr}`);
          }
          
          console.log('');
          console.log('=== Summary ===');
          console.log(`Tested ${configCount} configurations`);
          console.log(`Passed: ${passedCount}`);
          console.log(`Failed: ${failedCount + 1}`);
          process.exit(1);
        } else if (inconclusive) {
          console.log('\n\n⚠️  EXPLORATION INCOMPLETE!');
          console.log('=====================');
          console.log(`Configuration #${configCount}`);
          console.log(`Settings: ${JSON.stringify(settings, null, 2)}`);
          console.log(`Unresolved path: [${unresolvedPath!.join(', ')}]`);
          console.log(`Paths explored: ${pathsExplored}`);
          console.log('');
          console.log('=== Summary ===');
          console.log(`Tested ${configCount} configurations`);
          console.log(`Passed: ${passedCount}`);
          process.exit(2);
        } else {
          passedCount++;
        }
      }
      
      console.log('\n\n✅ ALL CONFIGURATIONS PASSED!');
      console.log('============================');
      console.log(`Total configurations tested: ${configCount}`);
      console.log(`All passed: ${passedCount}`);
      process.exit(0);
      
    } catch (e) {
      console.error(`\n\nError during testing: ${e}`);
      if (e instanceof Error) {
        console.error(e.stack);
      }
      process.exit(1);
    }
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
  .action(async (name, options) => {
    await runSmokeChecker(options.project ?? name, projectSource());
  });

program.parseAsync().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
