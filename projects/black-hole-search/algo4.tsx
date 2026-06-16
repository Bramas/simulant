import { Config, SystemInfo, execute } from "@mobile-entities/core/lib/system";

import { SequenceHelper } from "@mobile-entities/core/lib/helpers";

import { Actions, default as Ring, AbstractGraphAgent, RingConfigType, RingViewType, RingModel, LocationStateType } from "@mobile-entities/core/models/ring";
import EmergingRing, { PositionState } from "@mobile-entities/core/models/ring_with_emerging_bh";
import { algo4, proc1 } from "./algorithms";
import type { AlgorithmStructure } from "@mobile-entities/core/types/algorithm-structure";

type VisibleMemory = {
    id: number, 
    found_n: boolean, 
    state: any, 
    bh: number | null};

type GeneratorYield = {
    action: Actions;
    line: number;
    right_limit: number;
    found_n: boolean;
    bh: number | null;
    algorithm?: string; // Track which algorithm/procedure this is from
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


// Agent1 class extending Agent
class Agent1 extends AbstractGraphAgent<VisibleMemory> {
    public found_n: boolean;
    public right_limit: number;
    public state: 'SEQUENCE' | 'STOP';
    private actionGenerator: Generator<GeneratorYield, void, LocationStateType<VisibleMemory>>;
    public line: number;
    public currentAlgorithm: string; // Track which algorithm/procedure is executing
    private inputHistory: LocationStateType<VisibleMemory>[];
    public bh: null | number;

    constructor(id: number) {
        super(id, 0);  // Start with _pos as 0
        this.found_n = false;
        this.right_limit = 1;
        this.state = 'SEQUENCE';
        this.line = 1;
        this.currentAlgorithm = 'algo4'; // Start in main algorithm
        this.bh = null; // BH is not known at the start
        this.inputHistory = [];
        this.actionGenerator = this.createActionSequence();
    }

    visibleMemory(): VisibleMemory {
        return {id: this._id, found_n: this.found_n, state: this.state, bh: this.bh};
    }

    toString(): string {
        return `bh:${this.bh ?? '?'}, f_n:${this.found_n}, r_lim:${this.right_limit}, l=${this.line}, l=${this.line}`;
    }

    *createActionSequence(): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
        let line = 1;
        let right_limit = 1;
        let found_n = false;
        let bh: null | number = null;

        // Helper function to create yield objects
        const m = (action: Actions) => ({action, line, right_limit, found_n, bh, algorithm: 'algo4'});
    
        line = 5;
        let view = yield m(Actions.COUNTERCLOCKWISE);

        while (true) {
            if(view.length > 0) {
                console.log(`agent 2 is warning us, we should start a cautious walk`);
                line = 8;
                let c = cautiousWalkLeader(Actions.COUNTERCLOCKWISE, m(Actions.IDLE));
                while (true) {
                    const result = c.next(view);
                    if (result.done) {
                        console.log('agent1: cautious walk finished');
                        return;
                    }
                    view = yield result.value;
                }
            }
            line = 9;
            view = yield m(Actions.COUNTERCLOCKWISE);
            
            line = 10;
            for (let i = 0; i < right_limit-1; i++) {
                view = yield m(Actions.IDLE);
            }
            
            if (view.length > 0) {
                found_n = true;
            }
            
            line = 13;
            for (let i = 0; i < right_limit-1; i++) {
                view = yield m(Actions.IDLE);
            }
            
            line = 14;
            view = yield m(Actions.CLOCKWISE);
            
            line = 15;
            view = yield m(Actions.IDLE);
            if (view.length === 0) {
                console.log('agent1: agent 2 is lost in the BH, the BH is clockwise');
                bh = 1;
                yield m(Actions.IDLE);
                return;
            }

            line = 19;
            view = yield m(Actions.IDLE);
            view = yield m(Actions.IDLE);
            if (!found_n) {
                right_limit += 1;
            }
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
            const {action, line, right_limit, found_n, bh, algorithm} = result.value;
            this.line = line;
            this.right_limit = right_limit;
            this.found_n = found_n;
            this.bh = bh;
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
        let a = new Agent1(this._id);
        a._pos = this._pos;
        a.found_n = this.found_n;
        a.right_limit = this.right_limit;
        a.state = this.state;
        a.line = this.line;
        a.currentAlgorithm = this.currentAlgorithm; // Copy current algorithm
        a.bh = this.bh;
        
        // Copy the input history
        a.inputHistory = [...this.inputHistory];
        
        // Create a new generator and replay the history to get to the same state
        a.actionGenerator = a.createActionSequence();
        a.replayHistoryOnGenerator(a.actionGenerator);
        
        return a;
    }
}

// Agent2 class extending Agent
class Agent2 extends AbstractGraphAgent<VisibleMemory> {
    public found_n: boolean;
    public right_limit: number;
    public state: 'SEQUENCE' | 'STOP';
    private actionGenerator: Generator<GeneratorYield, void, LocationStateType<VisibleMemory>>;
    public line: number;
    public currentAlgorithm: string; // Track which algorithm/procedure is executing
    private inputHistory: LocationStateType<VisibleMemory>[];
    public bh: null | number;

    constructor(id: number) {
        super(id, 0);
        this.found_n = false;
        this.right_limit = 1;
        this.state = 'SEQUENCE';
        this.line = 22;
        this.currentAlgorithm = 'algo4'; // Start in main algorithm
        this.inputHistory = [];
        this.actionGenerator = this.createActionSequence();
        this.bh = null; // BH is not known at the start
    }
    
    visibleMemory(): VisibleMemory {
        return {id: this._id, found_n: this.found_n, state: this.state, bh: this.bh};
    }

    toString(): string {
        return `bh:${this.bh ?? '?'}, f_n:${this.found_n}, r_lim:${this.right_limit}, l=${this.line}`;
    }

    *createActionSequence(): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
        let line = 22;
        let right_limit = 1;
        let found_n = false;
        let bh : null | number = null;

        // Helper function to create yield objects
        const m = (action: Actions) => ({action, line, right_limit, found_n, bh, algorithm: 'algo4'});

        yield m(Actions.IDLE);

        while (true) {
            // Wait phase
            line = 24; 
            for (let i = 0; i < 2 * right_limit; i++) {
                yield m(Actions.IDLE); // 'WAIT'
            }

            line = 25; 
            const view1 = yield m(Actions.COUNTERCLOCKWISE);
            
            if (view1.length === 0) {
                console.log('agent2: agent 1 is lost in the BH, the BH is counter-clockwise');
                bh = -2; // BH is counter-clockwise (after the move it will be at distance 2)
                line = 30; 
                yield m(Actions.CLOCKWISE);
                return;
            }
            if (view1.reduce((p, v) => p || v.found_n, false)) {
                found_n = true;
            }
            
            line = 33; 
            const view2 = yield m(Actions.CLOCKWISE); // 'TESTING'
            
            if (view2.length === 0) {
                console.log('agent2: agent 3 is lost in the BH, BH is somewhere on my right, lets meet with agent 1 to search for it');
                line = 35;
                let view = yield m(Actions.COUNTERCLOCKWISE);

                let c = cautiousWalkWaiter((agent) => agent.id == 0, Actions.COUNTERCLOCKWISE, m(Actions.IDLE));
                while (true) {
                    const result = c.next(view);
                    if (result.done) {
                        console.log('agent2: cautious walk finished');
                        return;
                    }
                    view = yield result.value;
                }

                return;
            }
            
            line = 37;
            const view3 = yield m(Actions.IDLE);
            
            // Increase search limit if no agent found
            if (!found_n) {
                right_limit += 1;
            }
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
            const {action, line, right_limit, found_n, bh, algorithm} = result.value;
            this.line = line;
            this.right_limit = right_limit;
            this.found_n = found_n;
            this.bh = bh;
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

    clone(): Agent2 {
        let a = new Agent2(this._id);
        a._pos = this._pos;
        a.found_n = this.found_n;
        a.right_limit = this.right_limit;
        a.state = this.state;
        a.line = this.line;
        a.currentAlgorithm = this.currentAlgorithm; // Copy current algorithm
        a.bh = this.bh;
        
        // Copy the input history
        a.inputHistory = [...this.inputHistory];
        
        // Create a new generator and replay the history to get to the same state
        a.actionGenerator = a.createActionSequence();
        a.replayHistoryOnGenerator(a.actionGenerator);
        
        return a;
    }
}




// Agent3 class extending Agent
class Agent3 extends AbstractGraphAgent<VisibleMemory> {
    public found_n: boolean;
    public right_limit: number;
    public state: 'SEQUENCE' | 'STOP' | 'u_(-1) is a bh';
    private actionGenerator: Generator<GeneratorYield, void, LocationStateType<VisibleMemory>>;
    public line: number;
    public currentAlgorithm: string; // Track which algorithm/procedure is executing
    private inputHistory: LocationStateType<VisibleMemory>[];
    public bh: null | number;

    constructor(id: number) {
        super(id, 0);  // Start with _pos as 0
        this.found_n = false;
        this.right_limit = 1;
        this.state = 'SEQUENCE';
        this.line = 1;
        this.currentAlgorithm = 'algo4'; // Start in main algorithm
        this.inputHistory = [];
        this.actionGenerator = this.createActionSequence();
        this.bh = null; // BH is not known at the start
    }

    visibleMemory(): VisibleMemory {
        return {id: this._id, found_n: this.found_n, state: this.state, bh: this.bh};
    }

    toString(): string {
        return `bh:${this.bh ?? '?'}, f_n:${this.found_n}, r_lim:${this.right_limit}, l=${this.line}`;
    }

    *createActionSequence(): Generator<GeneratorYield, void, LocationStateType<VisibleMemory>> {
        let line = 1;
        let right_limit = 1;
        let found_n = false;
        let bh: null | number = null;

        // Helper function to create yield objects
        const m = (action: Actions) => ({action, line, right_limit, found_n, bh, algorithm: 'algo4'});

        line = 40;
        
        let view = yield m(Actions.CLOCKWISE);

        while (true) {
            
            
            line = 42;
            for (let i = 0; i < right_limit-1; i++) {
                view = yield m(Actions.CLOCKWISE);
            }
            line = 43;
            view = yield m(Actions.IDLE);
            
            line = 46;
            if (view.length !== 0) {
                found_n = true;
            }
            view = yield m(Actions.IDLE);
            
            
            line = 47;
            for (let i = 0; i < right_limit; i++) {
                yield m(Actions.COUNTERCLOCKWISE);
            }
            
            line = 48;
            view = yield m(Actions.IDLE);
                        
            if (view.length === 0) {
                console.log('agent3: agent 2 is lost in the BH, the BH is counter-clockwise');
                bh = -1; // BH is counter-clockwise
                line = 51;
                yield m(Actions.IDLE);
                return;
            }
            let neighbor_bh = view.reduce((p, v) => v.bh !== null ? v.bh : p, null as null | number);
            if (neighbor_bh !== null) {
                console.log('agent2 found the BH, so we stop as well');
                bh = neighbor_bh;
                line = 54;
                yield m(Actions.IDLE);
                return;
            }
            line = 55;
            yield m(Actions.CLOCKWISE);
            
            if (!found_n) {
                right_limit += 1;
            }
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
            const {action, line, right_limit, found_n, bh, algorithm} = result.value;
            this.line = line;
            this.right_limit = right_limit;
            this.found_n = found_n;
            this.bh = bh;
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

    clone(): Agent3 {
        let a = new Agent3(this._id);
        a._pos = this._pos;
        a.found_n = this.found_n;
        a.right_limit = this.right_limit;
        a.state = this.state;
        a.line = this.line;
        a.currentAlgorithm = this.currentAlgorithm; // Copy current algorithm
        a.bh = this.bh;
        
        // Copy the input history
        a.inputHistory = [...this.inputHistory];
        
        // Create a new generator and replay the history to get to the same state
        a.actionGenerator = a.createActionSequence();
        a.replayHistoryOnGenerator(a.actionGenerator);
        
        return a;
    }
}

type MyConfig = RingConfigType<Agent1 | Agent2 | Agent3, VisibleMemory, PositionState>;



// setup function
export function setup(settings: null | {N: string, BH_node: string}) {

    let N = 10;
    let BH_node = 0;

    if(settings) {
        N = parseInt(settings.N);
        BH_node = parseInt(settings.BH_node);
    }


    const agents = [new Agent1(0), new Agent2(1), new Agent3(2)];

    let initialConfig = new Config() as MyConfig;
    initialConfig.addAgent(0, agents[0]);
    initialConfig.addAgent(0, agents[1]);
    initialConfig.addAgent(0, agents[2]);


    const model = EmergingRing(N, agents as any, initialConfig as any, BH_node);

    return {
        ...model,
        BH_node,
    };
}


// drawConfig function - used by ConfigGraphGenerator (no SolidJS dependencies)
export function drawConfig(ctx: CanvasRenderingContext2D, config: MyConfig, system: RingModel<Agent1 | Agent2 | Agent3, any, PositionState>, options: any = {}) {
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

        for(const agent of config.get(p).agents) {
            //draw each agent - Agent1 in red, Agent2 in green, Agent3 in blue
            //with different radius so they don't overlap
            //if found_n is true, add black stroke

            ctx.fillStyle = agent._id == 0 
                            ? "red" 
                            : agent._id == 1
                            ? "green"
                            : "blue";
            const agentRadius = agent._id == 0 
            ? radius * 1.07 
            : (agent._id == 1
                ? radius * 1.21
                : radius * 1.35
            );

            ctx.beginPath();
            ctx.arc(centerX + agentRadius * Math.cos(-Math.PI/2 + 2 * Math.PI * p / N), centerY + agentRadius * Math.sin(-Math.PI/2 + 2 * Math.PI * p / N), 7, 0, 2 * Math.PI);

            if ((agent as Agent3).found_n) {
                //set the stroke to black and the width to 2
                ctx.lineWidth = 2;
                ctx.strokeStyle = "black";
            } else {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "white";
            }
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
      min: 3
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
    const bhActive = config.get(BH_node).state?.isBH;
    
    // Check if all agents have found the black hole location
    const allAgentsFoundBH = agents.length > 0 && agents.every((agent: any) => {
        if (agent.bh === null) return false;
        const allegedBH = (agent._pos + agent.bh + N) % N;
        return allegedBH === BH_node;
    });
    if(allAgentsFoundBH && !bhActive) {
        console.log(JSON.parse(JSON.stringify(config.get(BH_node))));
        console.log(
            'All agents have wrongly identified the BH location.'
        );
    }
    
    if (allAgentsFoundBH) {
        return bhActive ? 'success' : 'failure';
    }
    
    // Check if all agents are lost (no agents remaining)
    if (agents.length === 0) {
        return 'failure'; // All agents fell into the black hole
    }    
    
    // Check for timeout (too many rounds without resolution)
    //if (config.round > 10 * N * N) {
    //    return bhActive ? 'failure' : 'success';
    //}
    
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
            currentAlgorithm: agent.currentAlgorithm || 'algo4',
            color: ['#ef4444', '#22c55e', '#3b82f6', '#a855f7'][agent._id] || '#6b7280',
            stateDescription: agent.toString()
        }));
    
    return {
        algorithm: algo4,
        procedures: [proc1],
        agentStates
    };
}

// ConfigView and Checker components removed - use drawConfig function and AlgorithmChecker with settingsGenerator


