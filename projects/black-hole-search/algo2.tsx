import { Config, SystemInfo, ViewType, execute } from "@bramas/simulant-core/lib/system";

import { SequenceHelper } from "@bramas/simulant-core/lib/helpers";

import { default as Ring, AbstractGraphAgent, RingConfigType, RingViewType, RingModel, LocationStateType } from "@bramas/simulant-core/models/ring-pebble";
import EmergingRing, { PositionState } from "@bramas/simulant-core/models/ring_pebble_with_emerging_bh";
import { Movements, PebbleActions } from "@bramas/simulant-core/models/ring-pebble";
import { Actions } from "@bramas/simulant-core/models/ring";
import { algo2, proc1 } from "./algorithms";
import type { AlgorithmStructure } from "@bramas/simulant-core/types/algorithm-structure";

type VisibleMemory = {id: number, state: any, bh: number | null, detection: boolean};

type GeneratorYield = {
    move: Movements;
    action: PebbleActions;
    line: number;
    bh: number | null;
    detection: boolean;
    algorithm?: string; // Track which algorithm/procedure this is from
};

// cautious walk helper function
type MatchingFunction = (memory: VisibleMemory) => boolean;

function* cautiousWalkLeader(direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    let bh: null | number = null;
    // Helper function to create yield objects
    const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, detection:false, algorithm: 'proc1'});
    while (true) {
        line = 3;
        yield m(direction, PebbleActions.NONE);
        line = 4;
        yield m(direction == Movements.COUNTERCLOCKWISE ? Movements.CLOCKWISE : Movements.COUNTERCLOCKWISE, PebbleActions.NONE);
        line = 5;
        yield m(direction, PebbleActions.NONE);
    }
}

function* cautiousWalkWaiter(matching_leader : MatchingFunction, direction: Movements.COUNTERCLOCKWISE | Movements.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    let bh: null | number = null;
    // Helper function to create yield objects
    const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, detection:false, algorithm: 'proc1'});
    while (true) {
        line = 8;
        yield m(Movements.IDLE, PebbleActions.NONE);
        line = 9;
        let view = yield m(Movements.IDLE, PebbleActions.NONE);
        // if none of the agents matches
        if(!view.agents.reduce((p, v) => p || matching_leader(v), false)) {
            console.log('BH found while cautious walking');
            bh = direction == Movements.COUNTERCLOCKWISE ? -1 : 1;
            line = 12;
            yield m(Movements.IDLE, PebbleActions.NONE);
            return;
        }
        line = 13;
        yield m(direction, PebbleActions.NONE);
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
    public detection: boolean = false; // To track if the agent has detected a black hole

    constructor(id: number, N: number) {
        super(id, 0);  // Start with _pos as 0
        this.state = 'SEQUENCE';
        this.line = 1;
        this.currentAlgorithm = 'algo2'; // Start in main algorithm
        this.bh = null; // BH is not known at the start
        this.inputHistory = [];
        this.N = N; // Store the ring size
        this.actionGenerator = this.createActionSequence(id, N);
    }

    visibleMemory(): VisibleMemory {
        return {id: this._id, state: this.state, bh: this.bh, detection: this.detection};
    }

    *createActionSequence(id:number, N:number): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    
        let line = 1;
        let bh: null | number = null;
        let detection = false;

        // Helper function to create yield objects
        const m = (move: Movements, action: PebbleActions) => ({action, move, line, bh, detection});
    
        line = 2;
        let view;

        if(id === 0) {
            line = 2;
            view = yield m(Movements.COUNTERCLOCKWISE, PebbleActions.NONE);
        }
        else if(id === 1) {
            line = 11;
            view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
        }
        else {
            line = 22;
            view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
        }

        while (true) {
            if(id === 0) {
                line = 4;
                view = yield m(Movements.CLOCKWISE, PebbleActions.DROP);
                if(view.agents.length === 0) {
                    // If no agents are present, there is a black hole
                    bh = 1;
                    line = 7;
                    yield m(Movements.IDLE, PebbleActions.NONE);
                    return;
                }

                line = 8;
                view = yield m(Movements.COUNTERCLOCKWISE, PebbleActions.NONE);

                line = 9;
                view = yield m(Movements.CLOCKWISE, PebbleActions.PICKUP);
            } else if(id === 1) {
                line = 13;
                view = yield m(Movements.COUNTERCLOCKWISE, PebbleActions.NONE);

                if(view.agents.length === 0) {
                    // If no agents are present, there is a black hole somewhere, need a cautious walk
                    line = 15;
                    yield m(Movements.CLOCKWISE, PebbleActions.NONE);
                    detection = true;
                    line = 17;
                    yield m(Movements.CLOCKWISE, PebbleActions.NONE);
                    line = 18;

                    let c = cautiousWalkLeader(Movements.COUNTERCLOCKWISE, m(Movements.IDLE, PebbleActions.NONE));
                    while (true) {
                        const result = c.next(view);
                        if (result.done) {
                            console.log('leader: cautious walk finished');
                            return;
                        }
                        view = yield result.value;
                    }

                    return;
                }

                line = 19;
                view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);

                line = 20;
                view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
            } else {
                if(view.agents.length === 0) {
                    // If no agents are present, there is a black hole somewhere, need a cautious walk
                    line = 26;
                    view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
                    while(true) {
                        if(view.pebble === true) {
                            // the blackhole is adjacent
                            bh = 1;
                            line = 28;
                            view = yield m(Movements.IDLE, PebbleActions.NONE);
                            return;
                        }
                        line = 26;
                        view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
                    }
                    return;
                }
                // if the other agent has detected a black hole, we need to cautious walk
                if(view.agents.some((a: VisibleMemory) => a.detection)) {
                    line = 30;
                    let c = cautiousWalkWaiter((agent) => true, Movements.COUNTERCLOCKWISE, m(Movements.IDLE, PebbleActions.NONE));
                    while (true) {
                        const result = c.next(view);
                        if (result.done) {
                            console.log('waiter: cautious walk finished');
                            return;
                        }
                        view = yield result.value;
                    }
                }
                line = 31;
                view = yield m(Movements.CLOCKWISE, PebbleActions.NONE);
                line = 32;
                view = yield m(Movements.IDLE, PebbleActions.NONE);
                line = 32;
                view = yield m(Movements.IDLE, PebbleActions.NONE);
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
            const {move, action, line, bh, detection, algorithm} = result.value;

            console.log(`Agent ${this._id} at line ${line}, move: ${move}, action: ${action}, bh: ${bh}, algorithm: ${algorithm}`);

            this.line = line;
            this.bh = bh;
            this.detection = detection;
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

    toString(): string {
        return `line: ${this.line}, bh relative position: ${this.bh}, l=${this.line}`;
    }

    clone(): Agent1 {
        let a = new Agent1(this._id, this.N);
        a._pos = this._pos;
        a.state = this.state;
        a.line = this.line;
        a.currentAlgorithm = this.currentAlgorithm; // Copy current algorithm
        a.bh = this.bh;
        a.detection = this.detection;
        
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


    const agents = [new Agent1(0, N), new Agent1(1, N), new Agent1(2, N)];

    let initialConfig = new Config() as MyConfig;
    initialConfig.addAgent(0, agents[0]);
    initialConfig.addAgent(0, agents[1]);
    initialConfig.addAgent(0, agents[2]);


    const model = EmergingRing(N, agents, initialConfig, BH_node);

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

        // if there is a pebble, draw it
        const state = config.get(p).state as PositionState;
        if(state?.pebble) {
            ctx.beginPath();
            ctx.arc(centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * p / N), centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * p / N), 5, 0, 2 * Math.PI);
            ctx.fillStyle = "black";
            ctx.fill();
        }

        if(state?.isBH) {
            //draw a red cross at the BH node
            ctx.beginPath();
            ctx.moveTo(
                centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * (p+0.1) / N), 
                centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * (p+0.1) / N));
            ctx.lineTo(
                centerX + radius * 1.05 * Math.cos(-Math.PI/2+ 2 * Math.PI * (p-0.1) / N), 
                centerY + radius * 1.05 * Math.sin(-Math.PI/2+ 2 * Math.PI * (p-0.1) / N));
            ctx.moveTo(
                centerX + radius * 0.95 * Math.cos(-Math.PI/2+ 2 * Math.PI * (p-0.1) / N), 
                centerY + radius * 0.95 * Math.sin(-Math.PI/2+ 2 * Math.PI * (p-0.1) / N));
            ctx.lineTo(
                centerX + radius * 1.05 * Math.cos(-Math.PI/2+ 2 * Math.PI * (p+0.1) / N), 
                centerY + radius * 1.05 * Math.sin(-Math.PI/2+ 2 * Math.PI * (p+0.1) / N));
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        for(const agent of config.get(p).agents) {
            //draw each agent
            ctx.fillStyle = agent._id == 0 ? "#ef4444" : (agent._id == 1 ? "#22c55e" : "#3b82f6");
            const agentRadius = radius * 1.1 + (agent._id % 3) * 15;

            ctx.beginPath();
            ctx.arc(centerX + agentRadius * Math.cos(-Math.PI/2 + 2 * Math.PI * p / N), centerY + agentRadius * Math.sin(-Math.PI/2 + 2 * Math.PI * p / N), 7, 0, 2 * Math.PI);
            ctx.lineWidth = 1;
            ctx.strokeStyle = "white";
            ctx.fill();
            ctx.stroke();
        }
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
      min: 5
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
export function checkExecutionStatus(config: MyConfig, model: any, configHistory: any[]): 'success' | 'failure' | 'inProgress' {
    const agents = config.clone_agents();
    const N = model.N as number;
    const BH_node = model.BH_node as number;
    const bhActive = (config.get(BH_node).state as any).isBH;

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
            currentAlgorithm: agent.currentAlgorithm || 'algo2',
            color: ['#ef4444', '#22c55e', '#3b82f6'][agent._id] || '#6b7280',
            stateDescription: agent.toString()
        }));
    
    return {
        algorithm: algo2,
        procedures: [proc1],
        agentStates
    };
}

// ConfigView and Checker components removed - use drawConfig function and AlgorithmChecker with settingsGenerator


