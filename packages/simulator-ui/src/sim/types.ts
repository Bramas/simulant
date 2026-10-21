/** Types shared by renderers of new-engine experiments (plan, Section 6.5). */
import type { AgentRenderInfo, ConfigRenderOptions } from '@bramas/simulant-core/types/project';
import type { Snapshot } from './snapshot';

/** What a renderer knows of the experiment, besides the snapshot. */
export type ModelInfo = {
  experiment: string;
  algorithm: string;
  /** The number of vertices of a finite space (0 for an infinite one). */
  size: number;
  /** The space's name (`Graphs.Cycle`, `Graphs.Line`, ...). */
  space: string;
  params: Record<string, unknown>;
  components: string[];
};

/** Placement given by the viewer: draw within these bounds, do not clear the canvas. */
export type RenderOptions = ConfigRenderOptions;

export type Point = { x: number; y: number };

export type Layout = {
  center: Point;
  radius: number;
  /** Where a vertex is drawn (a vertex is a number on cycles, lines and stars). */
  nodePosition(node: any): Point;
  /** Where each agent was drawn, for hit testing. */
  agents: AgentRenderInfo[];
};

export type DrawFunction = (ctx: CanvasRenderingContext2D, snapshot: Snapshot, model: ModelInfo, options: RenderOptions) => Layout | void;
