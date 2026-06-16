import { Config, SystemInfo, execute } from "@bramas/simulant-core/lib/system";

import { SequenceHelper } from "@bramas/simulant-core/lib/helpers";

import { Actions, default as Ring, AbstractGraphAgent, RingConfigType, RingViewType, RingModel, LocationStateType } from "@bramas/simulant-core/models/ring";
import EmergingRing, { PositionState } from "@bramas/simulant-core/models/ring_with_emerging_bh";
import { algo5, proc1 } from "./algorithms";
import type { AlgorithmStructure } from "@bramas/simulant-core/types/algorithm-structure";

type Role = 'TRAVELER' | 'WAITER' | 'NEXT-TRAVELER'

type VisibleMemory = {id: number, state: any, bh: number | null, node:number, dir:number};

type GeneratorYield = {
    action: Actions;
    line: number;
    bh: number | null;
    algorithm?: string; // Track which algorithm/procedure this is from
    node:number;
    dir:number;
};

// cautious walk helper function
type MatchingFunction = (memory: VisibleMemory) => boolean;

function* cautiousWalkLeader(direction: Actions.COUNTERCLOCKWISE | Actions.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    const m = (action: Actions) => ({...yieldValues, action, line, algorithm: 'proc1'});
    while (true) {
        line = 3;
        yield m(direction);
        line = 4;
        yield m(direction == Actions.COUNTERCLOCKWISE ? Actions.CLOCKWISE : Actions.COUNTERCLOCKWISE);
        line = 5;
        yield m(direction);
    }
}

function* cautiousWalkWaiter(matching_leader : MatchingFunction, direction: Actions.COUNTERCLOCKWISE | Actions.CLOCKWISE, yieldValues: GeneratorYield): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    // Helper function to create yield objects
    let line = 1;
    let bh: null | number = null;
    const m = (action: Actions) => ({...yieldValues, action, line, bh, algorithm: 'proc1'});
    while (true) {
        line = 8;
        yield m(Actions.IDLE);
        line = 9;
        let view = yield m(Actions.IDLE);
        // if none of the agents matches
        if(!view.reduce((p, v) => p || matching_leader(v), false)) {
            console.log('BH found while cautious walking');
            bh = direction == Actions.COUNTERCLOCKWISE ? -1 : 1;
            line = 12;
            yield m(Actions.IDLE);
            return;
        }
        line = 13;
        yield m(direction);
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
    public node: number;
    public dir: number;

    constructor(id: number, N: number) {
        super(id, 0);  // Start with _pos as 0
        this.state = 'SEQUENCE';
        this.line = 1;
        this.node = 0;
        this.dir = 1;
        this.currentAlgorithm = 'algo5'; // Start in main algorithm
        this.bh = null; // BH is not known at the start
        this.inputHistory = [];
        this.N = N; // Store the number of positions in the ring
        this.actionGenerator = this.createActionSequence(id, N);
    }

    visibleMemory(): VisibleMemory {
        return {id: this._id, state: this.state, bh: this.bh, node: this.node, dir: this.dir};
    }

    toString(): string {
        return `bh:${this.bh ?? '?'}, node:${this.node}, dir:${this.dir}, l=${this.line}`;
    }

    *createActionSequence(id:number, N:number): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
    
        let line = 1;
        let bh = id;
        let randomSeed = id // to simulate pseudo-randomly some latency
        let nextRandom = () => {
            randomSeed = randomSeed * 48271 % 2147483647
            return randomSeed;
        }

        let direction = Actions.CLOCKWISE;
        let node = 0;

        // Helper function to create yield objects
        const m = (action: Actions) => ({action, line, bh, algorithm: 'algo5', node, dir: direction});

        if(id === 0) {
            node = 1; // Start from the next node
            line = 5;
            yield m(direction); 
        }
        let nextNode = () => direction === Actions.CLOCKWISE ? (node + 1) % N : (node - 1 + N) % N;
        while (true) {
            if(nextNode() === id) {
                direction = direction === Actions.CLOCKWISE ? Actions.COUNTERCLOCKWISE : Actions.CLOCKWISE;
            }
            while(nextRandom() % 2) {
                yield m(Actions.IDLE);
            }
            line = 12;
            node = nextNode();
            yield m(direction);
        }
    }

    action_simpl(view: LocationStateType<VisibleMemory>) {
        if (this.state === 'SEQUENCE') {
            // Store the input in history for cloning purposes
            this.inputHistory.push(view);
            
            const result = this.actionGenerator.next(view);
            
            if (result.done) {
                // Restart generator if needed
                this.state = 'STOP';
                return Actions.IDLE;
            }
            
            // Update agent state from generator yield
            const {action, line, bh, algorithm, node, dir} = result.value;
            this.line = line;
            this.bh = bh;
            this.node = node;
            this.dir = dir;
            if (algorithm) {
                this.currentAlgorithm = algorithm;
            }
            
            return action;
        }
        
        return Actions.IDLE;
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
        a.node = this.node;
        a.dir = this.dir;
        
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
    const agents = []
    for(let i = 0; i < N; i++) {
        agents.push(new Agent1(i, N));
    }

    let initialConfig = new Config() as MyConfig;
    for(let i = 0; i < N; i++) {
        initialConfig.addAgent(0, agents[i]);
    }

    const model = EmergingRing(N, agents as any, initialConfig as any, BH_node);

    return {
        ...model,
        BH_node,
    };
}


// drawConfig function - used by ConfigGraphGenerator (no SolidJS dependencies)
export function drawConfig(ctx: CanvasRenderingContext2D, config: MyConfig, system: RingModel<Agent1, any, PositionState>, options: any = {}) {
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

        let agentRadius = radius;
        for(const agent of config.get(p).agents) {
            //draw each agent in black with increasing radius
            ctx.fillStyle = "black";
            agentRadius += radius * 0.1;
            ctx.beginPath();
            ctx.arc(centerX + agentRadius * Math.cos(-Math.PI/2 + 2 * Math.PI * p / N), centerY + agentRadius * Math.sin(-Math.PI/2 + 2 * Math.PI * p / N), 7, 0, 2 * Math.PI);
            ctx.lineWidth = 1;
            ctx.strokeStyle = "white";
            ctx.fill();
            ctx.stroke();
        }
    }

    let BH_node = (system as any).BH_node as number;
    if(config.get(BH_node).state?.isBH) {
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
    for (let N = 2; N <= 12; N++) {
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
        const stateStr = node.state.isBH ? 'X' : (!node.state?.isBH ? 'S' : JSON.stringify(node.state));
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
            currentAlgorithm: agent.currentAlgorithm || 'algo5',
            color: ['#000000', '#111111', '#222222', '#333333', '#444444'][agent._id % 5] || '#6b7280',
            stateDescription: agent.toString()
        }));
    
    return {
        algorithm: algo5,
        procedures: [proc1],
        agentStates
    };
}

// ConfigView and Checker components removed - use drawConfig function and AlgorithmChecker with settingsGenerator


