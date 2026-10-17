# The `.sim` language (as implemented)

This page describes what the front end (`packages/lang/src/parse`, `packages/lang/src/elab`) accepts. See the [architecture](architecture.md) for the overall design and the [IR reference](ir.md) for runtime semantics. The standard library in `packages/stdlib/sim/` is the best set of examples.

## Files and layout

A file is a list of declarations, each starting at the left margin. Layout follows Lean: a construct continues on lines indented more than where it started, and the items of a `where` block share a column. Comments are `-- ...` and `/- ... -/`; `/-- ... -/` documents the next declaration.

```lean
import "./models.sim"      -- relative to this file
import "std/models.sim"    -- the standard library
```

Every declaration of an imported module is visible. Names may be dotted (`Hazards.BlackHole`).

## Declarations

```lean
inductive HolePolicy | none | initiallyPresent | mayEmerge
structure Pos where
  x : Nat
  y : Nat := 0

sensor otherStates (C : Config) (me : Agent) : Multiset Pub := ...
task Gathering (C : Config) : Verdict := ...
goal Gathering := eventually .success          -- or `eventually always .success`, `always ¬ .failure`
def Hazards.BlackHole (policy : HolePolicy) : Component where ...
def blackHoleRing (policy : HolePolicy) (extra : List Component := []) : Model where ...
algorithm CautiousPair uses otherStates where ...
experiment emergingAll where ...
```

A `def` whose type is not a model piece is a function on values, usable in algorithms, tasks, parameter domains and positions (not in components or sensors yet):

```lean
def rotation (v : List Bool) (i : Nat) : List Bool :=
  ofFn v.length fun j => v.at ((i + j) % v.length)

def isPeriodic (v : List Bool) : Bool :=
  (range v.length).any fun i => i ≥ 1 ∧ rotation v i = v
```

Definitions are not recursive (loops are builtins: `ofFn`, `range`, `filter`, `any`, ...), cannot take functions as arguments, and cannot have a builtin's name. They return any type, including a `structure`. Each one goes into the IR once, with the algorithm, task or model that calls it.

Attributes go before a declaration: `@[equivariant rotations reflections]` (an equivariance claim that can be tested on bounded instances; see [symmetries](ir.md#symmetries)), `@[implements otherStates]` (a sensor that provides another sensor's name, such as a lossy view).

## Two levels

- **Model level.** A `def` whose type is `Component`, `Model`, `Sensor`, `Topology`, `FrameModel`, `Round`, `Memory` or a list of them is evaluated when an experiment is compiled. Arguments are positional or named (`blackHoleRing .mayEmerge .unknown (extra := [Faults.CrashStop 1])`), with defaults. Lists, `++`, `if ... then ... else`, `=` on constructors are available. Round constructors are `.fsync`, `.ssync` (fair nonempty subsets), and `.sequential` (fair singleton activations, with no bounded activation gap). Built in: `Ring`, `DynamicRing k`, `Frames.common`, `Frames.dynamicReflection`, `Frames.persistent field`.
- **Object level.** Hook bodies, sensors, tasks, algorithm steps, initial values and parameter domains are expressions of the IR (`docs/ir.md`).

## Components

```lean
@[equivariant rotations reflections]
def Hazards.BlackHole (policy : HolePolicy) : Component where
  World := { site : Node, active : Bool }        -- world fields it owns
  Agent := { mirrored : Frame }                  -- agent fields it owns (here as an example)
  flags := [flag dead hidden, acts never]
  actions := [action pebble : PebbleAction := .none]
  sensors := [pebblesHere]                        -- `sensor Hazards.BlackHole.pebblesHere ...`
  init := { site := param site, active := policy = .initiallyPresent }   -- world fields
  init i := { mirrored := choose frames }                                 -- agent fields, agent index i
  beforeLook C := nothing
  beforeMove C := ...                             -- may read `decisionOf a`
  afterMove C :=
    let active := if policy = .mayEmerge ∧ !C.world.active then choose [false, true] labels ["stays inactive", "activates"]
                  else C.world.active
    { world := { C.world with active }, raise dead := fun a => present a ∧ active ∧ a.pos = C.world.site }
```

A component reads only its own world fields, flags and agent fields; others' state only through `correct a` and `present a`. A hook returns an effect: `{ world := { C.world with f := v }, raise flag := agents or predicate }`, or `nothing`.

## Expressions

| Form | Meaning |
| --- | --- |
| `let x := e` (newline) `body` | local definition; `choose` inside names its witness site `<Owner>.x` |
| `if c then a else b`, `match e with \| .a => ... \| _ => ...` | conditionals (match on constructors) |
| `fun x => e`, `(· ≥ 3)`, `(·.pub)` | functions (only as arguments of builtins) |
| `.cw`, `HolePolicy.none`, `none`, `[]`, `[a, b]` | constructors and literals; types are inferred, or written `(none : Option Nat)` |
| `{ f := e, g }`, `{ r with f := e }`, `r.f` | records |
| `choose xs`, `choose xs such that p`, `choose xs labels ls` | adversary choice (witness labels: a list, or a function) |
| `param N` | an experiment parameter (initial values) |
| `∧ ∨ ¬ ! = ≠ < > ≤ ≥ + - * / % ++` | operators (`++` joins lists or strings; `<` and the others compare numbers, and lists of `Bool` or `Nat` lexicographically, `false < true`; `!b` and `¬b`, as in Lean, take everything up to `∧`, `∨` or `then`: `!v.at i` is `!(v.at i)`) |

Collections: `xs.filter p`, `xs.map f`, `xs.any p`, `xs.all p`, `xs.count p`, `xs.length`, `xs.isEmpty`, `xs.sum`, `xs.contains x`, `xs.at i`, `xs.diff ys`, `xs.dedup`, `xs.toMultiset`, `xs.toList` (not on agents). Options: `o.isSome`, `o.isNone`, `o.getD d`, `some x`. Configurations: `C.agents` (a multiset), `C.nodes`, `C.size`, `C.world.f`, `a.pos`, `a.pub`, `a.flag`, `a.field`. Functions: `present a`, `correct a`, `decisionOf a`, `target p m`, `advance p m i` (i steps in a global direction), `edgePresent p m`, `offset p frame i`, `toGlobal frame m`, `m.opposite`, `frames`, `node n`, `range n`, `subsets xs`, `subsetsUpTo k xs`, `ofFn n f`, `show x`, `min a b`, `max a b`.

## Structured algorithms

```lean
algorithm FourAgentEBS uses otherStates where
  Pub := { id : Nat, bh : Option Move }
  output claim := pub.bh                    -- what tasks read as the agent's answer
  init i := { pub := { id := i, bh := none } }

  def cautiousWalk (leader : Nat) (follower : Nat) (dir : Move) :=   -- a procedure (inlined)
    if pub.id = leader then
      repeat
        move dir
        move dir.opposite
    else
      ...

  main :=
    if pub.id = 0 then
      move .cw
      cautiousWalk 0 1 .cw
```

Statements: `move d`, `stay`, `halt` (each ends the activation; the agent resumes after it at its next activation; `halt` stays forever), `wait n` (evaluates `n` once and stays that many activations; `wait 0` does nothing), `repeat` (forever), `while c` (the condition ends with its line, or at an optional `do`), `if c then ... else ...` (with `else if` chains, each `else` at the column of the first `if`), `let x : T := e`, `x := e`, `pub := e`, procedure calls. Actions of the model are set for one activation with `with`: `move .cw with { pebble := .drop }`, `stay with { pebble := .pick }`, `halt with { ... }` (a halted agent does not repeat them); a decision that does not set an action keeps its default. Sensors are read by name (`otherStates`). Reaching the end of `main` restarts it. The lowering (`packages/lang/src/elab/lower.ts`) turns the algorithm into a state machine whose memory holds the program counter (values numbered by kind: `move1`, `stay1`, ...) and the locals kept across a move (which need a type); in an oblivious model, an algorithm that needs memory is rejected. The line table gives the algorithm view the source line of each program-counter value; procedures are inlined at each call, so each program-counter value also knows the lines of the calls it is inside (`source.calls`), where the view shows the agent too.

## Algorithms as explicit state machines

```lean
algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Move }     -- public state (default Unit)
  Mem := { pc : PC }                        -- memory (default Unit; must be Unit in an oblivious model)
  init i := { pub := { id := i, bh := none }, mem := { pc := .probe } }
  step mem pub view :=                      -- view.otherStates, ...; moves are local
    match mem.pc with
    | .probe => { move := .cw, mem := { pc := .back } }   -- pub and mem are kept unless set
    | ...
  line mem := ...                           -- the line to highlight
```

### The algorithm view

The page shows the algorithm's definition as written in its file (comments, blank lines and line numbers included), with each agent marked on the line of its program counter: the statement of its last round. An agent inside a procedure is also marked, more lightly, on the line of each call that led there; during a `wait`, it stays on the `wait` line. Without memory (an oblivious algorithm), the cursor shows the statement that decided the agent's last step. Below the algorithm, the definitions it uses (folded; click a name to open one), with each agent marked (↩) on the line its last step returned from. Clicking a cursor explains the agent's last step: its view, and each definition called, with its arguments, its result and the line it returned from. Write the algorithm as the pseudocode readers should see.

### The model view

The page's Model tab (`#model` in its URL) shows the experiment as a reader of the paper would check it. On the left, its semantics in words, derived from the compiled IR: the experiment's agents, parameter domains, number of settings checked and limits; the model's topology, synchrony, memory, orientation, movement and sensors; each component with its arguments, fields, flags, actions, hooks and adversary choices; the algorithm's state; the task's verdict and goal (`◇ success`, `◇□ success`, `□ ¬failure`) with the executions it ranges over; the symmetry reduction; and what the checks do not cover. The round is listed phase by phase, with the components acting and what the adversary chooses in each. The header lists the model's assumptions in short (topology, synchrony, memory, orientation, sensors, components, goal). On the right, every declaration the experiment uses, as written, with its doc comment and attributes; each fact links to the line it comes from. The definitions they call follow in one folded group, in file order, each folded to its signature, with a filter by name; a reference or a click on a definition's name in any declaration opens it. The first `/-! ... -/` comment of the experiment's file is shown as its description: say there which paper, algorithm and model the experiment encodes. Doc comments of models, components and tasks are read in the same place, so write them for the paper's readers. The compiled experiment can be downloaded as JSON.

The *Lean* switch replaces the facts with the generated Lean model, as `simulant lean -p <simulation>` writes it, and the library components it imports. A gutter names what each part translates (a parameter's domain, a component, a sensor, a definition, the task, the goal; each case of the algorithm's `step` with the statement it resumes after) and where that is written. Clicking a part shows its source; in the sources, a declaration's *Lean* button or a click on a line highlights its translation. The rounds, executions and fairness are not generated: they are defined once in the hand-written core (`lean/Simulant/`).

## Experiments

```lean
experiment cautiousPair where
  model := blackHoleRing .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 7).filter (· ≥ 3)              -- exact finite domain
  param site : Node in ((range N).filter (· ≥ 1)).map node
  agents := 2
  position i := node 0
  limits := { depth := 200 }
```

The ring size parameter is `N`. Diagnostics give the file, line and column of the expression at fault, including type errors found by the checker.

### Parameter domains and simulator defaults

A parameter declares its domain, independently of the simulator's starting values:

```lean
param N : Nat in [3, 5, 7]                         -- exact finite domain
param site : Node in (range N).map node            -- dependent finite domain
param phi : Nat where phi ≥ 4                     -- predicate-only domain
param positions : List Nat where positions.length ≥ 2
param k : Nat in (range 10) where k % 2 = 1        -- finite domain refined by a property
```

`in` always restricts membership to the given list. `where` always adds a Boolean property; with both clauses, both restrictions apply. The original `:= list` spelling remains an alias for `in list`, with exactly the same meaning. Neither spelling declares default values or check samples. Without either clause, the parameter ranges over its entire type.

A finite-domain expression sees earlier parameters. A predicate sees the parameter itself and earlier parameters. Predicates must be deterministic and Boolean, with the same capabilities as domain expressions. The interpreter's initial-settings warnings and generated Lean assumptions use these same domains. Warnings remain advisory, allowing execution outside them.

The simulator tries a bounded search for matching starting values: finite domains in their given order, small integers (Nat/Node 0–63; Int 0 then ±1–63), Boolean values and enum constructors. It checks at most 1,024 candidates across parameters. For complex or unsatisfied predicates, it chooses parameters in order using at most 128 candidates each, falling back to editable values such as `0`, `false`, `[]` or a record of field defaults. This search is a convenience, not a solver or an enumeration of infinite domains. Developers can override starting values in `project.ts`:

```ts
simProject(module, 'example', {
  defaults: { N: 64, positions: [0, 2, 4], phi: 5 },
  checkSettings: () => [
    { N: 64, positions: [0, 2, 4], phi: 5 },
    { N: 64, positions: [0, 1, 3, 4], phi: 5 },
  ],
});
```

`defaults` changes the simulator's starting values without changing the model domain, its Lean statements or the settings checked. Omitted defaults are derived using the supplied values. They are also used for newly added or incompatible parameters on source updates. An explicit default outside the domain produces the usual advisory warning.

`check-all` enumerates exact finite model domains and filters any refinements. If a parameter has only a predicate (or no restriction), supply a finite `checkSettings` iterable in `project.ts`; otherwise enumeration reports which parameter has no finite domain. Each supplied setting must give every parameter, and settings outside the declared domains are skipped. These finite checks do not restrict the model's domains or establish correctness for all values in them.
