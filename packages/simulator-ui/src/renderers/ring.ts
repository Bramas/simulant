/**
 * The default renderer of rings (plan, Section 6.5): nodes, agents with their
 * flags, and the markers of library components (the black hole's site,
 * pebbles). It returns the layout it used, so that custom renderers can add
 * overlays and hit tests on the same geometry:
 *
 *   const layout = drawRing(ctx, snapshot, model, options);
 *   const { x, y } = layout.nodePosition(snapshot.world.site);
 */
import type { Snapshot } from '../sim/snapshot';
import type { Layout, ModelInfo, Point, RenderOptions } from '../sim/types';

const PALETTE = ['#d32f2f', '#388e3c', '#1976d2', '#7b1fa2', '#f57c00', '#0097a7', '#5d4037', '#c2185b'];

export function agentColor(id: number): string {
  return PALETTE[id % PALETTE.length];
}

/** The geometry of a ring, without drawing. */
export function ringLayout(snapshot: Snapshot, options: RenderOptions = {}): Layout {
  const { centerX = 150, centerY = 150, radius = 100, agentRadius = 7 } = options;
  const N = snapshot.size;
  const angle = (n: number) => -Math.PI / 2 + 2 * Math.PI * n / N;
  const at = (n: number, r: number): Point => ({ x: centerX + r * Math.cos(angle(n)), y: centerY + r * Math.sin(angle(n)) });
  const stacked = new Map<number, number>();
  const agents = snapshot.agents.map(a => {
    const k = stacked.get(a.pos) ?? 0;
    stacked.set(a.pos, k + 1);
    return {
      position: at(a.pos, radius + (agentRadius * 1.1) * (1 + 2 * k)),
      isCrashed: !a.correct,
      agentId: a.id,
      nodeIndex: a.pos,
    };
  });
  return { center: { x: centerX, y: centerY }, radius, nodePosition: n => at(n, radius), agents };
}

export function drawRing(ctx: CanvasRenderingContext2D, snapshot: Snapshot, _model: ModelInfo, options: RenderOptions = {}): Layout {
  const layout = ringLayout(snapshot, options);
  const { radius, center } = layout;
  const { nodeRadius = 4, agentRadius = 7, showNodeLabels = true } = options;
  const N = snapshot.size;
  ctx.save();
  try {
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.stroke();
    for (let n = 0; n < N; n++) {
      const p = layout.nodePosition(n);
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      if (showNodeLabels) {
        const q = { x: center.x + (p.x - center.x) * 0.8, y: center.y + (p.y - center.y) * 0.8 };
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`u${n}`, q.x, q.y);
      }
    }
    // The black hole: a red cross on its site, dashed while inactive.
    const site = snapshot.world.site;
    if (typeof site === 'number') {
      const p = layout.nodePosition(site);
      const s = nodeRadius + 5;
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2;
      ctx.setLineDash(snapshot.world.active ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
      ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y - s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Pebbles: small squares inside the ring.
    const pebbles = snapshot.world.pebbles;
    if (Array.isArray(pebbles)) {
      const count = new Map<number, number>();
      for (const n of pebbles) count.set(n, (count.get(n) ?? 0) + 1);
      for (const [n, c] of count) {
        const p = layout.nodePosition(n);
        const q = { x: center.x + (p.x - center.x) * 0.9, y: center.y + (p.y - center.y) * 0.9 };
        ctx.fillStyle = '#795548';
        for (let i = 0; i < c; i++) ctx.fillRect(q.x - 3 + 4 * i, q.y - 3, 3, 3);
      }
    }
    snapshot.agents.forEach((a, i) => {
      const { position: p } = layout.agents[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, agentRadius, 0, 2 * Math.PI);
      if (!a.present) {
        // Hidden (dead): a hollow grey circle.
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = a.correct ? agentColor(a.id) : '#9e9e9e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  } finally {
    ctx.restore();
  }
  return layout;
}
