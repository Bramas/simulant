
import { ND_array, ND_choice } from '../lib/non-determinism';
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants
export type Actions = null;
export type DynRingLocationState = number; // the number of robots located at a given position
export type DynRingPositionState = {
    missingRightEdge: boolean;
};

export abstract class AbstractRobot extends AbstractAgent<number, number, DynRingLocationState, Actions> {
    _pos: number;

    constructor(id: number, pos: number) {
        super(id, pos);
        this._pos = pos;
    }
}

export type DynRingViewType = ViewType<number, DynRingLocationState>;
export type DynRingActionType = Actions;
export type DynRingConfigType<AgentType extends AbstractRobot>  = Config<AgentType, number, DynRingLocationState, Actions, number, DynRingPositionState> & {round : number};
export type DynRingModel<AgentType  extends AbstractRobot>  = SystemInfo<
    AgentType, 
    DynRingPositionState, 
    number, 
    number, 
    DynRingLocationState, 
    Actions, 
    DynRingConfigType<AgentType>
    > & { N: number }


function edge_equal(e1: [number, number], e2: [number, number]) {
    return (e1[0] == e2[0] && e1[1] == e2[1]) || (e1[0] == e2[1] && e1[1] == e2[0]);
}

export function getMissingEdge<AgentType extends AbstractRobot>(
    config: DynRingConfigType<AgentType>,
    N: number,
): [number, number] | null {
    for (let i = 0; i < N; i++) {
        if (config.get(i).state?.missingRightEdge) {
            return [i, (i + 1) % N];
        }
    }
    return null;
}

function initializeNodeStates<AgentType extends AbstractRobot>(config: DynRingConfigType<AgentType>, N: number) {
    for (let i = 0; i < N; i++) {
        const current = config.get(i);
        config.set(i, {
            agents: current.agents,
            state: current.state ?? { missingRightEdge: false }
        });
    }
}

// create a key identifying the configuration without taking into account the position of the missing edge (which is not observable by agents and can be permuted by symmetries of the ring)
function configKeyWithoutEdges(config: DynRingConfigType<any>, N: number): string {
    const agentsPerNode = [];
    for (let i = 0; i < N; i++) {
        agentsPerNode.push(config.get(i).agents.length);
    }
    return agentsPerNode.join(',');
}

function model<AgentType extends AbstractRobot>(
    N: number,
    agents: AgentType[],
    initialConfig: DynRingConfigType<AgentType>,
) : DynRingModel<AgentType> {

    initialConfig.round = 0;
    initializeNodeStates(initialConfig, N);
    return {
        N,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config: DynRingConfigType<AgentType>, agent: AgentType) => {
            // a string of X or . representing the presence of an agent around the current agent (at visiblity range)
            let view = new Map<number, DynRingLocationState>();
            for (let i = 0; i < N; i++) {
                const {agents} = config.get(i);
                view.set((i - agent._pos + N) % N, agents.length);
            }
            
            // permute the elements of the view according to an arbitrary morphism
            return new ND_choice<any,any>(
                [(l:number) => l],//, (l:number) => l == 0 ? 0 : N-l],
                ['identiy', 'mirror'],
                (m) => {
                    const permuted_view = new Map([...view.entries()].map(([k, v]) => [m(k), v]));

                    return { 
                        view: permuted_view,
                        inverse: (l:number) => { if(m(l) == agent._pos) console.log('inverse => ', m(l), agent._pos); return (m(l)+agent._pos) % N; }
                    };
                });
        },
        Update: (config: DynRingConfigType<AgentType>, actions: [AgentType, number, Actions][]) => {
            const nextConfigs: DynRingConfigType<AgentType>[] = [];

            // store the configurations resulting from each possible position of the missing edge, since it is not observable and can change arbitrarily between rounds
            const configKeys = new Set<string>();
            
            // -1 means there is no missing edge
            for (let missingEdgeStart = -1; missingEdgeStart < N; missingEdgeStart++) {
                const missingEdge: [number, number] = [missingEdgeStart, (missingEdgeStart + 1) % N];
                let nextConfig = new Config() as DynRingConfigType<AgentType>;
                nextConfig.round = config.round + 1;

                for (let i = 0; i < N; i++) {
                    nextConfig.set(i, {
                        agents: [],
                        state: { missingRightEdge: i === missingEdgeStart }
                    });
                }

                for (const [agent, pos] of actions) {
                    const newAgent = agent.clone() as AgentType;
                    if (pos == (newAgent._pos - 1 + N)%N) {
                        if (!edge_equal(missingEdge, [pos, newAgent._pos])) {
                            newAgent._pos = pos;
                        }
                    } else if (pos == (newAgent._pos + 1)%N) {
                        if (!edge_equal(missingEdge, [newAgent._pos, pos])) {
                            newAgent._pos = pos;
                        }
                    }
                    nextConfig.addAgent(newAgent._pos, newAgent);
                }
                if(!configKeys.has(configKeyWithoutEdges(nextConfig, N))) {
                    configKeys.add(configKeyWithoutEdges(nextConfig, N));
                    nextConfigs.push(nextConfig);
                }
            }

            return new ND_array(nextConfigs);
        },
    };
}

export default model