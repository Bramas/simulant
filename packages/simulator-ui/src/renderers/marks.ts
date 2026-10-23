/**
 * Marks shared by the default renderers: agents with their flags, and the markers of library
 * components (the black hole's site, pebbles), placed by a layout's `nodePosition`.
 */
import type { Snapshot } from '../sim/snapshot';
import type { Point, RenderOptions } from '../sim/types';

const PALETTE = ['#d32f2f', '#388e3c', '#1976d2', '#7b1fa2', '#f57c00', '#0097a7', '#5d4037', '#c2185b'];

export function agentColor(id: number): string {
  return PALETTE[id % PALETTE.length];
}

/** The colors of the default renderers, from the page's theme when it gives one. */
export function markColors(options: RenderOptions) {
  const { theme } = options;
  return {
    line: theme?.line ?? '#666',
    node: theme?.muted ?? '#666',
    label: theme?.muted ?? '#666',
    background: theme?.background ?? '#fff',
    hole: theme?.danger ?? '#d32f2f',
    pebble: theme?.dark ? '#bcaaa4' : '#795548',
  };
}

export type MarkColors = ReturnType<typeof markColors>;

/** A vertex as a node label: `u3`. */
export function nodeLabel(v: unknown): string {
  return typeof v === 'number' ? `u${v}` : `u${JSON.stringify(v)}`;
}

/**
 * The black hole (a cross on its site, dashed while inactive) and pebbles (small squares, at
 * `pebbleAt` of their node).
 */
export function drawComponentMarks(
  ctx: CanvasRenderingContext2D, snapshot: Snapshot, nodePosition: (v: any) => Point,
  pebbleAt: (v: any) => Point, colors: MarkColors, nodeRadius: number,
) {
  const site = snapshot.world.site;
  if (site !== undefined && 'active' in snapshot.world) {
    const p = nodePosition(site);
    const s = nodeRadius + 5;
    ctx.strokeStyle = colors.hole;
    ctx.lineWidth = 2;
    ctx.setLineDash(snapshot.world.active ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
    ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y - s);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const pebbles = snapshot.world.pebbles;
  if (Array.isArray(pebbles)) {
    const count = new Map<string, { v: unknown; c: number }>();
    for (const v of pebbles) {
      const k = JSON.stringify(v);
      count.set(k, { v, c: (count.get(k)?.c ?? 0) + 1 });
    }
    ctx.fillStyle = colors.pebble;
    for (const { v, c } of count.values()) {
      const q = pebbleAt(v);
      for (let i = 0; i < c; i++) ctx.fillRect(q.x - 3 + 4 * i, q.y - 3, 3, 3);
    }
  }
}

/** Agents as discs: in their color, grey once faulty, hollow once hidden (dead). */
export function drawAgentDiscs(ctx: CanvasRenderingContext2D, snapshot: Snapshot, positions: Point[], colors: MarkColors, agentRadius: number) {
  snapshot.agents.forEach((a, i) => {
    const p = positions[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, agentRadius, 0, 2 * Math.PI);
    if (!a.present) {
      ctx.strokeStyle = colors.node;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = a.correct ? agentColor(a.id) : '#9e9e9e';
      ctx.fill();
      ctx.strokeStyle = colors.background;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

/**
 * Pending moves (asynchronous cycles): a dashed arrow from the agent to the target of its pending
 * decision, in its color; drawn before the discs, which stay on top.
 */
export function drawPendingMoves(ctx: CanvasRenderingContext2D, snapshot: Snapshot, positions: Point[], nodePosition: (v: any) => Point) {
  snapshot.agents.forEach((a, i) => {
    if (!a.pending || !a.present || JSON.stringify(a.pending.target) === JSON.stringify(a.pos)) return;
    const p = positions[i], q = nodePosition(a.pending.target);
    const angle = Math.atan2(q.y - p.y, q.x - p.x);
    ctx.strokeStyle = agentColor(a.id);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x - 7 * Math.cos(angle - 0.4), q.y - 7 * Math.sin(angle - 0.4));
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x - 7 * Math.cos(angle + 0.4), q.y - 7 * Math.sin(angle + 0.4));
    ctx.stroke();
  });
}

/** Agents sharing a vertex are stacked: the k-th agent at a vertex, for each agent in order. */
export function stackIndices(snapshot: Snapshot): number[] {
  const stacked = new Map<string, number>();
  return snapshot.agents.map(a => {
    const key = JSON.stringify(a.pos);
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    return k;
  });
}
