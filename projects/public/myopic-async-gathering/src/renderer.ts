import { defineRenderer } from '@bramas/simulant-ui/renderers/define';
import { drawRing } from '@bramas/simulant-ui/renderers/ring';
import type { Snapshot } from '../.simulant/types/oddBlockPhiOne';

export const draw = defineRenderer<Snapshot>('myopic-async-gathering/oddBlockPhiOne', (ctx, snapshot, model, options) => {
  const layout = drawRing(ctx, snapshot, model, options);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.theme?.foreground ?? '#111';
  for (const agent of snapshot.agents) {
    if (!agent.present) continue;
    const { x, y } = layout.agents[agent.index].position;
    ctx.fillText(["W","R","B"][agent.fields.light] ?? '?', x + 10, y);
  }
  return layout;
});
