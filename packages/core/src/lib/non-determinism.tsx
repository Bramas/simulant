
export abstract class NonDeterminism<T, V> {
    public f: (t:T) => V;
    constructor(f: (t:T) => V) {
        this.f = f;
    }
    abstract random(): T;
    abstract getAllChoices(): T[];
}



export class ND_choice<T, V> extends NonDeterminism<T, V> {
    private choices: T[];
    private labels: string[];

    constructor(choices: T[], labels: string[], f: (t:T) => V) {
        super(f);
        this.choices = choices;
        this.labels = labels;
    }

    random(): T {
        return this.choices[Math.floor(Math.random() * this.choices.length)];
    }

    getAllChoices(): T[] {
        return this.choices;
    }
}




export class ND_array<T> extends ND_choice<T, T> {
    constructor(elements: T[]) {
        super(elements, elements.map((_, i) => `Choice ${i+1}`), (t:T) => t);
    }
}