
/*

A view could return a map of locations to states, and a converse map from locations (some location maybe) to positions.

Then, in a model where the view could be arbitrarily modified by a symmetry, the view could return the converse map so that the system knows where the agent is moving.

*/

import { ND_array, NonDeterminism } from "./non-determinism";

export type ViewType<LocationType, LocationStateType> = Map<LocationType, LocationStateType>;

const log = (...args: any[]) =>{}
//const log = console.log

// Define Agent class
export abstract class AbstractAgent<PositionType, LocationType, LocationStateType, ActionType> {
    _id: number;
    _pos: PositionType;
    private _stepGenerator: Generator | undefined;

    constructor(id: number, pos: PositionType) {
        this._id = id;
        this._pos = pos;
    }

    abstract action(view: ViewType<LocationType, LocationStateType>): {targetLocation: LocationType, action: ActionType};

    abstract clone(): AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>;

    _state(): string {
        return this._id.toString();
    }
}


export type SystemInfo<
    AgentType extends AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>, 
    PositionStateType,
    PositionType,
    LocationType,
    LocationStateType,
    ActionType,
    ConfigType extends Config<AgentType, LocationType, LocationStateType, ActionType, PositionType, PositionStateType>
> = {
    Agents: AgentType[];
    View: (
        config: ConfigType, 
        agent: AgentType
    ) => {
            view: ViewType<LocationType, LocationStateType>, 
            inverse: (l: LocationType) => PositionType
        } | NonDeterminism<any, {
            view: ViewType<LocationType, LocationStateType>, 
            inverse: (l: LocationType) => PositionType
        }>;
    Update: (
        config: ConfigType, 
        actions: [AgentType, PositionType, ActionType][]) => ConfigType | ND_array<ConfigType>;
    InitialConfig: ConfigType;
};


type NodeType<AgentType, PositionStateType> = {state: PositionStateType | null, agents: AgentType[]};

// Config class to manage agent configuration
export class Config<AgentType extends AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>, LocationType, LocationStateType, ActionType, PositionType, PositionStateType> {
    private config: Map<PositionType, NodeType<AgentType, PositionStateType>>;

    
    constructor() {
        this.config = new Map();
    }

    addAgent(pos: PositionType, agent: AgentType): void {
        if (!this.config.get(pos)) {
            this.config.set(pos, {state: null, agents: []});
        }
        agent._pos = pos;
        let v = this.config.get(pos) as NodeType<AgentType, PositionStateType>;
        v.agents.push(agent);
        this.config.set(pos, v);
    }
    setState(pos: PositionType, state: PositionStateType): void {
        if (!this.config.get(pos)) {
            this.config.set(pos, {state: null, agents: []});
        }
        let v = this.config.get(pos) as NodeType<AgentType, PositionStateType>;
        v.state = state;
        this.config.set(pos, v);
    }
    removeAgent(pos: PositionType, agent: AgentType): void {
        if (!this.config.get(pos)) {
            return;
        }
        let v = this.config.get(pos) as NodeType<AgentType, PositionStateType>;
        v.agents = v.agents.filter(a => a._id !== agent._id);
        this.config.set(pos, v);
    }

    agents(): AgentType[] {
        let agents_list: AgentType[] = [];
        for (const {agents} of this.config.values()) {
            agents.forEach(agent => {
                agents_list.push(agent);
            });
        }
        return agents_list;
    }

    clone_agents(): AgentType[] {
        let cloned_agents: AgentType[] = [];
        for (const {agents} of this.config.values()) {
            agents.forEach(agent => {
                cloned_agents.push(agent.clone() as AgentType);
            });
        }
        return cloned_agents;
    }

    get(pos: PositionType): NodeType<AgentType, PositionStateType> {
        if (!this.config.get(pos)) {
            return {state: null, agents: []};
        }
        return this.config.get(pos) as NodeType<AgentType, PositionStateType>;
    }

    set(pos: PositionType, value: NodeType<AgentType, PositionStateType>): void {
        this.config.set(pos, value);
    }

    items(): [PositionType, NodeType<AgentType, PositionStateType>][] {
        return [...this.config.entries()];
    }

    keys(): number[] {
        return Object.keys(this.config).map(Number);
    }

    clone(): Config<AgentType, LocationType, LocationStateType, ActionType, PositionType, PositionStateType> {
        const newConfig = new Config<AgentType, LocationType, LocationStateType, ActionType, PositionType, PositionStateType>();
        for (const [pos, {state, agents}] of this.items()) {
            newConfig.set(pos, {state, agents:agents.slice()});
        }
        return newConfig;
    }
}

export class ConfigGraph<
    AgentType extends AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>, 
    LocationType, 
    LocationStateType, 
    ActionType, 
    PositionType, 
    PositionStateType,
    ConfigType extends Config<AgentType, LocationType, LocationStateType, ActionType, PositionType, PositionStateType>
    > {
    private configGraph: ConfigType[] = [];

    addConfig(config: ConfigType): void {
        this.configGraph.push(config);
    }

    len(): number {
        return this.configGraph.length;
    }

    first(): ConfigType {
        return this.configGraph[0];
    }

    last(): ConfigType {
        return this.configGraph[this.configGraph.length - 1];
    }

    get(index: number): ConfigType {
        return this.configGraph[index];
    }
}


// Helper function to execute the system with full non-deterministic exploration
export function execute<
        AgentType extends AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>, 
        PositionStateType,
        PositionType,
        LocationType,
        LocationStateType,
        ActionType,
        ConfigType extends Config<AgentType, LocationType, LocationStateType, ActionType, PositionType, PositionStateType>
    >(systemInfo: SystemInfo<AgentType, PositionStateType, PositionType, LocationType, LocationStateType,ActionType, ConfigType>): {
        get: (path: number[]) => ConfigType,
        getSiblingCount: (path: number[]) => number,
        getChildrenCount: (path: number[]) => number,
        getRandomChildIndex: (path: number[]) => number
    } {

    for (const [i, agent] of systemInfo.Agents.entries()) {
        agent._id = i;
    }
    
    // Tree structure: each node contains all possible next configurations
    type ConfigNode = {
        config: ConfigType;
        children: ConfigType[] | null; // null means not yet computed
    };
    
    const root: ConfigNode = {
        config: systemInfo.InitialConfig,
        children: null
    };
    
    // Cache: Map from path string to ConfigNode
    const cache = new Map<string, ConfigNode>();
    cache.set('0', root);
    
    // Convert path array to string key
    const pathToKey = (path: number[]): string => path.join('-');
    
    // Convert a configuration to a string for comparison (to detect duplicates)
    const configToString = (config: ConfigType): string => {
        const items = config.items();
        // Sort by position to ensure consistent ordering
        const sortedItems = items.sort((a, b) => {
            const posA = String(a[0]);
            const posB = String(b[0]);
            return posA.localeCompare(posB);
        });
        
        return JSON.stringify(sortedItems.map(([pos, {state, agents}]) => ({
            pos,
            state,
            agentIds: agents.map(a => a._state()).sort()
        })));
    };
    
    // Compute the next configurations from a given config
    const computeNextConfigs = (config: ConfigType): ConfigType[] => {
        const views: Map<number, 
            {
                view: ViewType<LocationType, LocationStateType>,
                inverse: (l: LocationType) => PositionType
            } | NonDeterminism<any, {
                view: ViewType<LocationType, LocationStateType>,
                inverse: (l: LocationType) => PositionType
            }>
        > = new Map();
    
        for (const [pos, {state, agents}] of config.items()) {
            for (const agent of agents) {
                views.set(agent._id, systemInfo.View(config, agent));
            }
        }

        // Compute all possible action combinations
        const allPossibleActions = computeAllPossibleActions<
            AgentType, PositionType, LocationType, LocationStateType, ActionType
        >(config.clone_agents(), views);

        // For each possible action combination, compute the next config
        const nextConfigs: ConfigType[] = [];
        const seenConfigs = new Set<string>();
        
        for (const actions of allPossibleActions) {
            let nextConfigsForTheActions: ConfigType[] = [];

            const updateResult = systemInfo.Update(config, actions);
            if (updateResult instanceof ND_array) {
                nextConfigsForTheActions = updateResult.getAllChoices();
            } else {
                nextConfigsForTheActions = [updateResult];
            }
            for (const nextConfig of nextConfigsForTheActions) {
                const configStr = configToString(nextConfig);
                
                // Only add if we haven't seen this configuration before
                if (!seenConfigs.has(configStr)) {
                    seenConfigs.add(configStr);
                    nextConfigs.push(nextConfig);
                }
            }
        }
        
        return nextConfigs;
    };
    
    // Get configuration at a given path
    const get = (path: number[]): ConfigType => {
        if (path.length === 0 || path[0] !== 0) {
            throw new Error('Path must start with 0 (root)');
        }
        
        if (path.length === 1) {
            return root.config;
        }
        
        // Navigate to parent and ensure all ancestors are computed
        let current = root;
        let currentPath = [0];
        
        for (let i = 1; i < path.length; i++) {
            const childIndex = path[i];
            
            // Compute children if not already done
            if (current.children === null) {
                current.children = computeNextConfigs(current.config);
                
                // Cache all children
                for (let j = 0; j < current.children.length; j++) {
                    const childPath = [...currentPath, j];
                    const key = pathToKey(childPath);
                    if (!cache.has(key)) {
                        cache.set(key, {
                            config: current.children[j],
                            children: null
                        });
                    }
                }
            }
            
            if (childIndex >= current.children.length) {
                throw new Error(`Invalid path: child index ${childIndex} out of bounds (max: ${current.children.length - 1})`);
            }
            
            currentPath.push(childIndex);
            const key = pathToKey(currentPath);
            const nextNode = cache.get(key);
            
            if (!nextNode) {
                throw new Error(`Cache inconsistency at path ${key}`);
            }
            
            current = nextNode;
        }
        
        return current.config;
    };
    
    // Get the number of sibling configurations at a given path
    const getSiblingCount = (path: number[]): number => {
        if (path.length === 0 || path[0] !== 0) {
            throw new Error('Path must start with 0 (root)');
        }
        
        if (path.length === 1) {
            return 1; // Root has no siblings
        }
        
        // Get parent's children count
        const parentPath = path.slice(0, -1);
        return getChildrenCount(parentPath);
    };
    
    // Get the number of children for a configuration at a given path
    const getChildrenCount = (path: number[]): number => {
        if (path.length === 0 || path[0] !== 0) {
            throw new Error('Path must start with 0 (root)');
        }
        
        const config = get(path);
        const key = pathToKey(path);
        const node = cache.get(key);
        
        if (!node) {
            throw new Error('Node not found in cache');
        }
        
        if (node.children === null) {
            node.children = computeNextConfigs(config);
            
            // Cache all children
            for (let j = 0; j < node.children.length; j++) {
                const childPath = [...path, j];
                const childKey = pathToKey(childPath);
                if (!cache.has(childKey)) {
                    cache.set(childKey, {
                        config: node.children[j],
                        children: null
                    });
                }
            }
        }
        
        return node.children.length;
    };
    
    // Get a random child index (for random selection)
    const getRandomChildIndex = (path: number[]): number => {
        const count = getChildrenCount(path);
        if (count === 0) return 0;
        return Math.floor(Math.random() * count);
    };

    return {
        get,
        getSiblingCount,
        getChildrenCount,
        getRandomChildIndex
    };
}

// Helper function to compute all possible actions given the views
function computeAllPossibleActions<
    AgentType extends AbstractAgent<PositionType, LocationType, LocationStateType, ActionType>,
    PositionType,
    LocationType,
    LocationStateType,
    ActionType
>(
    agents: AgentType[],
    views: Map<number, 
        {
            view: ViewType<LocationType, LocationStateType>,
            inverse: (l: LocationType) => PositionType
        } | NonDeterminism<any, {
            view: ViewType<LocationType, LocationStateType>,
            inverse: (l: LocationType) => PositionType
        }>
    >
): [AgentType, PositionType, ActionType][][] {
    // Recursive function to generate all combinations
    const generateCombinations = (
        agentIndex: number,
        currentActions: [AgentType, PositionType, ActionType][]
    ): [AgentType, PositionType, ActionType][][] => {
        if (agentIndex >= agents.length) {
            return [currentActions];
        }

        const agent = agents[agentIndex];
        const viewInfo = views.get(agent._id);
        if (viewInfo === undefined) {
            throw new Error('Invalid agent');
        }

        let possibleActionsForAgent: [AgentType, PositionType, ActionType][] = [];

        if (viewInfo instanceof NonDeterminism) {
            // Get all possible choices for this agent
            const allChoices = viewInfo.getAllChoices();
            const seenActions = new Set<string>();
            
            for (const choice of allChoices) {
                const {view, inverse} = viewInfo.f(choice);
                const {targetLocation, action} = agent.action(view);
                const targetPos = inverse(targetLocation);
                
                // Create a unique key for this action
                const actionKey = JSON.stringify({pos: targetPos, action});
                
                // Only add if we haven't seen this action before
                if (!seenActions.has(actionKey)) {
                    seenActions.add(actionKey);
                    possibleActionsForAgent.push([agent.clone() as AgentType, targetPos, action as ActionType]);
                }
            }
        } else {
            const {view, inverse} = viewInfo;
            const {targetLocation, action} = agent.action(view);
            possibleActionsForAgent.push([agent.clone() as AgentType, inverse(targetLocation), action as ActionType]);
        }

        // Generate all combinations by combining this agent's actions with the rest
        const allCombinations: [AgentType, PositionType, ActionType][][] = [];
        for (const action of possibleActionsForAgent) {
            const newActions = [...currentActions, action];
            const restCombinations = generateCombinations(agentIndex + 1, newActions);
            allCombinations.push(...restCombinations);
        }

        return allCombinations;
    };

    return generateCombinations(0, []);
}