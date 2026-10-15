import type { ExecutionStatus, ProjectType } from '../types/project';

export type GraphNode = {
  path: number[];
  /**
   * The task's verdict on the configuration (the project's `verdict` when it has one): a
   * `success` under a goal such as `eventuallyAlways` is shown, though the execution goes on.
   */
  status: ExecutionStatus;
  depth: number;
  /** Children explored within the depth limit; terminal nodes have none. */
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
  /** The revision of the project the page shows: a worker running another one refuses (plan, Section 6.7). */
  revision?: string;
};

export type GraphStats = {
  totalNodes: number;
  successNodes: number;
  failureNodes: number;
  inProgressNodes: number;
  maxDepthReached: number;
};

export type WorkerResponse = {
  type: 'progress' | 'complete' | 'error';
  nodes?: GraphNode[];
  stats?: GraphStats;
  error?: string;
  /** The revision of the project the graph was generated from. */
  revision?: string;
};

/** Generate a bounded graph, setting up the model once for the whole traversal. */
export function generateConfigGraph(
  projects: Record<string, ProjectType<any, any>>,
  request: WorkerRequest,
  onProgress?: (response: WorkerResponse) => void,
): WorkerResponse {
  const { projectName, settings, maxDepth, horizontalSpacing, verticalSpacing } = request;
  const project = projects[projectName];
  if (!project) throw new Error(`Unknown project: ${projectName}`);
  if (!project.executionStatusChecker) throw new Error(`Project ${projectName} has no execution status checker`);
  if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new Error('Maximum depth must be a non-negative integer');
  const revision = project.revision?.();
  if (request.revision !== undefined && revision !== undefined && request.revision !== revision) {
    throw new Error(`The worker runs revision ${revision} of ${projectName}, the page revision ${request.revision}: generate the graph again`);
  }

  const model = project.setup(settings);
  const execution = project.execute(model);
  const nodes: GraphNode[] = [];
  const queue: number[][] = [[0]];
  const visited = new Set<string>();
  const nodesPerDepth = new Map<number, number>();
  const stats: GraphStats = {
    totalNodes: 0, successNodes: 0, failureNodes: 0, inProgressNodes: 0, maxDepthReached: 0,
  };

  // An index avoids shifting the remaining queue after every node.
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = queue[cursor];
    const config = execution.get(path);
    const configKey = project.debugConfig?.(config, model);
    // A repeated state is not expanded again; the debug string may leave out part of the state.
    const stateKey = project.stateKey?.(config, model) ?? configKey;
    const isDuplicate = stateKey !== undefined && visited.has(stateKey);
    if (stateKey !== undefined) visited.add(stateKey);

    const history = path.map((_, index) => execution.get(path.slice(0, index + 1)));
    // Expansion follows the checker; the node shows the configuration's own verdict.
    const status = project.executionStatusChecker(config, model, history);
    const shown = project.verdict?.(config, model).verdict ?? status;
    const depth = path.length - 1;
    // Repeated and depth-limited states stay in progress: repetition is not proof of success.
    const childrenCount = depth < maxDepth && status === 'inProgress' && !isDuplicate
      ? execution.getChildrenCount(path) : 0;
    const depthCount = nodesPerDepth.get(depth) ?? 0;
    nodesPerDepth.set(depth, depthCount + 1);
    nodes.push({ path, status: shown, depth, childrenCount, configKey,
      x: 100 + depthCount * horizontalSpacing, y: 100 + depth * verticalSpacing });

    stats.totalNodes++;
    stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
    if (shown === 'success') stats.successNodes++;
    else if (shown === 'failure') stats.failureNodes++;
    else stats.inProgressNodes++;

    if (status === 'failure') break;
    for (let child = 0; child < childrenCount; child++) queue.push([...path, child]);
    if (onProgress && nodes.length % 50 === 0) {
      onProgress({ type: 'progress', nodes: [...nodes], stats: { ...stats }, revision });
    }
  }

  return { type: 'complete', nodes, stats, revision };
}

/** Register this handler in a project worker using its own project registry. */
export function handleGraphRequest(
  projects: Record<string, ProjectType<any, any>>,
  request: WorkerRequest,
  postMessage: (response: WorkerResponse) => void,
) {
  if (request.type !== 'generate') return;
  try {
    postMessage(generateConfigGraph(projects, request, postMessage));
  } catch (error) {
    postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}
