/**
 * The default renderer: by the experiment's space, a cycle (`drawRing`), the infinite line
 * (`drawLine`) or another finite graph (`drawGraph`). A dynamic space is drawn as its base graph;
 * the edges missing in a step are named by the step's label.
 */
import type { Snapshot } from '../sim/snapshot';
import type { Layout, ModelInfo, RenderOptions } from '../sim/types';
import { drawGraph, graphLayout } from './graph';
import { drawLine, lineLayout } from './line';
import { drawRing, ringLayout } from './ring';

function kind(snapshot: Snapshot): 'ring' | 'line' | 'graph' {
  const { space } = snapshot.system;
  if (!space.finite) return 'line';
  return space.name === 'Graphs.Cycle' ? 'ring' : 'graph';
}

export function spaceLayout(snapshot: Snapshot, options: RenderOptions = {}): Layout {
  return { ring: ringLayout, line: lineLayout, graph: graphLayout }[kind(snapshot)](snapshot, options);
}

export function drawSpace(ctx: CanvasRenderingContext2D, snapshot: Snapshot, model: ModelInfo, options: RenderOptions = {}): Layout {
  return { ring: drawRing, line: drawLine, graph: drawGraph }[kind(snapshot)](ctx, snapshot, model, options);
}
