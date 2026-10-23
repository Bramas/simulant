/**
 * Defines the types exported by a project file.
 *  */
import type { EditorSchema } from "./editor-schema";

export type ExecutionStatus = 'success' | 'failure' | 'inProgress';

export type PredefinedSetting = {
  name: string;
  settings: any;
  path?: number[];
};

/** The algorithm's source as written: the lines of its definition, numbered as in its file. */
export type AlgorithmSource = {
  name: string;
  file?: string;
  lines: { number: number; text: string }[];
  /** The definitions the algorithm uses, as written (in file order). */
  definitions?: { name: string; file?: string; lines: { number: number; text: string }[] }[];
};

/** A declaration as written, with the doc comment and attributes before it, numbered as in its file. */
export type SourceExcerpt = {
  kind: 'experiment' | 'model' | 'space' | 'component' | 'scheduler' | 'sensor' | 'algorithm' | 'task' | 'goal' | 'definition';
  name: string;
  file?: string;
  lines: { number: number; text: string }[];
};

/** A fact about the model, with where it is written. */
/** A place in a declaration of the model view: the excerpt's `kind name`, and a line of it. */
export type SourceRef = { source: string; line?: number };

/** `code`: the value is written in `.sim` (shown as code). */
export type ModelFact = { label: string; value: string; code?: boolean; note?: string; details?: string[]; refs?: SourceRef[] };

/**
 * What the model view shows to compare an experiment with its paper: its semantics in words,
 * the round with what the adversary chooses in each phase, and the declarations as written.
 */
export type ModelDescription = {
  experiment: string;
  /** The first lines of the experiment's file (its `/-! ... -/` comment), when it has one. */
  about?: string;
  /** Short facts for the page header. */
  summary: string[];
  sections: { title: string; facts: ModelFact[] }[];
  /** The round, in order: what happens, which components act, what the adversary chooses. */
  round: { phase: string; what: string; by?: string[]; choices?: string[] }[];
  sources: SourceExcerpt[];
  /** Warnings about what the checks do not cover. */
  caveats: string[];
  /** The compiled experiment, for download. */
  ir: unknown;
  /** The generated Lean model, with the `.sim` sources of its parts; or why there is none. */
  lean?: LeanDescription;
  revision?: string;
};

/** A region of a Lean file: what it translates (`label`) and where that is written. */
export type LeanBlock = { line: number; endLine: number; label: string; refs: SourceRef[] };

export type LeanDescription =
  | {
    /** The module name `simulant lean` would use if the simulation had the experiment's name. */
    module: string;
    text: string;
    blocks: LeanBlock[];
    /** Library components the model imports: generated from the standard library, shared by every model. */
    library: { module: string; text: string; refs: SourceRef[] }[];
  }
  | { module: string; error: string };

/** A call to a definition during an agent's step: its arguments and result (as text), the line it returned from, its own calls. */
export type TraceCall = { fn: string; args: string[]; result: string; line?: number; calls: TraceCall[] };

/** Why an agent took its decision in the step that led to a configuration. */
export type StepExplanation = {
  /** The line of the statement that decided. */
  line?: number;
  frame: string;
  /** The values of the sensors that are not per location, as text. */
  view: Record<string, string>;
  /** The visible locations in the Look's order: the position behind each, whether it is the agent's own, its neighbors (as locations), per-location sensor values. */
  locations: { position: string; here: boolean; neighbors: number[]; sensors: Record<string, string> }[];
  /** Where the agent moved: `stay`, or the location and the position behind it. */
  move: string;
  calls: TraceCall[];
};

/** A configuration as plain values, for the state inspector. */
export type InspectedState = {
  /** The world's fields (component state shared by all agents). */
  world: Record<string, unknown>;
  /** The experiment's parameters for this run. */
  params: Record<string, unknown>;
  agents: {
    id: number;
    name: string;
    color: string;
    /** `correct`: no flag raised; `faulty`: a visible flag (crashed...); `hidden`: gone from the configuration (destroyed...). */
    status: 'correct' | 'faulty' | 'hidden';
    /** Position, line, flags, component fields, public state and memory. */
    value: Record<string, unknown>;
  }[];
};

/** Where an agent is in the algorithm's source. */
export interface AgentExecutionState {
  agentId: string;
  /** The source line of the agent's program counter: the statement of its last round (not in `lines` while it idles). */
  line: number;
  /** The lines of the procedure calls the agent is inside, outermost first. */
  calls?: number[];
  /** The agent's index in the configuration. */
  index?: number;
  /** Why it took its decision in the last step (when it was activated). */
  explanation?: StepExplanation;
  color: string;
}

// Types for rendering
export type RenderPosition = { x: number; y: number };
export type AgentRenderInfo = {
    position: RenderPosition;
    isCrashed: boolean;
    agentId: number;
    nodeIndex: number;
};

export type ConfigRenderOptions = {
    centerX?: number;
    centerY?: number;
    radius?: number;
    nodeRadius?: number;
    agentRadius?: number;
    showNodeLabels?: boolean;
    showDebugText?: boolean;
    onAgentClick?: (agentInfo: AgentRenderInfo) => void;
    /** The page's colors: draw on `background`, with `foreground` and `muted` for marks and text. */
    theme?: RenderTheme;
};

/** The colors of the surface a configuration is drawn on, in the page's current theme. */
export type RenderTheme = {
    dark: boolean;
    background: string;
    foreground: string;
    muted: string;
    /** Edges and outlines. */
    line: string;
    accent: string;
    danger: string;
};


/** What the UI navigates: a tree of executions, whose paths start with the initial configuration's index. */
export interface ExecutionLike<ConfigType = any> {
  get(path: number[]): ConfigType;
  getChildrenCount(path: number[]): number;
  getSiblingCount(path: number[]): number;
  getRandomChildIndex(path: number[]): number;
  /** The witness of the step that leads to `path`. */
  getEdgeLabel?(path: number[]): string;
  /** The choices of the step that leads to `path`: where each was made, the option taken (0: the first) and its label. */
  getEdgeWitness?(path: number[]): { site: string; index: number; label: string }[];
  /** Why each agent (by index in the configuration at `path`) took its decision in the step that led there. */
  explain?(path: number[]): (StepExplanation | undefined)[];
}

/** A change of a project's sources during development (plan, Section 6.7). */
export type ProjectUpdate =
  /** The experiment changed: restart at the initial configuration, with `adjust`ed settings. */
  | { kind: 'replaced'; revision: string; adjust(settings: any): { settings: any; notes: string[] } }
  /** The sources do not compile: keep the last good view, marked out of date. */
  | { kind: 'failed'; revision: string; diagnostics: string[] }
  /** Only the drawing (or the algorithm view) changed: redraw, keeping the execution. */
  | { kind: 'redraw' };

/** A counterexample of an explorer check: with `settings`, `path` replays in the simulator. */
export type CheckTrace = {
  kind: 'failure' | 'lasso';
  settings: any;
  path: number[];
  /** For a lasso, the index of the configuration the last step returns to (up to symmetry). */
  cycleStart?: number;
  steps: { label: string; verdict: ExecutionStatus }[];
};

export type CheckReport = {
  status: 'success' | 'failure' | 'incomplete';
  reason: string;
  stats: { states: number; expanded: number; edges: number; maxDepth: number; group: number };
  trace?: CheckTrace;
  /** The revision of the sources checked. */
  revision?: string;
  /** For several settings: how many, and how many state graphs were explored. */
  settings?: number;
  graphs?: number;
};

export type CheckOptions = {
  maxDepth?: number;
  maxStates?: number;
  /** Separate state graphs per setting instead of one per ring size (check-all). */
  perSetting?: boolean;
  /** At most this many settings (check-all). */
  maxConfigs?: number;
  /** Cancels a check in progress (watch mode). */
  signal?: AbortSignal;
};

/** A state graph, for drawing (`generate-config-graph`); `config` is what `debugConfig` takes. */
export type StateGraphReport = {
  states: { id: number; config: any; verdict: ExecutionStatus; depth: number }[];
  edges: { from: number; to: number; label: string }[];
  complete: boolean;
};

export interface ProjectType<ConfigType = any, ModelType = any> {
  setup: (settings: any) => ModelType;
  /** The tree of executions of the model, which the UI navigates. */
  execute: (model: ModelType) => ExecutionLike<ConfigType>;
  /** Accepts settings of older versions (shared links, saved settings), renaming their parameters. */
  normalizeSettings?: (settings: any) => any;
  /** Advisory warnings about initial settings; execution remains available. */
  settingsWarnings?: (settings: any) => string[];
  /** Development updates of the project's sources; returns an unsubscribe function. */
  subscribe?: (listener: (update: ProjectUpdate) => void) => () => void;
  /** The revision of the sources the project runs (its graphs and verdicts belong to it). */
  revision?: () => string;
  /**
   * Checks on the explorer (plan, Phase 6), used by the CLI: every admissible execution of one
   * setting, of every generated setting, or the first branch only.
   */
  check?: (settings: any, options?: CheckOptions) => Promise<CheckReport>;
  checkAll?: (options?: CheckOptions, onProgress?: (done: number, total: number) => void) => Promise<CheckReport>;
  checkFirstBranch?: (settings: any, options?: CheckOptions) => CheckReport;
  stateGraph?: (settings: any, options?: CheckOptions) => StateGraphReport;
  /** The compiled experiment (IR, `packages/lang/src/ir.ts`), for Lean generation. */
  experiment?: () => { name: string; ir: unknown };

  drawConfig?: (ctx: CanvasRenderingContext2D, config: ConfigType, model: ModelType, options: ConfigRenderOptions) => void;
  getAgentsRenderInfo?: (config: ConfigType, model: ModelType, centerX: number, centerY: number, radius: number) => AgentRenderInfo[];
  debugConfig?: (config: ConfigType, model: ModelType) => string;

  // For the configuration graph.
  executionStatusChecker?: (config: ConfigType, model: ModelType, history: ConfigType[]) => ExecutionStatus;
  settingsGenerator?: () => Generator<any>;

  getAlgorithmViewInfo?: (config: ConfigType) => { source: AlgorithmSource; agents: AgentExecutionState[] };
  /**
   * The task's verdict on this configuration alone, and the goal it is judged by. Unlike
   * `executionStatusChecker`, `success` stays `success` under every goal (under `eventuallyAlways`
   * the execution must then keep it; under `safety` it means no failure).
   */
  verdict?: (config: ConfigType, model: ModelType) => { verdict: ExecutionStatus; goal: 'eventually' | 'eventuallyAlways' | 'safety' };
  /** A key identifying the whole configuration (memory included): equal keys, equal states. */
  stateKey?: (config: ConfigType, model: ModelType) => string;
  /** The configuration as plain values, for the state inspector. */
  inspect?: (config: ConfigType, model: ModelType) => InspectedState;
  /** The model and experiment in words and as written, for the model view. */
  describe?: () => ModelDescription;

    editorSchema?: EditorSchema;
}
