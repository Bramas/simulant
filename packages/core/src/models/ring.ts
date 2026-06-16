
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants
export enum Actions {
    IDLE,
    CLOCKWISE,
    COUNTERCLOCKWISE,
};

export type LocationStateType<VisibleMemory> = VisibleMemory[];

export abstract class AbstractGraphAgent<VisibleMemory> extends AbstractAgent<number, Actions, LocationStateType<VisibleMemory>, null> {
    _pos: number;

    constructor(id: number, pos: number) {
        super(id, pos);
        this._pos = pos;
    }

    action(view: ViewType<Actions, LocationStateType<VisibleMemory>>): {targetLocation: Actions, action: null} {
        return {targetLocation: this.action_simpl(view.get(Actions.IDLE) as LocationStateType<VisibleMemory>), action: null};
    }

    abstract action_simpl(view: LocationStateType<VisibleMemory>): Actions;

    abstract visibleMemory(): VisibleMemory;

    _state(): string {
        return JSON.stringify(this.visibleMemory());
    }
}


export type RingConfigType<AgentType extends AbstractGraphAgent<VisibleMemory>,VisibleMemory,PositionState>  = Config<
AgentType, 
Actions, 
LocationStateType<VisibleMemory>, 
null, 
number, 
PositionState> & {round : number};;

export type RingModel<AgentType  extends AbstractGraphAgent<VisibleMemory> ,VisibleMemory, PositionState>  = SystemInfo<
AgentType, 
PositionState,
number,  // Position type
Actions, //location type (it is called action because basically it means where you want to go)
LocationStateType<VisibleMemory>, 
null, //action type
RingConfigType<AgentType,VisibleMemory,PositionState>
> & { N: number }


export type RingViewType<VisibleMemory> = ViewType<Actions, LocationStateType<VisibleMemory>>;

function model<AgentType extends AbstractGraphAgent<VisibleMemory>, VisibleMemory,PositionState>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType, VisibleMemory,PositionState>,
    options?: {
        updateHook?: (config: RingConfigType<AgentType, VisibleMemory,PositionState>, actions: [AgentType, number, null][]) => RingConfigType<AgentType, VisibleMemory,PositionState>,
    }
) : RingModel<AgentType, VisibleMemory,PositionState> {
    initialConfig.round = 0;

    return {
        N,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config: RingConfigType<AgentType, VisibleMemory,PositionState>, agent: AgentType): {
            view: RingViewType<VisibleMemory>, 
            inverse: (l: Actions) => number,
         } => {
            let view = new Map<Actions, LocationStateType<VisibleMemory>>();
            const {agents} = config.get(agent._pos);
            view.set(Actions.IDLE, agents.filter(a => a._id != agent._id).map(agent => agent.visibleMemory()));
            return {view, inverse: (l) => (
                l == Actions.IDLE 
                ? agent._pos 
                : (l == Actions.CLOCKWISE 
                    ? (agent._pos + 1) % N 
                    : (agent._pos + N - 1) % N
                ))
            };
        },
        Update: (config: RingConfigType<AgentType, VisibleMemory,PositionState>, actions: [AgentType, number, null][]) => {
            let nextConfig = new Config() as RingConfigType<AgentType, VisibleMemory,PositionState>;
            for (const [agent, pos, action] of actions) {
                agent._pos = pos;
                nextConfig.addAgent(agent._pos, agent);
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