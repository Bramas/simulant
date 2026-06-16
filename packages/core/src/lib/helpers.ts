


export class SequenceHelper<AgentType, ViewType, ActionType> {
    private _sequence: {
        count: number, 
        f:((view: ViewType, self: AgentType)=>ActionType) | ActionType,
        name?: string
    }[];

    constructor()
    {
        this._sequence = [];
    }
    clone(): SequenceHelper<AgentType, ViewType, ActionType> {
        let s = new SequenceHelper<AgentType, ViewType, ActionType>();
        s._sequence = this._sequence.map(s => ({...s}));
        return s;
    }

    repeat(count: number, f: ((view: ViewType, self: AgentType) => ActionType) | ActionType, name?: string) {
        if (count <= 0) {
            return this;
        }
        this._sequence.push({count, f, name});
        return this;
    }
    once(f: ((view: ViewType, self: AgentType) => ActionType) | ActionType, name?: string) {
        return this.repeat(1, f, name);
    }
    isFinished() {
        return this._sequence.length === 0;
    }
    next(view: ViewType, self: AgentType) {
        if(this._sequence.length === 0) throw new Error('Sequence is empty');

        this._sequence[0].count -= 1;
        const f = this._sequence[0].f;

        if(this._sequence[0].count === 0) {
            this._sequence.shift();
        }
        if (f instanceof Function) {
            return f(view, self);
        }
        return f;
    }
    toString() {
        if(this._sequence.length === 0) return 'finished';
        return this._sequence.map(s => `${s.name || 'unnamed'}:${s.count}`).join(' -> ');
    }
}
