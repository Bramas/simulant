/**
 * The Simulant intermediate representation (docs/ir.md, docs/core-redesign.md).
 *
 * Everything here is plain JSON data: the builder and the frontend produce it, the engine
 * interprets it, and the Lean generator translates it. The two kinds of space (graphs and
 * Euclidean spaces), observations, frames and rounds belong to the semantic core: the IR names
 * them and gives their parameters; library spaces such as cycles and lines are graph spaces
 * whose vertices and neighbors are IR expressions.
 */

export const IR_VERSION = 2;

// ---------------------------------------------------------------------------
// Types

export type Type =
  | { k: 'unit' }
  | { k: 'bool' }
  | { k: 'nat' }
  | { k: 'int' }
  | { k: 'string' }                          // labels only
  | { k: 'pos' }                             // a position of the space: opaque outside experiments and spaces
  | { k: 'loc' }                             // a location of the current Look: valid for one activation
  | { k: 'look' }                            // what a sensor observes
  | { k: 'agent' }                           // an agent of the configuration in scope
  | { k: 'config' }                          // the configuration in scope
  | { k: 'effect' }                          // what a hook returns
  | { k: 'decision' }                        // a decision, as seen by `beforeMove` hooks
  | { k: 'verdict' }                         // success | failure | inProgress
  | { k: 'pub' }                             // the algorithm's public state, in library pieces
  | { k: 'infer' }                           // a literal's type before checking (front end only)
  | { k: 'enum'; name: string; ctors: string[] }
  | { k: 'option'; of: Type }
  | { k: 'record'; fields: Field[] }
  | { k: 'list'; of: Type }
  | { k: 'multiset'; of: Type }              // unordered: no order of anonymous agents leaks
  | { k: 'fn'; params: Type[]; ret: Type };  // only as arguments of builtins

export type Field = { name: string; type: Type };

/** JSON encoding of literal values: numbers, booleans, strings (enum constructors), `null`
 * (unit, `none`), arrays, and objects (records). A position is encoded as its vertex. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// ---------------------------------------------------------------------------
// Expressions

/**
 * `at` (display only, like `Algorithm.source`): the source line of the expression, set on the
 * algorithm's step and definitions of `.sim` programs, for the explanation of a step. It has no
 * meaning for the semantics and is ignored by the checker and the Lean generator.
 */
export type Expr = ExprNode & { at?: number };

type ExprNode =
  | { e: 'lit'; type: Type; value: Json }
  | { e: 'var'; name: string }
  | { e: 'let'; name: string; value: Expr; body: Expr }
  | { e: 'if'; cond: Expr; then: Expr; else: Expr }
  /** Case analysis on an enum or a verdict. */
  | { e: 'match'; on: Expr; cases: Record<string, Expr>; else?: Expr }
  /** A lambda, only as an argument of a builtin; parameter types are inferred from it. */
  | { e: 'fn'; params: { name: string; type?: Type }[]; body: Expr }
  /** A builtin (see builtins.ts) or a definition of the model. */
  | { e: 'call'; fn: string; args: Expr[] }
  | { e: 'record'; fields: Record<string, Expr> }
  | { e: 'with'; on: Expr; fields: Record<string, Expr> }
  | { e: 'get'; on: Expr; field: string }
  /**
   * An adversary choice among the elements of `from` (a list or a multiset),
   * restricted to those satisfying `such`. `site` names the choice in
   * witnesses; `label` describes the chosen element.
   */
  | { e: 'choose'; site: string; from: Expr; such?: Expr; label?: Expr }
  /** A value supplied by the experiment. Only in initial values, domains and model arguments. */
  | { e: 'param'; name: string }
  /**
   * What a hook does: new values of its component's world fields, flags to raise, and new
   * values of its own agent fields (`agents`: a function from an agent to a record of them).
   */
  | { e: 'effect'; world?: Record<string, Expr>; raise?: Record<string, Expr>; agents?: Expr }
  /**
   * A sensor read by the algorithm in its current Look: a Look-level sensor without `loc`, a
   * per-location sensor at the location `loc`. One sensor environment per Look: repeated reads agree.
   */
  | { e: 'sense'; sensor: string; loc?: Expr };

/** A named function. Definitions are not recursive. A definition that reads the Look
 * (`here`, `visible`, `neighbors`, `distance`, a sensor) is algorithm-local: the checker infers it. */
export type Def = { name: string; params: Field[]; ret: Type; body: Expr };

// ---------------------------------------------------------------------------
// Spaces, observations, frames

/** Which automorphisms of a space the explorer quotients by. */
export type Automorphisms =
  /** Computed from the finite graph. */
  | { kind: 'computed' }
  /** The dihedral group of the cycle `Nat` mod `n`: rotations, and reflections swapping ports 0 and 1. */
  | { kind: 'dihedral'; n: Expr }
  /** Translations and the reflection of `Int` vertices (the line); reflections swap ports 0 and 1. */
  | { kind: 'translationsAndReflection' };

export type Space =
  /**
   * A graph: vertices of type `vertex`, and an ordered neighbor list for each vertex (its port
   * numbering; a vertex may appear twice: parallel edges). `vertices` is omitted for an infinite
   * vertex set, whose neighborhoods are finite. `params` are the space's parameters; `args`
   * their values, expressions over experiment parameters, evaluated per setting.
   */
  | {
    kind: 'graph'; name: string;
    params?: Field[]; args?: Record<string, Expr>;
    vertex: Type;
    vertices?: Expr;
    neighbors: { vertex: string; body: Expr };
    automorphisms: Automorphisms;
  }
  /** A graph where the adversary removes up to `missing` edges at the start of every round. */
  | { kind: 'dynamic'; base: Space; missing: Expr }
  /** A Euclidean space (interface only in Phase 0: the engine does not run it). */
  | { kind: 'euclidean'; dim: number };

/** The visible domain of an agent: every position, or the r-hop view. */
export type Observation = { kind: 'full' } | { kind: 'radius'; r: Expr };

/** The morphisms through which agents see their view, and when they are chosen. */
export type Frames =
  /** Isomorphisms of the visible domain fixing the observer, chosen at each Look. */
  | { kind: 'isomorphisms' }
  /** The space's ports as they are (chirality, port-labelled graphs). */
  | { kind: 'identity' }
  /** The ports, through a permutation chosen at each Look or once per robot. */
  | { kind: 'portPermutations'; when: 'perLook' | 'perRobot'; among: 'all' | 'symmetries' };

// ---------------------------------------------------------------------------
// Model pieces

export type Flag = {
  name: string;
  /** A hidden agent disappears from every sensor. */
  visibility: 'visible' | 'hidden';
  /** `never`: no longer decides or moves; `adversary`: the adversary decides for it. */
  acts: 'never' | 'adversary';
};

/**
 * A sensor: what an agent learns from its Look `L`. A per-location sensor also receives a
 * location `l`. `look` holds its Look-level part: bindings evaluated once per Look, which may
 * contain choices; the per-location body is deterministic. A sensor's result contains no `Pos`,
 * `Agent` or `Loc`.
 */
export type Sensor = {
  name: string; type: Type; perLocation: boolean;
  look?: { name: string; value: Expr }[];
  body: Expr;
};

/** An action other than a move: a field of every decision, with a default. */
export type Action = { name: string; type: Type; default: Json };

export type Component = {
  name: string;
  /** Parameters of the component family (`BlackHole policy`), in scope in all its expressions. */
  params?: Field[];
  /** Their values in this instance. */
  args?: Record<string, Json>;
  /** World fields owned by the component. */
  world?: Field[];
  /** Agent fields owned by the component. */
  agent?: Field[];
  flags?: Flag[];
  sensors?: Sensor[];
  actions?: Action[];
  /** Initial values: world fields may use `param`; agent fields may use the agent index `i`. */
  init?: { world?: Record<string, Expr>; agent?: Record<string, Expr> };
  /** Hook bodies: `C` is in scope; they return an effect. */
  beforeLook?: Expr;
  /** At Compute; sees the decisions taking effect, through `decisionOf(a)`. */
  onCompute?: Expr;
  /** Before Move; sees the moves happening, through `decisionOf(a)`. */
  beforeMove?: Expr;
  afterMove?: Expr;
  defs?: Def[];
  /** A claim: the component commutes with the automorphisms that the model's frames keep. */
  equivariant?: boolean;
};

export type Model = {
  name: string;
  space: Space;
  observation: Observation;
  frames: Frames;
  sensors: Sensor[];
  memory: 'persistent' | 'oblivious';
  /** `ssync`: a nonempty eligible subset; `sequential`: one eligible agent. Both require scheduler fairness. */
  round: 'fsync' | 'ssync' | 'sequential';
  /** `alongEdges`: to `here` or a neighbor; a missing dynamic edge leaves the agent in place. */
  movement: 'alongEdges';
  components: Component[];
  symmetries: 'derived' | 'none';
  defs?: Def[];
};

// ---------------------------------------------------------------------------
// Algorithms, tasks, experiments

/**
 * An algorithm as an explicit state machine. `step` sees `mem` and `pub`, reads its Look through
 * `here`, `visible`, `neighbors`, `distance` and `sense`, and returns a record
 * `{ move, pub, mem, ...actions }` whose `move` is a location of that Look.
 */
export type Algorithm = {
  name: string;
  uses: string[];
  pub: Type;
  mem: Type;
  /** Initial public state and memory; the agent index `i` is in scope. */
  init: { pub: Expr; mem: Expr };
  step: Expr;
  /** The line to highlight, from the memory. */
  line?: Expr;
  /** Interpreter-only escape hatch: a TypeScript step function registered under this name. */
  native?: string;
  /**
   * Where the algorithm is written, for display (the line table refers to this file), and, for
   * each program-counter value inside procedure calls, the lines of those calls (outermost first).
   */
  source?: {
    file: string; line: number; endLine: number; calls?: Record<string, number[]>;
    /** Where the definitions of `defs` are written. */
    defs?: { name: string; file: string; line: number; endLine: number }[];
  };
  defs?: Def[];
};

export type Goal =
  /** No reachable `failure` verdict, and every execution reaches `success`. */
  | 'eventually'
  /** No reachable `failure` verdict, and every execution ends in `success` forever. */
  | 'eventuallyAlways'
  /** Only: no reachable `failure` verdict. */
  | 'safety';

/** A verdict on configurations (`C` in scope) and a goal over executions. */
export type Task = { name: string; verdict: Expr; goal: Goal; equivariant?: boolean; defs?: Def[] };

/** A parameter's domain: an optional exact finite list and/or a Boolean refinement.
 * Both constraints apply when present. Earlier parameters are in scope in the
 * list; the refinement also sees the parameter itself. No simulator defaults. */
export type Param = { name: string; type: Type; domain?: Expr; accepts?: Expr };

/** Where a declaration is written (display only). */
export type DeclSource = {
  kind: 'experiment' | 'model' | 'component' | 'sensor' | 'algorithm' | 'task' | 'goal' | 'definition' | 'space';
  name: string; file: string; line: number; endLine: number;
};

export type Experiment = {
  irVersion: number;
  name: string;
  model: Model;
  algorithm: Algorithm;
  task: Task;
  params: Param[];
  /** Agents: their number and positions (index `i` in scope); parameters in scope. */
  agents: { count: Expr; pos: Expr };
  limits?: { depth?: number; states?: number };
  /**
   * Display only, like `Algorithm.source`: where the experiment is written, and every declaration
   * it is built from (the experiment first, then in order of use), for the page's model view.
   */
  source?: { file: string; line: number; endLine: number; uses: DeclSource[] };
};
