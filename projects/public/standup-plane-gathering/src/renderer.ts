import type { AgentRenderInfo, ConfigRenderOptions } from '@bramas/simulant-core/types/project';
import { agentColor } from '@bramas/simulant-ui/renderers/marks';
import { diameter, distance, smallestCircle, type Point } from './geometry';
import { numericallyGathered, type Preview, type Scene } from './numerical';

/** Stable world-to-canvas projection. Panning/zooming never changes the simulation state. */
export function placement(scene: Scene, model: Preview, cx: number, cy: number, radius: number) {
  const scale = radius * 0.82 / Math.max(model.initialCircle.radius, 0.001);
  const project = (p: Point) => ({ x: cx + (p.x - model.initialCircle.center.x) * scale,
    y: cy - (p.y - model.initialCircle.center.y) * scale });
  const agents: AgentRenderInfo[] = scene.robots.map((r, i) => {
    const group = scene.robots.map((q, j) => ({ q, j })).filter(({ q }) => distance(r.position, q.position) <= model.tolerance);
    const stack = group.findIndex(({ j }) => j === i);
    const p = project(r.position);
    const offset = group.length > 1 ? 11 : 0;
    const angle = 2 * Math.PI * stack / group.length;
    return { position: { x: p.x + offset * Math.cos(angle), y: p.y + offset * Math.sin(angle) },
      isCrashed: r.crashed, agentId: i, nodeIndex: i };
  });
  return { project, agents, scale };
}

export function drawPlane(ctx: CanvasRenderingContext2D, scene: Scene, model: Preview, options: ConfigRenderOptions = {}) {
  const { centerX = 150, centerY = 150, radius = 100, theme } = options;
  const { project, agents, scale } = placement(scene, model, centerX, centerY, radius);
  const points = scene.robots.map(r => r.position);
  const circle = smallestCircle(points, model.tolerance);
  const center = project(circle.center);
  ctx.save();
  ctx.strokeStyle = theme?.line ?? '#888';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(center.x, center.y, circle.radius * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = theme?.accent ?? '#4a70b0';
  ctx.beginPath(); ctx.arc(center.x, center.y, 3, 0, Math.PI * 2); ctx.fill();
  if (scene.previous && scene.decisions) scene.previous.forEach((from, i) => {
    const a = project(from), b = project(scene.decisions![i].target);
    ctx.strokeStyle = agentColor(i);
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(b.x - 3, b.y - 3); ctx.lineTo(b.x + 3, b.y + 3);
    ctx.moveTo(b.x + 3, b.y - 3); ctx.lineTo(b.x - 3, b.y + 3); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  agents.forEach((a, i) => {
    const actual = project(scene.robots[i].position);
    ctx.strokeStyle = theme?.muted ?? '#888';
    ctx.beginPath(); ctx.moveTo(actual.x, actual.y); ctx.lineTo(a.position.x, a.position.y); ctx.stroke();
    ctx.fillStyle = a.isCrashed ? (theme?.muted ?? '#888') : agentColor(i);
    ctx.beginPath(); ctx.arc(a.position.x, a.position.y, 6, 0, Math.PI * 2); ctx.fill();
    if (a.isCrashed) {
      ctx.strokeStyle = theme?.foreground ?? '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.position.x - 4, a.position.y - 4); ctx.lineTo(a.position.x + 4, a.position.y + 4);
      ctx.moveTo(a.position.x + 4, a.position.y - 4); ctx.lineTo(a.position.x - 4, a.position.y + 4); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.font = '11px system-ui'; ctx.fillStyle = theme?.foreground ?? '#222';
    ctx.fillText(`r${i}`, a.position.x + 9, a.position.y - 8);
  });
  ctx.font = '11px system-ui'; ctx.fillStyle = theme?.muted ?? '#666';
  const label = numericallyGathered(scene, model.tolerance) ? 'Numerically co-located (within ε)'
    : scene.round >= model.limit ? 'Preview stopped at its round limit' : `Round ${scene.round} · diameter ${diameter(points).toPrecision(4)}`;
  ctx.fillText(label, centerX - radius, centerY + radius + 18);
  ctx.fillText('Dashed: circle / last targets · ×: target or crash', centerX - radius, centerY + radius + 33);
  ctx.restore();
}
