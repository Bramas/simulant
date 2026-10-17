/**
 * The Simulant intermediate representation (plan, Sections 3 and 6.1).
 *
 * Everything here is plain JSON data: the builder (and later the parser)
 * produce it, the engine interprets it, and the Lean generator translates it.
 * Topologies and rounds are not written in the IR: they belong to the
 * semantic core, and the IR only names them.
 */

export const IR_VERSION = 1;

// ---------------------------------------------------------------------------
// Types

export type Type =
  | { k: 'unit' }
  | { k: 'bool' }
  | { k: 'nat' }
  | { k: 'int' }
  | { k: 'string' }                          // labels only
  | { k: 'node' }                            // a node of the topology
  | { k: 'move' }                            // stay | cw | ccw
  | { k: 'frame' }                           // an agent's frame (on a ring: mirrored or not)
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

/** JSON encoding of literal values: numbers, booleans, strings (enum
 * constructors, moves), `null` (unit, `none`), arrays, and objects (records). */
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
  /** Case analysis on an enum, a move or a verdict. */
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
  /** A value supplied by the experiment. Only allowed in initialisation. */
  | { e: 'param'; name: string }
  /** What a hook does: new values of its component's world fields, and flags to raise. */
  | { e: 'effect'; world?: Record<string, Expr>; raise?: Record<string, Expr> };

/** A named function. Definitions are not recursive. */
export type Def = { name: string; params: Field[]; ret: Type; body: Expr };

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
 * A sensor: a function of the configuration `C`, the observing agent `me`
 * and its frame `frame`. The sensors of a model are exactly what its
 * algorithms can know.
 */
export type Sensor = { name: string; type: Type; body: Expr; equivariance?: Equivariance };

/** Which automorphisms of the topology a piece commutes with (Section 3.11). */
export type Equivariance = { rotations: boolean; reflections: boolean };

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
  /** Also sees the decisions, through `decisionOf(a)`. */
  beforeMove?: Expr;
  afterMove?: Expr;
  defs?: Def[];
  equivariance?: Equivariance;
};

/** Topologies are part of the semantic core; the IR names one and its parameters. */
export type Topology =
  | { kind: 'ring'; size: Expr }
  /** A ring where the adversary removes up to `k` edges at the start of every round. */
  | { kind: 'dynamicRing'; size: Expr; k: number };

export type FrameModel =
  | { kind: 'common' }
  | { kind: 'dynamicReflection' }
  /** The frame is stored in an agent field of type `frame`, owned by a component. */
  | { kind: 'persistent'; field: string };

export type Model = {
  name: string;
  topology: Topology;
  sensors: Sensor[];
  memory: 'persistent' | 'oblivious';
  frame: FrameModel;
  /** `ssync`: a nonempty eligible subset; `sequential`: one eligible agent. Both require scheduler fairness. */
  round: 'fsync' | 'ssync' | 'sequential';
  movement: 'rigid';
  components: Component[];
  symmetries: 'derived' | 'none';
  defs?: Def[];
};

// ---------------------------------------------------------------------------
// Algorithms, tasks, experiments

/**
 * An algorithm as an explicit state machine. `step` sees `mem`, `pub` and
 * `view` (a record with one field per sensor in `uses`), and returns a
 * record `{ move, pub, mem, ...actions }`. Moves are local to the agent's frame.
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
export type Task = { name: string; verdict: Expr; goal: Goal; equivariance?: Equivariance; defs?: Def[] };

/** A parameter's domain: an optional exact finite list and/or a Boolean refinement.
 * Both constraints apply when present. Earlier parameters are in scope in the
 * list; the refinement also sees the parameter itself. No simulator defaults. */
export type Param = { name: string; type: Type; domain?: Expr; accepts?: Expr };

/** Where a declaration is written (display only). */
export type DeclSource = {
  kind: 'experiment' | 'model' | 'component' | 'sensor' | 'algorithm' | 'task' | 'goal' | 'definition';
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
