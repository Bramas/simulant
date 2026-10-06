import { Config, type SystemInfo } from '@bramas/simulant-core/lib/system';
import {
  AbstractGraphAgent,
  Actions,
  type LocationStateType,
  type RingConfigType,
  type RingModel,
  default as createRing,
} from '@bramas/simulant-core/models/ring';
import type { ConfigRenderOptions, ProjectType } from '@bramas/simulant-core/types/project';

type VisibleMemory = { id: number; direction: 'clockwise' | 'counterclockwise' };
type ExampleConfig = RingConfigType<MovingAgent, VisibleMemory, null>;

class MovingAgent extends AbstractGraphAgent<VisibleMemory> {
  constructor(id: number, position: number, private readonly direction: Actions) {
    super(id, position);
  }

  action_simpl(_view: LocationStateType<VisibleMemory>): Actions {
    return this.direction;
  }

  visibleMemory(): VisibleMemory {
    return {
      id: this._id,
      direction: this.direction === Actions.CLOCKWISE ? 'clockwise' : 'counterclockwise',
    };
  }

  clone(): MovingAgent {
    return new MovingAgent(this._id, this._pos, this.direction);
  }
}

export function setup(settings?: { N?: number }): RingModel<MovingAgent, VisibleMemory, null> {
  const N = Math.max(3, Number(settings?.N) || 8);
  const agents = [
    new MovingAgent(0, 0, Actions.CLOCKWISE),
    new MovingAgent(1, Math.floor(N / 2), Actions.COUNTERCLOCKWISE),
  ];
  const initialConfig = new Config() as ExampleConfig;

  for (const agent of agents) initialConfig.addAgent(agent._pos, agent);

  return createRing(N, agents, initialConfig);
}

export function drawConfig(
  ctx: CanvasRenderingContext2D,
  config: ExampleConfig,
  model: SystemInfo<any, any, any, any, any, any, ExampleConfig>,
  options: ConfigRenderOptions = {},
) {
  const { centerX = 250, centerY = 150, radius = 100 } = options;
  const { N } = model as RingModel<MovingAgent, VisibleMemory, null>;

  ctx.strokeStyle = '#64748b';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  for (let node = 0; node < N; node += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * node) / N;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (const agent of config.get(node).agents) {
      const agentRadius = radius + 18 + agent._id * 14;
      ctx.fillStyle = agent._id === 0 ? '#2563eb' : '#e11d48';
      ctx.beginPath();
      ctx.arc(
        centerX + agentRadius * Math.cos(angle),
        centerY + agentRadius * Math.sin(angle),
        7,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
  }
}

export const editorSchema = {
  fields: [{ type: 'number' as const, key: 'N', label: 'Ring size', defaultValue: 8, min: 3 }],
};

export const projects = {
  'moving-on-a-ring': { setup, drawConfig, editorSchema },
} satisfies Record<string, ProjectType<ExampleConfig>>;
