/** Types shared by renderers of new-engine experiments (plan, Section 6.5). */
import type { AgentRenderInfo, ConfigRenderOptions } from '../../../core/src/types/project';
import type { Snapshot } from './snapshot';

/** What a renderer knows of the experiment, besides the snapshot. */
export type ModelInfo = {
  experiment: string;
  algorithm: string;
  /** Ring size. */
  size: number;
  params: Record<string, unknown>;
  components: string[];
};

/** Placement given by the viewer: draw within these bounds, do not clear the canvas. */
export type RenderOptions = ConfigRenderOptions;

export type Point = { x: number; y: number };

export type Layout = {
  center: Point;
  radius: number;
  nodePosition(node: number): Point;
  /** Where each agent was drawn, for hit testing. */
  agents: AgentRenderInfo[];
};

export type DrawFunction = (ctx: CanvasRenderingContext2D, snapshot: Snapshot, model: ModelInfo, options: RenderOptions) => Layout | void;
