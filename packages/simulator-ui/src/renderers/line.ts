/**
 * The default renderer of the infinite line (`Graphs.Line`): the window of positions that
 * covers the agents and the positions the world and the parameters name (a black hole's site,
 * a crash node), with one empty node on each side. Agents sharing a position are stacked above
 * it. Long windows draw every `stride`-th empty node, so that large gaps keep their scale.
 */
import type { Type } from '@bramas/simulant-lang/ir';
import type { Snapshot } from '../sim/snapshot';
import type { Layout, ModelInfo, Point, RenderOptions } from '../sim/types';
import { drawAgentDiscs, drawComponentMarks, markColors, stackIndices } from './marks';

/** The integers among the values of type `t` (positions of the line, possibly in lists). */
function positionsIn(t: Type, v: unknown): number[] {
  if (v === null || v === undefined) return [];
  if (t.k === 'pos') return typeof v === 'number' ? [v] : [];
  if ((t.k === 'list' || t.k === 'multiset') && Array.isArray(v)) return v.flatMap(x => positionsIn(t.of, x));
  if (t.k === 'option') return positionsIn(t.of, v);
  return [];
}

/** The positions a drawing of the line must show. */
export function lineWindow(snapshot: Snapshot): { low: number; high: number } {
  const { system } = snapshot;
  const shown = [
    ...snapshot.agents.map(a => a.pos as number),
    ...system.lay.world.flatMap(f => positionsIn(f.type, snapshot.world[f.name])),
    ...system.exp.params.flatMap(p => positionsIn(p.type, system.params[p.name])),
  ];
  const low = Math.min(...shown) - 1;
  const high = Math.max(...shown, low + 4) + 1;
  return { low, high };
}

export function lineLayout(snapshot: Snapshot, options: RenderOptions = {}): Layout {
  const { centerX = 150, centerY = 150, radius = 100, agentRadius = 7 } = options;
  const { low, high } = lineWindow(snapshot);
  const step = 2 * radius / (high - low);
  const at = (v: number): Point => ({ x: centerX - radius + (v - low) * step, y: centerY });
  const stack = stackIndices(snapshot);
  const agents = snapshot.agents.map((a, i) => {
    const node = at(a.pos);
    return {
      position: { x: node.x, y: node.y - 4 - agentRadius * (2 + 2.2 * stack[i]) },
      isCrashed: !a.correct,
      agentId: a.id,
      nodeIndex: a.pos,
    };
  });
  return { center: { x: centerX, y: centerY }, radius, nodePosition: at, agents };
}

export function drawLine(ctx: CanvasRenderingContext2D, snapshot: Snapshot, _model: ModelInfo, options: RenderOptions = {}): Layout {
  const layout = lineLayout(snapshot, options);
  const { center, radius } = layout;
  const { nodeRadius = 4, agentRadius = 7, showNodeLabels = true } = options;
  const colors = markColors(options);
  const { low, high } = lineWindow(snapshot);
  const occupied = new Set(snapshot.agents.map(a => a.pos as number));
  const stride = Math.max(1, Math.ceil((high - low) / 60));
  const nodes = new Set([...occupied, ...Array.from({ length: Math.floor((high - low) / stride) + 1 }, (_, i) => low + i * stride)]);
  ctx.save();
  try {
    // The line continues beyond the window on both sides.
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(center.x - radius - 24, center.y); ctx.lineTo(center.x - radius, center.y);
    ctx.moveTo(center.x + radius, center.y); ctx.lineTo(center.x + radius + 24, center.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(center.x - radius, center.y); ctx.lineTo(center.x + radius, center.y);
    ctx.stroke();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of nodes) {
      const p = layout.nodePosition(v);
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      if (showNodeLabels) {
        ctx.fillStyle = colors.label;
        ctx.fillText(String(v), p.x, p.y + nodeRadius + 12);
      }
    }
    drawComponentMarks(ctx, snapshot, layout.nodePosition, v => {
      const p = layout.nodePosition(v);
      return { x: p.x, y: p.y + nodeRadius + 26 };
    }, colors, nodeRadius);
    drawAgentDiscs(ctx, snapshot, layout.agents.map(a => a.position), colors, agentRadius);
  } finally {
    ctx.restore();
  }
  return layout;
}
