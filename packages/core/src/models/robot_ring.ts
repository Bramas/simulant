import { ND_choice } from '../lib/non-determinism';
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants

export type Move = 'idle' | 'left' | 'right';
export type Actions = null;
export type LocationStateType = '.' | 'X';
export type RingViewType = ViewType<number, LocationStateType>;

 //<number, Actions, LocationStateType<VisibleMemory>, null>
export abstract class AbstractRobot extends AbstractAgent<number, number, LocationStateType, Actions> {
    _pos: number;

    constructor(id: number, pos: number) {
        super(id, pos);
        this._pos = pos;
    }

    action(view: RingViewType): {targetLocation: number, action: null} {
        const move = this.action_simpl(view);

        if(move === 'left') {
            return {targetLocation: view.size - 1, action: null};
        }
        if(move === 'right') {
            return {targetLocation: 1, action: null};
        }
        return {targetLocation: 0, action: null};
    }

    abstract action_simpl(view: RingViewType): Move;
}


export type RingActionType = Actions;
export type RingConfigType<AgentType extends AbstractRobot>  = Config<AgentType, number, '.' | 'X', Actions, number, null>;
export type RingModel<AgentType  extends AbstractRobot>  = SystemInfo<AgentType, null, number, number, '.' | 'X', Actions,RingConfigType<AgentType>> & { N: number, crashedRobots: number[], crashedNode: number };



function model<AgentType extends AbstractRobot>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType>,
    crashedRobots: number[],
    crashedNode: number,
) : RingModel<AgentType> {
    let ringSize = N;
    
    return {
        N: ringSize,
        crashedRobots: crashedRobots,
        crashedNode: crashedNode,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config: RingConfigType<AgentType>, agent: AgentType) => {
            // a string of X or . representing the presence of an agent around the current agent (full visibility)
            let view = new Map<number, LocationStateType>();
            
            // Check all positions in the ring
            for (let i = 0; i < ringSize; i++) {
                // Calculate relative position on the ring
                let relPos = (i - agent._pos + ringSize) % ringSize;
                
                const {agents} = config.get(i);
                if (agents.length > 0) {
                    view.set(relPos, 'X');
                } else {
                    view.set(relPos, '.');
                }
            }
            
            // permute the elements of the view according to an arbitrary morphism
            return new ND_choice<any,any>(
                [(l:number) => l, (l:number) => (ringSize - l) % ringSize],
                ['identity', 'mirror'],
                (m) => {
                    const permuted_view = new Map([...view.entries()].map(([k, v]) => [m(k), v]));

                    return { 
                        view: permuted_view, 
                        inverse: (l:number) => (m(l) + agent._pos) % ringSize 
                    };
                });
        },
        Update: (config: RingConfigType<AgentType>, actions: [AgentType, number, Actions][]) => {
            let nextConfig = new Config() as RingConfigType<AgentType>;
            for (const [agent, pos, action] of actions) {
                if (pos == (agent._pos + ringSize - 1) % ringSize) {
                    agent._pos = pos;
                } else if (pos == (agent._pos + 1) % ringSize) {
                    agent._pos = pos;
                }
                nextConfig.addAgent(agent._pos, agent);
            }
            return nextConfig;
        },
    };
}

export default model