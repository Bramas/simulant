import { Config, SystemInfo, ViewType, execute } from "@bramas/simulant-core/lib/system";

import { SequenceHelper } from "@bramas/simulant-core/lib/helpers";

import { default as Ring, AbstractGraphAgent, RingConfigType, RingViewType, RingModel, LocationStateType } from "@bramas/simulant-core/models/ring-pebble";
import { Movements, PebbleActions } from "@bramas/simulant-core/models/ring-pebble";
import RingPebbleWithEmergingBH, { PositionState } from "@bramas/simulant-core/models/ring_pebble_with_emerging_bh";
import { Actions } from "@bramas/simulant-core/models/ring";
import { algo6, proc2 } from "./algorithms";
import type { AlgorithmStructure } from "@bramas/simulant-core/types/algorithm-structure";

type VisibleMemory = {
    id: number, 
    state: any, 
    bh: number | null, 
    direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE,
    sync: number,
};

type GeneratorYield = {
    move: Movements;
    action: PebbleActions;
    line: number;
    bh: number | null;
    direction: Movements.CLOCKWISE | Movements.COUNTERCLOCKWISE;
    sync: number;
    algorithm?: string; // Track which algorithm/procedure this is from
};

// cautious walk helper function
type MatchingFunction = (memory: VisibleMemory) => boolean;

function oppositeDirection(direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE): Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE {
    return direction === Movements.COUNTERCLOCKWISE ? Movements.CLOCKWISE : Movements.COUNTERCLOCKWISE;
}

function matchingAgentSync(view: LocationStateType<VisibleMemory>, matching_agent: MatchingFunction): number | null {
    let s = view.agents.reduce((p:VisibleMemory | null, v) => matching_agent(v) ? v : p, null);
    if(s === null) return null;
    return s.sync;
}
function matchingAgentDirection(view: LocationStateType<VisibleMemory>, matching_agent: MatchingFunction): number | null {
    let s = view.agents.reduce((p:VisibleMemory | null, v) => matching_agent(v) ? v : p, null);
    if(s === null) return null;
    return s.direction;
}


function bhAt(direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE): number {
    // return the position of the black hole relative to the agent
    return direction === Movements.COUNTERCLOCKWISE ? -1 : 1;
}
function bhAtOpp(direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE): number {
    // return the position of the black hole relative to the agent
    return direction === Movements.COUNTERCLOCKWISE ? 1 : -1;
}

function* cautiousWalkLeader(matching_follower : MatchingFunction, direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    let bh: null | number = null;
    let sync = 0; // synchronization counter

    // Helper function to create yield objects
    const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, direction, sync, algorithm: 'proc2'});
    while (true) {
        line = 5;
        sync = 1;
        let view = yield m(direction, PebbleActions.PICKUP);

        if(view.agents.length > 0 || view.pebble === true) {
            // if there is a pebble or an agent, we turn around
            direction = oppositeDirection(direction);
            line = 8;
            sync = 0;
            view = yield m(direction, PebbleActions.NONE);
            // wait for the other to see the change of direction

            while(true) {
                let other_dir = matchingAgentDirection(view, matching_follower);
                if(other_dir === null || other_dir === direction) {
                    //if the other agent has moved or changed its sync, we can continue
                    break;
                }
                line = 9;
                view = yield m(Movements.IDLE, PebbleActions.NONE);
            }

            continue;
        }
        line = 12;
        view = yield m(oppositeDirection(direction), PebbleActions.DROP);

        //wait for the other to see me
        while(true) {
            let other_sync = matchingAgentSync(view, matching_follower);
            if(other_sync === null || other_sync === 1) {
                //if the other agent has moved or changed its sync, we can continue
                break;
            }
            line = 13;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }
        sync = 2;
        line = 15;
        view = yield m(direction, PebbleActions.NONE);

        //wait to see the other
        while(true) {
            bh = bhAtOpp(direction);
            let other_sync = matchingAgentSync(view, matching_follower);
            if(other_sync !== null && (other_sync === 2 || other_sync === 0)) {
                // if the other agent is in sync, we can continue
                sync = 0;
                break;
            }
            line = 16;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }

        //wait for the other to see me
        while(true) {
            let other_sync = matchingAgentSync(view, matching_follower);
            if(other_sync === null || other_sync !== 2) {
                //if the other agent has moved or changed its sync, we can continue
                break;
            }
            line = 18;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }
    }
}


function* cautiousWalkWaiter(matching_leader : MatchingFunction, direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    let bh: null | number = null;
    let sync = 0; // synchronization counter

    // Helper function to create yield objects
    const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, direction, sync, algorithm: 'proc2'});
    while (true) {
        line = 21;
        let view = yield m(Movements.IDLE, PebbleActions.NONE);

        //wait to see the other
        let other_dir : Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE | null = null;
        while(true) {
            bh = bhAt(direction);
            let other_sync = matchingAgentSync(view, matching_leader);
            other_dir = matchingAgentDirection(view, matching_leader);
            if(other_sync !== null && other_sync === 1) {
                // if the other agent is in sync, we can continue
                break;
            }
            if(other_dir !== null && other_dir !== direction) {
                break;
            }
            line = 21;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }
        console.log('Waiter after the other returns', other_dir, direction);
        if(other_dir !== null && other_dir !== direction) {
            direction = other_dir;
            continue;
        }

        sync = 2;
        line = 26;
        view = yield m(direction, PebbleActions.NONE);


        //wait to see the other
        while(true) {
            bh = bhAtOpp(direction);
            let other_sync = matchingAgentSync(view, matching_leader);
            if(other_sync !== null && (other_sync === 2 || other_sync === 0)) {
                // if the other agent is in sync, we can continue
                sync = 0;
                break;
            }
            line = 27;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }

        //wait for the other to see me
        while(true) {
            let other_sync = matchingAgentSync(view, matching_leader);
            if(other_sync === null || other_sync !== 2) {
                //if the other agent has moved or changed its sync, we can continue
                break;
            }
            line = 27;
            view = yield m(Movements.IDLE, PebbleActions.NONE);
        }
    }
}


class Agent1 extends AbstractGraphAgent<VisibleMemory> {
    public state: 'SEQUENCE' | 'STOP';
    private actionGenerator: Generator<GeneratorYield, void, LocationStateType<VisibleMemory>>;
    public line: number;
    public currentAlgorithm: string; // Track which algorithm/procedure is executing
    private inputHistory: LocationStateType<VisibleMemory>[];
    public bh: null | number;
    public N: number;
    public direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE;
    public sync: number = 0; // synchronization counter 

    constructor(id: number, N: number) {
        super(id, 0);  // Start with _pos as 0
        this.state = 'SEQUENCE';
        this.line = 1;
        this.currentAlgorithm = 'algo6'; // Start in main algorithm
        this.bh = null; // BH is not known at the start
        this.inputHistory = [];
        this.N = N; // Store the ring size
        this.actionGenerator = this.createActionSequence(id, N);
        this.direction = Movements.CLOCKWISE; // Default direction
    }

    visibleMemory(): VisibleMemory {
        return {id: this._id, state: this.state, bh: this.bh, direction: this.direction, sync: this.sync};
    }

    toString(): string {
        return `bh:${this.bh ?? '?'}, sync:${this.sync}, dir:${this.direction === Movements.CLOCKWISE ? 'CW' : 'CCW'}`;
    }

    *createActionSequence(id:number, N:number): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {

        let line = 1;
        let bh: null | number = null;
        let direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE = Movements.CLOCKWISE;  
        let sync = 0; // synchronization counter      
        
        let randomSeed = id + 49841 // to simulate pseudo-randomly some latency
        let nextRandom = () => {
            randomSeed = randomSeed * 48271 % 2147483647;
            return randomSeed;
        }

        // Helper function to create yield objects
        const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, direction, sync, algorithm: 'algo6'});

        let view
        line = 3;
        while (true) {
            if(id === 0 || id === 1) {
                line = 2;
                let view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);

                line = 3;
                // Agent 0 and 1 are cautious walkers
                if (id === 0) {
                    // Agent 0 is the leader
                    let c = cautiousWalkLeader(
                        (memory: VisibleMemory) => memory.id === 1,
                        direction, m(direction, PebbleActions.NONE));
                    while (true) {

                        while(nextRandom() % 3 == 0) {
                            line = -1;
                            view = yield m(Movements.IDLE, PebbleActions.NONE);
                        }
                        const result = c.next(view);
                        if (result.done) {
                            console.log('leader: cautious walk finished');
                            return;
                        }
                        sync = result.value.sync;
                        direction = result.value.direction;
                        bh = result.value.bh;
                        view = yield result.value;
                    }
                } else {
                    // Agent 1 is the waiter
                    let c = cautiousWalkWaiter(
                        (memory: VisibleMemory) => memory.id === 0,
                        direction,
                        m(direction, PebbleActions.NONE)
                    );
                    while (true) {
                        while(nextRandom() % 3 == 0) {
                            line = -1;
                            view = yield m(Movements.IDLE, PebbleActions.NONE);
                        }
                        const result = c.next(view);
                        if (result.done) {
                            console.log('waiter: cautious walk finished');
                            return;
                        }
                        sync = result.value.sync;
                        direction = result.value.direction;
                        bh = result.value.bh;
                        view = yield result.value;
                    }
                }
                return
            } else {
                line = 5;
                let view = yield m(Movements.IDLE, PebbleActions.NONE);

                line = 6;
                // Agent 2 is a traveler
                if (id === 2) {
                    // Agent 0 is the leader
                    let c = cautiousWalkLeader(
                        (memory: VisibleMemory) => memory.id === 3,
                        direction, m(direction, PebbleActions.NONE));
                    while (true) {

                        while(nextRandom() % 5 == 0) { // group 2 is faster
                            line = -1;
                            view = yield m(Movements.IDLE, PebbleActions.NONE);
                        }
                        const result = c.next(view);
                        if (result.done) {
                            console.log('leader: cautious walk finished');
                            return;
                        }
                        sync = result.value.sync;
                        direction = result.value.direction;
                        bh = result.value.bh;
                        view = yield result.value;
                    }
                } else {
                    // Agent 3 is the waiter
                    let c = cautiousWalkWaiter(
                        (memory: VisibleMemory) => memory.id === 2,
                        direction,
                        m(direction, PebbleActions.NONE)
                    );
                    while (true) {
                        while(nextRandom() % 5 == 0) { // group 2 is faster
                            line = -1;
                            view = yield m(Movements.IDLE, PebbleActions.NONE);
                        }
                        const result = c.next(view);
                        if (result.done) {
                            console.log('waiter: cautious walk finished');
                            return;
                        }
                        sync = result.value.sync;
                        direction = result.value.direction;
                        bh = result.value.bh;
                        view = yield result.value;
                    }
                }
                return
            }
        }
    }

    action(view_all: ViewType<Movements, LocationStateType<VisibleMemory>>) {
        let view = view_all.get(Movements.IDLE) as LocationStateType<VisibleMemory>;
        if (this.state === 'SEQUENCE') {
            // Store the input in history for cloning purposes
            this.inputHistory.push(view);
            
            const result = this.actionGenerator.next(view);
            
            if (result.done) {
                // Restart generator if needed
                this.state = 'STOP';
                return {
                    targetLocation: Movements.IDLE,
                    action: PebbleActions.NONE
                };
            }
            
            // Update agent state from generator yield
            const {move, action, line, bh, direction, sync, algorithm} = result.value;
            
            console.log(`Agent ${this._id} at line ${line}, move: ${move}, action: ${action}, sync: ${sync}, bh: ${bh}, algorithm: ${algorithm}`);

            this.line = line;
            this.bh = bh;
            this.direction = direction;
            this.sync = sync;
            if (algorithm) {
                this.currentAlgorithm = algorithm;
            }
            
            return {
                targetLocation: move,
                action: action
            };
        }
        
        return {
            targetLocation: Movements.IDLE,
            action: PebbleActions.NONE
        };
    }

    private replayHistoryOnGenerator(generator: Generator<GeneratorYield, void, LocationStateType<VisibleMemory>>) {
        // Replay all stored inputs on the generator to bring it to the same state
        for (const input of this.inputHistory) {
            const result = generator.next(input);
            if (result.done) break;
        }
    }

    clone(): Agent1 {
        let a = new Agent1(this._id, this.N);
        a._pos = this._pos;
        a.state = this.state;
        a.line = this.line;
        a.currentAlgorithm = this.currentAlgorithm; // Copy current algorithm
        a.bh = this.bh;
        a.direction = this.direction;
        a.sync = this.sync;
        
        // Copy the input history
        a.inputHistory = [...this.inputHistory];
        
        // Create a new generator and replay the history to get to the same state
        a.actionGenerator = a.createActionSequence(this._id, this.N);
        a.replayHistoryOnGenerator(a.actionGenerator);
        
        return a;
    }
}

type MyConfig = RingConfigType<Agent1, VisibleMemory, PositionState>;


// setup function
export function setup(settings: null | {N: string, BH_node: string}) {

    let N = 10;
    let BH_node = 0;

    if(settings) {
        N = parseInt(settings.N);
        BH_node = parseInt(settings.BH_node);
    }


    const agents = [new Agent1(0, N), new Agent1(1, N), new Agent1(2, N), new Agent1(3, N)];

    let initialConfig = new Config() as MyConfig;
    initialConfig.addAgent(0, agents[0]);
    initialConfig.addAgent(0, agents[1]);
    initialConfig.addAgent(0, agents[2]);
    initialConfig.addAgent(0, agents[3]);


    const model = RingPebbleWithEmergingBH(N, agents as any, initialConfig as any, BH_node);

    return {
        ...model,
        BH_node,
    };
}


// drawConfig function - used by ConfigGraphGenerator (no SolidJS dependencies)
export function drawConfig(ctx: CanvasRenderingContext2D, config: MyConfig, system: RingModel<Agent1, any>, options: any = {}) {
    const {
        centerX = 150,
        centerY = 150,
        radius = 100
    } = options;
    
    const N = system.N;

    // clear the canvas
    // ctx.clearRect(0, 0, 300, 300);

    // draw a big circle where the agents will be arranged
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); 
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();

    for(const p of Array(N).keys()) {
        //draw a small segment (a small line) for each position

        ctx.beginPath();
        ctx.moveTo(centerX + radius * 0.9 * Math.cos(-Math.PI/2+ 2 * Math.PI * p / N), centerY + radius * 0.9 * Math.sin(-Math.PI/2+ 2 * Math.PI * p / N))
        ctx.lineTo(centerX + radius * Math.cos(-Math.PI/2+ 2 * Math.PI * p / N), centerY + radius * Math.sin(-Math.PI/2+ 2 * Math.PI * p / N));
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.stroke();
        // draw the number of the node
        ctx.fillStyle = "black";
        ctx.font = "12px Arial";
        ctx.fillText('u'+p, centerX + radius * 0.8 * Math.cos(-Math.PI/2+ 2 * Math.PI * p / N) - 5, centerY + radius * 0.8 * Math.sin(-Math.PI/2+ 2 * Math.PI * p / N) + 5);

        const node = config.get(p);
        // if there is a pebble, draw it
        if(node && node.state?.pebble) {
            ctx.beginPath();
            ctx.arc(centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * p / N), centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * p / N), 5, 0, 2 * Math.PI);
            ctx.fillStyle = "black";
            ctx.fill();
        }

        if(node) {
            for(const agent of node.agents) {
                //draw each agent with different colors and radius
                ctx.fillStyle = agent._id == 0 
                                ? "red" 
                                : agent._id == 1
                                ? "green"
                                : agent._id == 2
                                ? "blue"
                                : "#a855f7";
                const agentRadius = agent._id == 0 
                ? radius * 1.07 
                : (agent._id == 1
                    ? radius * 1.21
                    : (agent._id == 2
                        ? radius * 1.14
                        : radius * 1.28
                    )
                );

                ctx.beginPath();
                ctx.arc(centerX + agentRadius * Math.cos(-Math.PI/2 + 2 * Math.PI * p / N), centerY + agentRadius * Math.sin(-Math.PI/2 + 2 * Math.PI * p / N), 7, 0, 2 * Math.PI);
                ctx.lineWidth = 1;
                ctx.strokeStyle = "white";
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    let BH_node = (system as any).BH_node as number;
    const bhNode = config.get(BH_node);
    if(bhNode && bhNode.state?.isBH) {
        //draw a red cross at the BH node
        ctx.beginPath();
        ctx.moveTo(
            centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * (BH_node+0.1) / N), 
            centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * (BH_node+0.1) / N));
        ctx.lineTo(
            centerX + radius * 1.05 * Math.cos(-Math.PI/2+ 2 * Math.PI * (BH_node-0.1) / N), 
            centerY + radius * 1.05 * Math.sin(-Math.PI/2+ 2 * Math.PI * (BH_node-0.1) / N));
        ctx.moveTo(
            centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * (BH_node-0.1) / N), 
            centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * (BH_node-0.1) / N));
        ctx.lineTo(
            centerX + radius * 1.05 * Math.cos(-Math.PI/2+ 2 * Math.PI * (BH_node+0.1) / N), 
            centerY + radius * 1.05 * Math.sin(-Math.PI/2+ 2 * Math.PI * (BH_node+0.1) / N));
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// Schema déclaratif pour l'éditeur (sans dépendances SolidJS)
export const editorSchema = {
  fields: [
    {
      type: 'number' as const,
      key: 'N',
      label: 'N (ring size)',
      defaultValue: 10,
      min: 2
    },
    {
      type: 'number' as const,
      key: 'BH_node',
      label: 'BH node',
      defaultValue: 0,
      min: 0
    }
  ]
};

// Types for settings
export type BlackHoleSettings = {
    N: string;
    BH_node: string;
};

// Generate test configurations for the black hole search algorithm
export function* settingsGenerator(): Generator<BlackHoleSettings> {
    // Test with various ring sizes
    for (let N = 5; N <= 12; N++) {
        // Test with black hole at different positions
        for (let BH_node = 0; BH_node < N; BH_node++) {
            yield {
                N: N.toString(),
                BH_node: BH_node.toString()
            };
        }
    }
}

// Check if the execution is successful (BH found), failed (all agents lost), or still in progress
export function checkExecutionStatus(config: any, model: any, configHistory: any[]): 'success' | 'failure' | 'inProgress' {
    const agents = config.clone_agents();
    const N = model.N as number;
    const BH_node = model.BH_node as number;
    const bhActive = config.get(BH_node).state?.isBH;
    
    // Check if all agents have found the black hole location
    const allAgentsFoundBH = agents.length > 0 && agents.every((agent: any) => {
        if (agent.bh === null) return false;
        const allegedBH = (agent._pos + agent.bh + N) % N;
        return allegedBH === BH_node;
    });
    
    if (allAgentsFoundBH) {
        return bhActive ? 'success' : 'failure';
    }
    
    // Check if all agents are lost (no agents remaining)
    if (agents.length === 0) {
        return 'failure'; // All agents fell into the black hole
    }    
    
    // Check for timeout (too many rounds without resolution)
    if (config.round > 10 * N * N) {
        return bhActive ? 'failure' : 'success';
    }
    
    return 'inProgress';
}

// Helper function to create a string representation of the configuration
export function debugConfig(config: any, model: any): string {
    const N = model.N;
    const result = [];
    
    for (let i = 0; i < N; i++) {
        const node = config.get(i);
        const agentsStr = node.agents.map((a: any) => `${a._id}(${a.toString()})`).sort().join(',');
        const stateStr = node.state?.isBH ? 'X' : (!node.state?.isBH ? 'S' : JSON.stringify(node.state));
        result.push(`${stateStr}:${agentsStr || '.'}`);
    }
    
    return result.join('|');
}

export { checkExecutionStatus as executionStatusChecker };

// Informations pour l'affichage de l'algorithme
export function getAlgorithmViewInfo(config: MyConfig) {
    const agents = config.clone_agents();
    const agentStates = agents
        .sort((a, b) => a._id - b._id)
        .map(agent => ({
            agentId: `a₍${agent._id + 1}₎`,
            currentLine: agent.line || 1,
            currentAlgorithm: agent.currentAlgorithm || 'algo6',
            color: ['#ef4444', '#22c55e', '#3b82f6', '#a855f7'][agent._id] || '#6b7280',
            stateDescription: agent.toString()
        }));
    
    return {
        algorithm: algo6,
        procedures: [proc2],
        agentStates
    };
}

// ConfigView and Checker components removed - use drawConfig function and AlgorithmChecker with settingsGenerator


