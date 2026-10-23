/**
 * The default renderer of cycles (plan, Section 6.5): nodes, agents with their flags, and the
 * markers of library components (the black hole's site, pebbles), in the colors of
 * `options.theme` when the page gives them. It returns the layout it used, so that custom
 * renderers can add overlays and hit tests on the same geometry:
 *
 *   const layout = drawRing(ctx, snapshot, model, options);
 *   const { x, y } = layout.nodePosition(snapshot.world.site);
 */
import type { Snapshot } from '../sim/snapshot';
import type { Layout, ModelInfo, Point, RenderOptions } from '../sim/types';
import { drawAgentDiscs, drawComponentMarks, drawPendingMoves, markColors, stackIndices } from './marks';

export { agentColor } from './marks';

/** The geometry of a cycle, without drawing: vertex n of N at angle 2πn/N, clockwise from the top. */
export function ringLayout(snapshot: Snapshot, options: RenderOptions = {}): Layout {
  const { centerX = 150, centerY = 150, radius = 100, agentRadius = 7 } = options;
  const N = snapshot.size;
  const angle = (n: number) => -Math.PI / 2 + 2 * Math.PI * n / N;
  const at = (n: number, r: number): Point => ({ x: centerX + r * Math.cos(angle(n)), y: centerY + r * Math.sin(angle(n)) });
  const stack = stackIndices(snapshot);
  const agents = snapshot.agents.map((a, i) => ({
    position: at(a.pos, radius + (agentRadius * 1.1) * (1 + 2 * stack[i])),
    isCrashed: !a.correct,
    agentId: a.id,
    nodeIndex: a.pos,
  }));
  return { center: { x: centerX, y: centerY }, radius, nodePosition: n => at(n, radius), agents };
}

export function drawRing(ctx: CanvasRenderingContext2D, snapshot: Snapshot, _model: ModelInfo, options: RenderOptions = {}): Layout {
  const layout = ringLayout(snapshot, options);
  const { radius, center } = layout;
  const { nodeRadius = 4, agentRadius = 7, showNodeLabels = true } = options;
  const colors = markColors(options);
  const inside = (n: number, f: number) => {
    const p = layout.nodePosition(n);
    return { x: center.x + (p.x - center.x) * f, y: center.y + (p.y - center.y) * f };
  };
  ctx.save();
  try {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.stroke();
    for (let n = 0; n < snapshot.size; n++) {
      const p = layout.nodePosition(n);
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      if (showNodeLabels) {
        const q = inside(n, 0.8);
        ctx.fillStyle = colors.label;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`u${n}`, q.x, q.y);
      }
    }
    drawComponentMarks(ctx, snapshot, layout.nodePosition, n => inside(n, 0.9), colors, nodeRadius);
    drawPendingMoves(ctx, snapshot, layout.agents.map(a => a.position), layout.nodePosition);
    drawAgentDiscs(ctx, snapshot, layout.agents.map(a => a.position), colors, agentRadius);
  } finally {
    ctx.restore();
  }
  return layout;
}
