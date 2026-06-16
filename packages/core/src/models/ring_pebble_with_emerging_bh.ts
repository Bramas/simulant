
import { ND_array } from '../lib/non-determinism';
import { Config } from '../lib/system';
import { AbstractGraphAgent, Movements, PebbleActions, LocationStateType, RingConfigType, RingModel } from './ring-pebble';

export type PositionState = {
    pebble: boolean;
    isBH: boolean;
};

export function model<AgentType extends AbstractGraphAgent<VisibleMemory>, VisibleMemory>(
    N: number,
    agents: AgentType[],
    initialConfig: RingConfigType<AgentType, VisibleMemory, PositionState>,
    BH_node: number,
) : RingModel<AgentType, VisibleMemory, PositionState> & { BH_node: number } {
    initialConfig.round = 0;
    
    // Convert old state (boolean representing pebble) to new PositionState
    const items = initialConfig.items();
    for(const [pos, node] of items) {
        const pebble = !!node.state;
        initialConfig.set(pos, { 
            agents: node.agents, 
            state: { pebble, isBH: false } 
        });
    }

    return {
        N,
        BH_node,
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config, agent) => {
            let view = new Map<Movements, LocationStateType<VisibleMemory>>();
            const node = config.get(agent._pos);
            const state = node.state as PositionState;
            view.set(Movements.IDLE, {
                agents: node.agents.filter(a => a._id != agent._id).map(agent => agent.visibleMemory()),
                pebble: state?.pebble || false
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
        Update: (config, actions) => {
            const nextRound = config.round + 1;
            
            const createNextConfig = (bhExistsNow: boolean) => {
                let nextConfig = new Config() as RingConfigType<AgentType, VisibleMemory, PositionState>;
                nextConfig.round = nextRound;
                
                // Initialize nodes with current pebble state and BH state
                for(let i=0; i<N; i++) {
                    const currentState = config.get(i).state as PositionState;
                    const isBH = currentState?.isBH || (i === BH_node && bhExistsNow);
                    nextConfig.set(i, { agents: [], state: { pebble: !!currentState?.pebble, isBH } });
                }

                // Apply actions
                for (const [originalAgent, pos, pebbleAction] of actions) {
                    const previousPos = originalAgent._pos;
                    const targetNode = nextConfig.get(pos);
                    const targetState = targetNode.state;

                    // Update pebble state at the previous position
                    // This happens regardless of whether the agent falls into a BH at the target position
                    const prevNode = nextConfig.get(previousPos);
                    const prevState = prevNode.state!;

                    if(pebbleAction == PebbleActions.DROP && !prevState.pebble) {
                        prevState.pebble = true;
                    } 
                    else if (pebbleAction == PebbleActions.PICKUP && prevState.pebble) {
                        prevState.pebble = false;
                    }

                    if (targetState?.isBH) {
                        // Agent falls into BH
                        continue;
                    }

                    // Move agent only if not falling into BH
                    // Use a clone to avoid cross-branch mutations
                    const agent = originalAgent.clone() as AgentType;
                    agent._pos = pos;
                    nextConfig.addAgent(agent._pos, agent);
                }
                return nextConfig;
            };

            const bhActive = (config.get(BH_node).state as PositionState)?.isBH;

            if (bhActive) {
                return createNextConfig(true);
            } else {
                const anyoneToCatch = actions.some(([_, pos]) => pos === BH_node);
                if (anyoneToCatch) {
                    return new ND_array([
                        createNextConfig(false),
                        createNextConfig(true)
                    ]);
                } else {
                    return createNextConfig(false);
                }
            }
        },
    };
}

export default model;
