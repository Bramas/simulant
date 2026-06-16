// Web Worker pour générer le graphe de configurations
// Communique via postMessage avec le thread principal

// Mock minimal de window pour SolidJS (qui vérifie son existence)
// @ts-ignore
if (typeof window === 'undefined') {
  // @ts-ignore
  globalThis.window = globalThis;
}

import { execute } from '@mobile-entities/core/lib/system';
import { projects as Projects } from '../../../projects';


export type GraphNode = {
  path: number[];
  status: 'success' | 'failure' | 'inProgress';
  depth: number;
  childrenCount: number;
  x?: number;
  y?: number;
  configKey?: string;
};

export type WorkerRequest = {
  type: 'generate';
  maxDepth: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  settings: any;
  projectName: string;
};

export type WorkerResponse = {
  type: 'progress' | 'complete' | 'error';
  nodes?: GraphNode[];
  stats?: {
    totalNodes: number;
    successNodes: number;
    failureNodes: number;
    inProgressNodes: number;
    maxDepthReached: number;
  };
  error?: string;
};

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== 'generate') return;

  const { maxDepth, horizontalSpacing, verticalSpacing, settings, projectName } = e.data;

  try {
    // Get project
    const project = Projects[projectName];
    if (!project) {
      throw new Error(`Unknown project: ${projectName}`);
    }

    const model = project.setup(settings);
    const execution = execute(model as any);

    const nodes: GraphNode[] = [];
    const queue: number[][] = [[0]];
    const visited = new Set<string>();

    let totalSuccess = 0;
    let totalFailure = 0;
    let totalInProgress = 0;
    let maxReached = 0;

    const nodesPerDepth = new Map<number, number>();

    while (queue.length > 0) {
      const path = queue.shift()!;
      
      const config = execution.get(path);
      const model = project.model ? project.model : project.setup(settings);

      // Get configuration string for cycle detection
      const configKey = (project as any).debugConfig ? (project as any).debugConfig(config, model) : path.join('-');
      const isDuplicate = visited.has(configKey);
      visited.add(configKey);

      const history: any[] = [];
      for (let i = 1; i <= path.length; i++) {
        history.push(execution.get(path.slice(0, i)));
      }

      let status = project.executionStatusChecker(config, model, history);
      
      // If this is a duplicate state that was still in progress, we can mark it as a "loop" (success)
      // because it means we reached a known safe state.
      if (isDuplicate && status === 'inProgress') {
        // @ts-ignore - 'loop' is not in the formal union but UI can handle it or we map to success
        status = 'success';
      }

      const childrenCount = execution.getChildrenCount(path);
      const depth = path.length - 1;
      maxReached = Math.max(maxReached, depth);

      const depthCount = nodesPerDepth.get(depth) || 0;
      nodesPerDepth.set(depth, depthCount + 1);

      const x = 100 + depthCount * horizontalSpacing;
      const y = 100 + depth * verticalSpacing;

      nodes.push({
        path: [...path],
        status,
        depth,
        childrenCount,
        x,
        y,
        configKey
      });

      if (status === 'success') {
        totalSuccess++;
      } else if (status === 'failure') {
        totalFailure++;
        // Stop immediately on failure
        break;
      } else {
        totalInProgress++;
      }

      // ONLY add children if it's NOT a duplicate and NOT finished
      if (depth < maxDepth && status === 'inProgress' && !isDuplicate) {
        for (let i = 0; i < childrenCount; i++) {
          queue.push([...path, i]);
        }
      }

      // Send progress update every 50 nodes
      if (nodes.length % 50 === 0) {
        const response: WorkerResponse = {
          type: 'progress',
          nodes: [...nodes],
          stats: {
            totalNodes: nodes.length,
            successNodes: totalSuccess,
            failureNodes: totalFailure,
            inProgressNodes: totalInProgress,
            maxDepthReached: maxReached
          }
        };
        self.postMessage(response);
      }
    }

    // Send final result
    const response: WorkerResponse = {
      type: 'complete',
      nodes,
      stats: {
        totalNodes: nodes.length,
        successNodes: totalSuccess,
        failureNodes: totalFailure,
        inProgressNodes: totalInProgress,
        maxDepthReached: maxReached
      }
    };
    self.postMessage(response);

  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(response);
  }
});
