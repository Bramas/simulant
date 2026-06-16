
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants
export enum Movements {
    IDLE,
    CLOCKWISE,
    COUNTERCLOCKWISE,
};

export enum PebbleActions {
    NONE,
    DROP,
    PICKUP,
};
export type Actions = {
    move: Movements,
    pebble: PebbleActions,
}

export type LocationStateType<VisibleMemory> = 
{
    agents: VisibleMemory[],
    pebble?: boolean
};

export abstract class AbstractGraphAgent<VisibleMemory> extends AbstractAgent<number, Movements, LocationStateType<VisibleMemory>, PebbleActions> {
    _pos: number;

    constructor(id: number, pos: number) {
        super(id, pos);
        this._pos = pos;
    }

    abstract visibleMemory(): VisibleMemory;
}


export type RingConfigType<AgentType extends AbstractGraphAgent<VisibleMemory>,VisibleMemory, StateType = boolean>  = Config<
    AgentType, 
    Movements, 
    LocationStateType<VisibleMemory>, 
    PebbleActions, 
    number, 
    StateType> & {round : number};

export type RingModel<AgentType  extends AbstractGraphAgent<VisibleMemory> ,VisibleMemory, StateType = boolean>  = SystemInfo<
AgentType, 
StateType,
number,  // Position type
Movements, //location type (it is called Movements because basically it means where you want to go)
LocationStateType<VisibleMemory>, 
PebbleActions, //action type
RingConfigType<AgentType,VisibleMemory, StateType>
> & { N: number }


export type RingViewType<VisibleMemory> = ViewType<Movements, LocationStateType<VisibleMemory>>;

function model<AgentType extends AbstractGraphAgent<VisibleMemory>, VisibleMemory,PositionState>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType, VisibleMemory>,
    options?: {
        updateHook?: (config: RingConfigType<AgentType, VisibleMemory>, actions: [AgentType, number, PebbleActions][]) => RingConfigType<AgentType, VisibleMemory>,
    }
) : RingModel<AgentType, VisibleMemory> {
    initialConfig.round = 0;

    return {
        N,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config: RingConfigType<AgentType, VisibleMemory>, agent: AgentType): {
            view: RingViewType<VisibleMemory>, 
            inverse: (l: Movements) => number,
         } => {
            let view = new Map<Movements, LocationStateType<VisibleMemory>>();
            const {agents} = config.get(agent._pos);
            view.set(Movements.IDLE, {
                agents: agents.filter(a => a._id != agent._id).map(agent => agent.visibleMemory()),
                pebble: config.get(agent._pos).state || false
            });
            return {view, inverse: (l) => (
                l == Movements.IDLE 
                ? agent._pos 
                : (l == Movements.CLOCKWISE 
                    ? (agent._pos + 1) % N 
                    : (agent._pos + N - 1) % N
                ))
            };
        },
        Update: (config: RingConfigType<AgentType, VisibleMemory>, actions: [AgentType, number, PebbleActions][]) => {
            let nextConfig = new Config() as RingConfigType<AgentType, VisibleMemory>;
            config.items().forEach(([pos, node]) => {
                if(node.state) {
                    nextConfig.setState(pos, node.state);
                }
            });
            for (const [agent, pos, action] of actions) {
                let previous_pos = agent._pos;
                agent._pos = pos;
                nextConfig.addAgent(agent._pos, agent);

                if(action == PebbleActions.DROP && !config.get(previous_pos).state) {
                    nextConfig.setState(previous_pos, true);
                } 
                else if (action == PebbleActions.PICKUP && config.get(previous_pos).state) {
                    nextConfig.setState(previous_pos, false);
                }
            }
            nextConfig.round = config.round + 1;
            if (options?.updateHook) {
                return options.updateHook(nextConfig, actions);
            }
            return nextConfig;
        },
    };
}

export default model