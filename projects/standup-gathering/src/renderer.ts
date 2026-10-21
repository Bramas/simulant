import { defineRenderer } from '@bramas/simulant-ui/renderers/define';
import type { Layout } from '@bramas/simulant-ui/sim/types';
import type { Snapshot as LuminousSnapshot } from '../.simulant/types/twoColors';
import type { Snapshot as ObliviousSnapshot } from '../.simulant/types/hPlusThree';
type Snapshot = LuminousSnapshot | ObliviousSnapshot;

export const draw = defineRenderer<Snapshot>('standup-gathering/line', (ctx, snapshot, model, options) => {
  const { centerX = 150, centerY = 150, radius = 100, agentRadius = 7, theme } = options;
  // The initial coordinates bound the drawing: the robots gather inside their initial hull.
  const given = model.params.positions;
  const initial: number[] = [...(typeof given === 'string' ? JSON.parse(given) : given as number[]), ...snapshot.agents.map(a => a.pos)];
  const origin = 0;
  const low = Math.min(...initial) - 1;
  const high = Math.max(...initial) + 1;
  const step = 2 * radius / Math.max(1, high - low);
  const at = (node: number) => ({ x: centerX - radius + (node - origin - low) * step, y: centerY });
  const foreground = theme?.foreground ?? '#222';
  const background = theme?.background ?? '#fff';
  const muted = theme?.muted ?? '#666';
  const luminous = model.algorithm === 'TwoColors';
  const lightColors = theme?.dark ? { X: '#60a5fa', Y: '#fb923c' } : { X: '#2563eb', Y: '#c2410c' };
  const lightText = theme?.dark ? '#111827' : '#fff';
  ctx.strokeStyle = theme?.line ?? '#888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX - radius - 12, centerY);
  ctx.lineTo(centerX + radius + 12, centerY);
  ctx.stroke();
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const occupied = new Set(snapshot.agents.map(a => a.pos));
  // Large gaps keep their scale without drawing every empty node.
  const stride = Math.max(1, Math.ceil((high - low) / 70));
  const nodes = new Set([...occupied, ...Array.from({ length: Math.floor((high - low) / stride) + 1 }, (_, i) => origin + low + i * stride)]);
  for (const n of nodes) {
    const p = at(n);
    ctx.fillStyle = occupied.has(n) ? foreground : background;
    ctx.strokeStyle = muted;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (options.showNodeLabels !== false) {
      ctx.fillStyle = muted;
      ctx.fillText(String(n - origin), p.x, p.y + 18);
    }
  }
  const stacks = new Map<number, number>();
  const agents = snapshot.agents.map(a => {
    const k = stacks.get(a.pos) ?? 0;
    stacks.set(a.pos, k + 1);
    const node = at(a.pos);
    const position = { x: node.x, y: node.y - 20 - k * (2 * agentRadius + 5) };
    const light = 'light' in a.fields && a.fields.light === 1 ? 'Y' : 'X';
    ctx.fillStyle = luminous ? lightColors[light] : foreground;
    ctx.strokeStyle = a.correct ? background : (theme?.danger ?? '#c33');
    ctx.lineWidth = a.correct ? 1.5 : 3;
    ctx.beginPath(); ctx.arc(position.x, position.y, agentRadius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = luminous ? lightText : background;
    ctx.font = `${Math.max(9, agentRadius + 2)}px system-ui, sans-serif`;
    ctx.fillText(light, position.x, position.y);
    if (!a.correct) {
      ctx.fillStyle = theme?.danger ?? '#c33';
      ctx.fillText('×', position.x, position.y - agentRadius - 8);
    }
    return { position, isCrashed: !a.correct, agentId: a.id, nodeIndex: a.pos };
  });
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  const lights = luminous ? 'X / Y lights · Z = both colors' : 'One color · oblivious';
  ctx.fillText(`${lights} · φ = ${model.params.phi} · × crashed`, centerX, centerY + 45);
  return { center: { x: centerX, y: centerY }, radius, nodePosition: at, agents } satisfies Layout;
});
