/**
 * Defines the types exported by a project file.
 *  */
import { Config, SystemInfo } from "../lib/system";
import { EditorSchema } from "./editor-schema";

 

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


export interface ProjectType<ConfigType extends Config<any, any, any, any, any, any>> {
  setup: (settings: any) => SystemInfo<any, any, any, any, any, any, ConfigType>;
  
  // Nouvelles fonctions modulaires (optionnelles)
  drawConfig?: (ctx: CanvasRenderingContext2D, config: ConfigType, model: SystemInfo<any, any, any, any, any, any, ConfigType>, options: ConfigRenderOptions) => void;
  getAgentsRenderInfo?: (config: ConfigType, model: SystemInfo<any, any, any, any, any, any, ConfigType>, centerX: number, centerY: number, radius: number) => AgentRenderInfo[];
  debugConfig?: (config: ConfigType, model: SystemInfo<any, any, any, any, any, any, ConfigType>) => string;
  
  // Pour le graphe de configuration (optionnel)
  executionStatusChecker?: (config: ConfigType, model: SystemInfo<any, any, any, any, any, any, ConfigType>, history: ConfigType[]) => 'success' | 'failure' | 'inProgress';

  getAlgorithmViewInfo?: (config: ConfigType) => {
        algorithm: any,
        procedures: any[],
        agentStates: Map<number, any>
    };

    editorSchema?: EditorSchema;

    shouldSkipConfig?: (configStr: string) => boolean;
}
