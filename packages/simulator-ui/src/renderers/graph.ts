/**
 * The default renderer of finite graphs other than cycles: vertices on a circle in vertex order,
 * except a hub adjacent to every other vertex (the center of a star), drawn in the middle.
 * Edges are straight segments; parallel edges are drawn once. Agents sharing a vertex are
 * stacked away from the center (above it for the hub).
 */
import { vertexKey, type V } from '@bramas/simulant-engine/values';
import type { Snapshot } from '../sim/snapshot';
import type { Layout, ModelInfo, Point, RenderOptions } from '../sim/types';
import { drawAgentDiscs, drawComponentMarks, markColors, nodeLabel, stackIndices } from './marks';

/** The vertex in the middle, if exactly one is adjacent to all others (and there are at least 4). */
function hubOf(snapshot: Snapshot): string | undefined {
  const { space } = snapshot.system;
  const vertices = space.vertices ?? [];
  if (vertices.length < 4) return undefined;
  const hubs = vertices.filter(v => new Set(space.neighbors(v).map(vertexKey)).size === vertices.length - 1);
  return hubs.length === 1 ? vertexKey(hubs[0]) : undefined;
}

export function graphLayout(snapshot: Snapshot, options: RenderOptions = {}): Layout {
  const { centerX = 150, centerY = 150, radius = 100, agentRadius = 7 } = options;
  const vertices = snapshot.system.space.vertices ?? [];
  const hub = hubOf(snapshot);
  const around = vertices.filter(v => vertexKey(v) !== hub);
  const places = new Map<string, { p: Point; out: Point }>();
  around.forEach((v, i) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * i / around.length;
    const out = { x: Math.cos(angle), y: Math.sin(angle) };
    places.set(vertexKey(v), { p: { x: centerX + radius * out.x, y: centerY + radius * out.y }, out });
  });
  if (hub !== undefined) places.set(hub, { p: { x: centerX, y: centerY }, out: { x: 0, y: -1 } });
  const place = (v: V) => places.get(vertexKey(v)) ?? (() => { throw new Error(`${nodeLabel(v)} is not a vertex`); })();
  const stack = stackIndices(snapshot);
  const agents = snapshot.agents.map((a, i) => {
    const { p, out } = place(a.pos);
    const d = (agentRadius * 1.1) * (1 + 2 * stack[i]);
    return { position: { x: p.x + d * out.x, y: p.y + d * out.y }, isCrashed: !a.correct, agentId: a.id, nodeIndex: a.pos };
  });
  return { center: { x: centerX, y: centerY }, radius, nodePosition: v => place(v).p, agents };
}

export function drawGraph(ctx: CanvasRenderingContext2D, snapshot: Snapshot, _model: ModelInfo, options: RenderOptions = {}): Layout {
  const layout = graphLayout(snapshot, options);
  const { space } = snapshot.system;
  const { nodeRadius = 4, agentRadius = 7, showNodeLabels = true } = options;
  const colors = markColors(options);
  const { center } = layout;
  /** A point between the vertex and the center (outside, for the hub). */
  const inward = (v: V, f: number) => {
    const p = layout.nodePosition(v);
    if (p.x === center.x && p.y === center.y) return { x: p.x, y: p.y + 16 * (f > 0.85 ? 1.6 : 1) };
    return { x: center.x + (p.x - center.x) * f, y: center.y + (p.y - center.y) * f };
  };
  ctx.save();
  try {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.25;
    const drawn = new Set<string>();
    for (const { a, b } of space.edges()) {
      const key = [vertexKey(a), vertexKey(b)].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const p = layout.nodePosition(a), q = layout.nodePosition(b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of space.vertices ?? []) {
      const p = layout.nodePosition(v);
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      if (showNodeLabels) {
        const q = inward(v, 0.8);
        ctx.fillStyle = colors.label;
        ctx.fillText(nodeLabel(v), q.x, q.y);
      }
    }
    drawComponentMarks(ctx, snapshot, layout.nodePosition, v => inward(v, 0.9), colors, nodeRadius);
    drawAgentDiscs(ctx, snapshot, layout.agents.map(a => a.position), colors, agentRadius);
  } finally {
    ctx.restore();
  }
  return layout;
}
