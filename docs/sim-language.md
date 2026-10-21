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
structure Point where
  x : Int
  y : Int := 0

def Graphs.Cycle (n : Nat) : Space where ...                 -- a space
sensor occupied (L : Look) (l : Loc) : Bool := ...             -- a per-location sensor
sensor otherStates (L : Look) : Multiset Pub := ...            -- a Look-level sensor
task Gathering (C : Config) : Verdict := ...
goal Gathering := eventually .success          -- or `eventually always .success`, `always ¬ .failure`
def Hazards.BlackHole (policy : HolePolicy) : Component where ...
def robots (space : Space) (observe : Observation) (frames : Frames) (views : List Sensor) : Model where ...
algorithm CautiousPair uses otherStates where ...
experiment emergingAll where ...
```

A `def` whose type is not a model piece is a function on values, usable in algorithms, tasks, parameter domains, positions and spaces (not in components or sensors yet):

```lean
def rotation (v : List Bool) (i : Nat) : List Bool :=
  ofFn v.length fun j => v.at ((i + j) % v.length)

def isPeriodic (v : List Bool) : Bool :=
  (range v.length).any fun i => i ≥ 1 ∧ rotation v i = v
```

Definitions are not recursive (loops are builtins: `ofFn`, `range`, `filter`, `any`, ...), cannot take functions as arguments, and cannot have a builtin's name. They return any type, including a `structure`. Each one goes into the IR once, with the algorithm, task or model that calls it. A definition that reads the agent's Look (`here`, `visible`, `neighbors`, `distance` or a sensor) is *algorithm-local*: it is evaluated in the calling agent's Look and can be called only from algorithms and other algorithm-local definitions, and every sensor it reads must be one the algorithm `uses`. The typechecker infers this from the body:

```lean
def port (i : Nat) : Loc := (neighbors here).at i
def Ring.cw : Loc := port 0
def lineView : List Nat := Line.window.map fun l => if occupied l then 1 else 0
```

Attributes go before a declaration: `@[equivariant]` on a component or a task (a claim that it commutes with the automorphisms the model's frames keep, which can be tested on bounded instances; see [symmetries](ir.md#symmetries)), `@[implements otherStates]` on a sensor (a sensor that provides another sensor's name, such as a lossy view). Sensors read only their Look and need no equivariance claim.

## Two levels

- **Model level.** A `def` whose type is `Component`, `Model`, `Sensor`, `Space`, `Observation`, `Frames`, `Round`, `Memory`, `Movement`, `Symmetries` or a list of them is evaluated when an experiment is compiled. Arguments are positional or named (`blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown (extra := [Faults.CrashStop 1])`), with defaults. Lists, `++`, `if ... then ... else`, `=` on constructors are available. Round constructors are `.fsync`, `.ssync` (fair nonempty subsets), and `.sequential` (fair singleton activations, with no bounded activation gap). Experiment parameters may appear in model arguments: an experiment names them directly (`Graphs.Cycle N`), a model-level definition reads them as `param phi` (`Observe.radius (param phi)`). They stay symbolic and are evaluated per setting. Built in:

| Built in | Meaning |
| --- | --- |
| `Graphs.Dynamic base missing` | a graph where the adversary removes up to `missing` edges each round |
| `Euclidean.Plane` | a Euclidean space (interface only: not run yet) |
| `Observe.full`, `Observe.radius r` | every position and edge (finite spaces), or the r-hop view |
| `Frames.isomorphisms` | any isomorphism of the view fixing the observer, at each Look |
| `Frames.portPermutations .perLook` / `.perRobot` (`among := .all` or `.symmetries`) | the ports through a permutation, at each Look or fixed per robot |
| `Frames.identity` | the ports as they are (chirality) |
| `.alongEdges` | movement to `here` or a neighbor |
| `Cycle.dihedral n`, `.translationsAndReflection`, `.computed` | automorphisms of a space |

- **Object level.** Hook bodies, sensors, tasks, algorithm steps, initial values, space bodies and parameter domains are expressions of the IR (`docs/ir.md`).

## Spaces

A graph space gives its vertex type (`Nat`, `Int` or a structure of them), its vertices (omitted for an infinite vertex set) and the ordered neighbors of a vertex, which are its port numbering. A vertex may appear twice in a neighbor list (parallel edges). An infinite space gives its automorphisms; a finite one computes them unless a fast path is given:

```lean
def Graphs.Cycle (n : Nat) : Space where
  Vertex := Nat
  vertices := range n
  neighbors v := [(v + 1) % n, (v + n - 1) % n]
  automorphisms := Cycle.dihedral n

def Graphs.Line : Space where
  Vertex := Int
  neighbors v := [v + 1, v - 1]
  automorphisms := .translationsAndReflection
```

Positions have type `Pos`. Experiments build them from vertices with `pos v`; everything else compares, stores and passes positions without unwrapping them.

## Components

```lean
@[equivariant]
def Hazards.BlackHole (policy : HolePolicy) : Component where
  World := { site : Pos, active : Bool }         -- world fields it owns
  Agent := { light : Nat }                       -- agent fields it owns (here as an example)
  flags := [flag dead hidden, acts never]
  actions := [action pebble : PebbleAction := .none]
  sensors := [pebblesHere]                        -- `sensor Hazards.BlackHole.pebblesHere ...`
  init := { site := param site, active := policy = .initiallyPresent }   -- world fields
  init i := { light := 0 }                                                -- agent fields, agent index i
  beforeLook C := nothing
  beforeMove C := ...                             -- may read `decisionOf a`: decided, target, actions
  afterMove C :=
    let active := if policy = .mayEmerge ∧ !C.world.active then choose [false, true] labels ["stays inactive", "activates"]
                  else C.world.active
    { world := { C.world with active }, raise dead := fun a => present a ∧ active ∧ a.pos = C.world.site }
```

A component reads only its own world fields, flags and agent fields; others' state only through `correct a` and `present a`. A hook returns an effect: `{ world := { C.world with f := v }, raise flag := agents or predicate, agents := fun a => { field := v } }` (each part optional, `agents` setting its own agent fields), or `nothing`.

## Sensors

A sensor receives the observing agent's Look `L` and, for a per-location sensor, a location `l`. The Look gives `L.me`, `L.here`, `L.visible`, `L.visibleAgents`, `L.world.f`, `L.spaceSize` (finite spaces), and `L.occupants l`, `L.position l` and `L.edgePresent a b`. A sensor's result cannot contain `Pos`, `Agent` or `Loc`. Choices are made once per Look, for the whole view: a Look-level sensor may choose in its body; a per-location sensor puts its choices in a Look-level part.

```lean
sensor occupied (L : Look) (l : Loc) : Bool := (L.occupants l).any present

@[implements occupied]
sensor lossyOccupied (k : Nat) (L : Look) where
  hidden := choose (subsetsUpTo k (L.visibleAgents.filter present))
  at (l : Loc) : Bool := (L.occupants l).any fun a => present a ∧ !hidden.contains a
```

## Expressions

| Form | Meaning |
| --- | --- |
| `let x := e` (newline) `body` | local definition; `choose` inside names its witness site `<Owner>.x` |
| `if c then a else b`, `match e with \| .a => ... \| _ => ...` | conditionals (match on constructors) |
| `fun x => e`, `(· ≥ 3)`, `(·.pub)` | functions (only as arguments of builtins); a sensor or a builtin name can be passed (`.map colors`) |
| `.success`, `HolePolicy.none`, `none`, `[]`, `[a, b]`, `3` | constructors and literals; types are inferred (`3` is an `Int` where an `Int` is expected), or written `(none : Option Nat)` |
| `{ f := e, g }`, `{ r with f := e }`, `r.f` | records |
| `choose xs`, `choose xs such that p`, `choose xs labels ls` | adversary choice (witness labels: a list, or a function) |
| `param N` | an experiment parameter (initial values, domains, model arguments) |
| `∧ ∨ ¬ ! = ≠ < > ≤ ≥ + - * / % ++` | operators (`++` joins lists or strings; `<` and the others compare numbers, and lists of `Bool` or `Nat` lexicographically, `false < true`; positions and locations only compare with `=` and `≠`; `!b` and `¬b`, as in Lean, take everything up to `∧`, `∨` or `then`: `!v.at i` is `!(v.at i)`) |

Collections: `xs.filter p`, `xs.map f`, `xs.any p`, `xs.all p`, `xs.count p`, `xs.length`, `xs.isEmpty`, `xs.sum`, `xs.contains x`, `xs.at i` (an error beyond the end), `xs.diff ys`, `xs.dedup`, `xs.toMultiset`, `xs.toList` (not on agents or locations). Options: `o.isSome`, `o.isNone`, `o.getD d`, `some x`. Numbers: `min a b`, `max a b`, `toInt n`, `i.toNat`. Configurations, in hooks and tasks: `C.agents` (a multiset), `C.positions` (finite spaces), `C.world.f`, `a.pos`, `a.pub`, `a.flag`, `a.field`, `C.resolve a i` and `C.follow a i k` (the agent's port `i`, once or `k` times, in its kept frame). In algorithms: `here`, `visible`, `neighbors l`, `distance a b` (within the visible domain), and the sensors of `uses`, by name (`otherStates`) or at a location (`occupied l`). Elsewhere: `present a`, `correct a`, `decisionOf a`, `pos v`, `positions`, `range n`, `subsets xs`, `subsetsUpTo k xs`, `ofFn n f`, `show x`.

## Structured algorithms

```lean
algorithm FourAgentEBS uses otherStates where
  Pub := { id : Nat, bh : Option Nat }
  output claim := pub.bh                    -- what tasks read as the agent's answer
  init i := { pub := { id := i, bh := none } }

  def cautiousWalk (leader : Nat) (follower : Nat) (dir : Nat) :=   -- a procedure (inlined)
    if pub.id = leader then
      repeat
        move (port dir)
        move (port (Port.opposite dir))
    else
      ...

  main :=
    if pub.id = 0 then
      move Ring.cw
      cautiousWalk 0 1 Port.cw
```

Statements: `move l` (to a visible location of the Look, which the movement must allow), `stay` (`move here`), `halt` (each ends the activation; the agent resumes after it at its next activation; `halt` stays forever), `wait n` (evaluates `n` once and stays that many activations; `wait 0` does nothing), `repeat` (forever), `while c` (the condition ends with its line, or at an optional `do`), `if c then ... else ...` (with `else if` chains, each `else` at the column of the first `if`), `let x : T := e`, `x := e`, `pub := e`, procedure calls. Actions of the model are set for one activation with `with`: `move Ring.cw with { pebble := .drop }`, `stay with { pebble := .pick }`, `halt with { ... }` (a halted agent does not repeat them); a decision that does not set an action keeps its default. Optional action defaults support `none` and `(some value)`; for example `action setLight : Option Nat := none`. Reaching the end of `main` restarts it. Locations are valid for one activation: a local kept across a move cannot hold one; remember a port index instead (`(neighbors here).at i`, `port i`). The lowering (`packages/lang/src/elab/lower.ts`) turns the algorithm into a state machine whose memory holds the program counter (values numbered by kind: `move1`, `stay1`, ...) and the locals kept across a move (which need a type); in an oblivious model, an algorithm that needs memory is rejected. The line table gives the algorithm view the source line of each program-counter value; procedures are inlined at each call, so each program-counter value also knows the lines of the calls it is inside (`source.calls`), where the view shows the agent too.

## Algorithms as explicit state machines

```lean
algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Nat }      -- public state (default Unit)
  Mem := { pc : PC }                        -- memory (default Unit; must be Unit in an oblivious model)
  init i := { pub := { id := i, bh := none }, mem := { pc := .probe } }
  step mem pub :=                           -- sensors by name; `move` is a location
    match mem.pc with
    | .probe => { move := Ring.cw, mem := { pc := .back } }   -- pub and mem are kept unless set
    | ...
  line mem := ...                           -- the line to highlight
```

### The algorithm view

The page shows the algorithm's definition as written in its file (comments, blank lines and line numbers included), with each agent marked on the line of its program counter: the statement of its last round. An agent inside a procedure is also marked, more lightly, on the line of each call that led there; during a `wait`, it stays on the `wait` line. Without memory (an oblivious algorithm), the cursor shows the statement that decided the agent's last step. Below the algorithm, the definitions it uses (folded; click a name to open one), with each agent marked (↩) on the line its last step returned from. Clicking a cursor explains the agent's last step: its view, and each definition called, with its arguments, its result and the line it returned from. Write the algorithm as the pseudocode readers should see.

### The model view

The page's Model tab (`#model` in its URL) shows the experiment as a reader of the paper would check it. On the left, its semantics in words, derived from the compiled IR: the experiment's agents, parameter domains, number of settings checked and limits; the model's space, observation, frames, synchrony, memory, movement and sensors; each component with its arguments, fields, flags, actions, hooks and adversary choices; the algorithm's state; the task's verdict and goal (`◇ success`, `◇□ success`, `□ ¬failure`) with the executions it ranges over; the symmetry reduction; and what the checks do not cover. The round is listed phase by phase, with the components acting and what the adversary chooses in each. The header lists the model's assumptions in short (space, observation, frames, synchrony, memory, sensors, components, goal). On the right, every declaration the experiment uses, as written, with its doc comment and attributes; each fact links to the line it comes from. The definitions they call follow in one folded group, in file order, each folded to its signature, with a filter by name; a reference or a click on a definition's name in any declaration opens it. The first `/-! ... -/` comment of the experiment's file is shown as its description: say there which paper, algorithm and model the experiment encodes. Doc comments of models, components and tasks are read in the same place, so write them for the paper's readers. The compiled experiment can be downloaded as JSON.

The *Lean* switch replaces the facts with the generated Lean model, as `simulant lean -p <simulation>` writes it, and the library components it imports. A gutter names what each part translates (a parameter's domain, a component, a sensor, a definition, the task, the goal; each case of the algorithm's `step` with the statement it resumes after) and where that is written. Clicking a part shows its source; in the sources, a declaration's *Lean* button or a click on a line highlights its translation. The rounds, executions and fairness are not generated: they are defined once in the hand-written core (`lean/Simulant/`).

## Experiments

```lean
experiment cautiousPair where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 7).filter (· ≥ 3)              -- exact finite domain
  param site : Pos in positions.filter (· ≠ pos 0)        -- the positions of the space
  agents := 2
  position i := pos 0
  limits := { depth := 200 }
```

`positions` lists the positions of the experiment's (finite) space; a parameter named `positions` takes precedence. Diagnostics give the file, line and column of the expression at fault, including type errors found by the checker.

### Parameter domains and simulator defaults

A parameter declares its domain, independently of the simulator's starting values:

```lean
param N : Nat in [3, 5, 7]                         -- exact finite domain
param site : Pos in (range N).map pos              -- dependent finite domain
param phi : Nat where phi ≥ 4                     -- predicate-only domain
param positions : List Nat where positions.length ≥ 2
param k : Nat in (range 10) where k % 2 = 1        -- finite domain refined by a property
```

`in` always restricts membership to the given list. `where` always adds a Boolean property; with both clauses, both restrictions apply. The original `:= list` spelling remains an alias for `in list`, with exactly the same meaning. Neither spelling declares default values or check samples. Without either clause, the parameter ranges over its entire type.

A finite-domain expression sees earlier parameters. A predicate sees the parameter itself and earlier parameters. Predicates must be deterministic and Boolean, with the same capabilities as domain expressions. The interpreter's initial-settings warnings and generated Lean assumptions use these same domains. Warnings remain advisory, allowing execution outside them.

The simulator tries a bounded search for matching starting values: finite domains in their given order, small integers (Nat/Pos 0–63; Int 0 then ±1–63), Boolean values and enum constructors. It checks at most 1,024 candidates across parameters. For complex or unsatisfied predicates, it chooses parameters in order using at most 128 candidates each, falling back to editable values such as `0`, `false`, `[]` or a record of field defaults. This search is a convenience, not a solver or an enumeration of infinite domains. Developers can override starting values in `project.ts`:

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
