/**
 * An optional custom drawing: the default ring, plus each agent's claim.
 * Saving this file redraws the current configuration without restarting it.
 * The types come from `.simulant/types/` (generated when the experiment compiles).
 */
import { defineRenderer } from '@bramas/simulant-ui/renderers/define';
import { drawRing } from '@bramas/simulant-ui/renderers/ring';
import type { Snapshot } from '../../.simulant/types/cautiousPair';

export const draw = defineRenderer<Snapshot>('starter/cautiousPair', (ctx, snapshot, model, options) => {
  const layout = drawRing(ctx, snapshot, model, options);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = options.theme?.foreground ?? '#111';
  for (const agent of snapshot.agents) {
    if (agent.pub.bh === null) continue;
    const { x, y } = layout.agents[agent.index].position;
    ctx.fillText(agent.pub.bh === 'cw' ? 'hole: cw' : 'hole: ccw', x, y - 12);
  }
  return layout;
});
