import { ND_array, ND_choice } from '../lib/non-determinism';
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants

export type Move = 'idle' | 'left' | 'right';
export type Actions = null;
export type LocationStateType = '.' | 'X';
export type RingViewType = ViewType<number, LocationStateType>;

 //<number, Actions, LocationStateType<VisibleMemory>, null>
export abstract class AbstractRobot extends AbstractAgent<number, number, LocationStateType, Actions> {
    _pos: number;
    _crashed: boolean = false;

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


    _state(): string {
        return this._crashed.toString(); // we do not include id in the state because agents are anonymous and two configurations that differ only by id assignment are equivalent
    }
}


export type RingActionType = Actions;
export type RingConfigType<AgentType extends AbstractRobot>  = Config<AgentType, number, '.' | 'X', Actions, number, null>;
export type RingModel<AgentType  extends AbstractRobot>  = SystemInfo<AgentType, null, number, number, '.' | 'X', Actions,RingConfigType<AgentType>> & { N: number, crashedNode: number };



function model<AgentType extends AbstractRobot>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType>,
    crashedNode: number,
) : RingModel<AgentType> {
    let ringSize = N;
    
    return {
        N: ringSize,
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


            // for each agents store its possible new position and state
            const nextAgents = new Map() as Map<number, [number, AgentType][]>;

            for (const [agent, pos, action] of actions) {
                if(agent._crashed) {
                    nextAgents.set(agent._id, [[agent._pos, agent]]);
                    continue;
                }
                const agentNextState = [] as [number, AgentType][];

                // consider crash possibility
                if (agent._pos == crashedNode) {
                    let otherAgent = agent.clone() as AgentType;
                    otherAgent._crashed = true;
                    agentNextState.push([otherAgent._pos, otherAgent]);
                }

                if (pos == (agent._pos + ringSize - 1) % ringSize) {
                    agent._pos = pos;
                } else if (pos == (agent._pos + 1) % ringSize) {
                    agent._pos = pos;
                }
                agentNextState.push([agent._pos, agent]);
                nextAgents.set(agent._id, agentNextState);
            }
            
            // Generate all combinations of agent states
            const agentsList = Array.from(nextAgents.entries());
            const allCombinations = generateCombinations(agentsList);
            
            // Build a configuration for each combination
            let nextConfigs = [] as RingConfigType<AgentType>[];
            for (const combination of allCombinations) {
                let newConfig = new Config() as RingConfigType<AgentType>;
                for (const [pos, agent] of combination) {
                    newConfig.addAgent(pos, agent);
                }
                nextConfigs.push(newConfig);
            }
            
            return new ND_array<RingConfigType<AgentType>>(nextConfigs);
        },
    };
}

// Helper function to generate all combinations from a list of agent choices
function generateCombinations<AgentType>(
    agentsList: [number, [number, AgentType][]][]
): [number, AgentType][][] {
    if (agentsList.length === 0) {
        return [[]];
    }
    
    const [agentId, positions] = agentsList[0];
    const restAgents = agentsList.slice(1);
    const restCombinations = generateCombinations(restAgents);
    
    const allCombinations: [number, AgentType][][] = [];
    for (const [pos, agent] of positions) {
        for (const restCombo of restCombinations) {
            allCombinations.push([[pos, agent], ...restCombo]);
        }
    }
    
    return allCombinations;
}

export default model