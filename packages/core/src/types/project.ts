/**
 * Defines the types exported by a project file.
 *  */
import type { Config, SystemInfo } from "../lib/system";
import type { EditorSchema } from "./editor-schema";
import type { AlgorithmStructure } from "./algorithm-structure";

export type ExecutionStatus = 'success' | 'failure' | 'inProgress';

export type PredefinedSetting = {
  name: string;
  settings: any;
  path?: number[];
};

export interface AgentExecutionState {
  agentId: string;
  currentLine: number;
  color: string;
  currentAlgorithm: string;
  stateDescription?: string;
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
};


export interface ProjectType<
  ConfigType extends Config<any, any, any, any, any, any>,
  ModelType extends SystemInfo<any, any, any, any, any, any, ConfigType> = SystemInfo<any, any, any, any, any, any, ConfigType>,
> {
  setup: (settings: any) => ModelType;
  
  // Nouvelles fonctions modulaires (optionnelles)
  drawConfig?: (ctx: CanvasRenderingContext2D, config: ConfigType, model: ModelType, options: ConfigRenderOptions) => void;
  getAgentsRenderInfo?: (config: ConfigType, model: ModelType, centerX: number, centerY: number, radius: number) => AgentRenderInfo[];
  debugConfig?: (config: ConfigType, model: ModelType) => string;
  
  // Pour le graphe de configuration (optionnel)
  executionStatusChecker?: (config: ConfigType, model: ModelType, history: ConfigType[]) => ExecutionStatus;
  settingsGenerator?: () => Generator<any>;
  maxIterationsPerExecution?: number;

  getAlgorithmViewInfo?: (config: ConfigType) => {
        algorithm: AlgorithmStructure,
        procedures: AlgorithmStructure[],
        agentStates: AgentExecutionState[]
    };

    editorSchema?: EditorSchema;

    shouldSkipConfig?: (configStr: string) => boolean;
}
