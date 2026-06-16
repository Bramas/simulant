
import { ND_array } from '../lib/non-determinism';
import { Config } from '../lib/system';
import { AbstractGraphAgent, Actions, LocationStateType, RingConfigType, RingViewType, RingModel } from './ring';

export type PositionState = {
    isBH: boolean;
};

export function model<AgentType extends AbstractGraphAgent<VisibleMemory>, VisibleMemory>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType, VisibleMemory, PositionState>,
    BH_node: number,
) : RingModel<AgentType, VisibleMemory, PositionState> & { BH_node: number } {
    initialConfig.round = 0;
    
    // Initialize states to SAFE if not set
    for(let i=0; i<N; i++) {
        const current = initialConfig.get(i);
        if(!current.state) {
            initialConfig.set(i, { agents: current.agents, state: { isBH: false } });
        }
    }

    return {
        N,
        BH_node,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config, agent) => {
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
        Update: (config, actions) => {
            const nextRound = config.round + 1;
            
            // Helper to create next configuration with specified BH state
            const createNextConfig = (bhExists: boolean) => {
                let nextConfig = new Config() as RingConfigType<AgentType, VisibleMemory, PositionState>;
                nextConfig.round = nextRound;
                
                // Set states
                for(let i=0; i<N; i++) {
                    const state = (i === BH_node && bhExists) ? { isBH: true } : { isBH: false };
                    nextConfig.set(i, { agents: [], state });
                }

                // Place agents
                for (const [originalAgent, pos, action] of actions) {
                    const nodeState = nextConfig.get(pos).state;
                    if (nodeState?.isBH) {
                        // Agent falls into Black Hole
                        continue;
                    }
                    // Use a clone to avoid cross-branch mutations
                    const agent = originalAgent.clone() as AgentType;
                    agent._pos = pos;
                    nextConfig.addAgent(agent._pos, agent);
                }
                return nextConfig;
            };

            const bhActive = config.get(BH_node).state?.isBH || false;

            if (bhActive) {
                // BH already exists, it stays
                return createNextConfig(true);
            } else {
                // BH can either appear NOW or NOT appear now
                // Optimization: only consider BH appearing if there's someone to catch
                const anyoneToCatch = actions.some(([_, pos]) => pos === BH_node);
                
                if (anyoneToCatch) {
                    return new ND_array([
                        createNextConfig(false), // Still no BH
                        createNextConfig(true)   // BH appears now
                    ]);
                } else {
                    return createNextConfig(false);
                }
            }
        },
    };
}

export default model;
