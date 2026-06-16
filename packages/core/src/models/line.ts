
import { ND_choice } from '../lib/non-determinism';
import { AbstractAgent, Config, SystemInfo, ViewType } from '../lib/system';

// Constants
export type Actions = null;

export abstract class AbstractRobot extends AbstractAgent<number, number, '.' | 'X', Actions> {
    _pos: number;

    constructor(id: number, pos: number) {
        super(id, pos);
        this._pos = pos;
    }
}

export type LineViewType = ViewType<number, '.' | 'X'>;
export type LineActionType = Actions;
export type LineConfigType<AgentType extends AbstractRobot>  = Config<AgentType, number, '.' | 'X', Actions, number, null>;
export type LineModel<AgentType  extends AbstractRobot>  = SystemInfo<AgentType, null, number, number, '.' | 'X', Actions,LineConfigType<AgentType>>

function model<AgentType extends AbstractRobot>(
    visRange: number,
    agents: AgentType[],
    initialConfig: LineConfigType<AgentType>,
) : LineModel<AgentType> {

    return {
        Agents: agents,
        InitialConfig: initialConfig,
        View: (config: LineConfigType<AgentType>, agent: AgentType) => {
            // a string of X or . representing the presence of an agent around the current agent (at visiblity range)
            let view = new Map<number, '.' | 'X'>();
            let left = agent._pos - visRange;
            let right = agent._pos + visRange;
            for (let i = left; i <= right; i++) {
                const {agents} = config.get(i);
                if (agents.length > 0) {
                    view.set(agent._pos - i, 'X');
                } else {
                    view.set(agent._pos - i, '.');
                }
            }
            
            // permute the elements of the view according to an arbitrary morphism
            return new ND_choice<any,any>(
                [(l:number) => l, (l:number) => -l],
                ['identiy', 'mirror'],
                (m) => {
                    const permuted_view = new Map([...view.entries()].map(([k, v]) => [m(k), v]));

                    return { 
                        view: permuted_view, 
                        inverse: (l:number) => m(l)+agent._pos 
                    };
                });
        },
        Update: (config: LineConfigType<AgentType>, actions: [AgentType, number, Actions][]) => {
            let nextConfig = new Config() as LineConfigType<AgentType>;
            for (const [agent, pos, action] of actions) {
                if (pos < agent._pos) {
                    agent._pos = agent._pos - 1;
                } else if (pos > agent._pos) {
                    agent._pos = agent._pos + 1;
                } else {
                    // IDLE
                }
                nextConfig.addAgent(agent._pos, agent);
            }
            return nextConfig;
        },
    };
}

export default model