# The Simulant IR and its interpreter

Status: version 2, the generic core of [Phase 0](core-redesign.md). The frontend (`packages/lang`) produces and checks it; the interpreter and explorer (`packages/engine`) implement it, and the conformance fixtures specify it. The Lean generator and core implement it too (Phase 0 step 6). A change to the IR updates, together, the conformance fixtures, the interpreter, the Lean generator and this document. See the [architecture](architecture.md) for package boundaries, and [development](development.md) for verification and known issues.

## Where things are

| Piece | File |
| --- | --- |
| IR types (`Experiment`, `Model`, `Space`, `Component`, `Expr`, ...) | `packages/lang/src/ir.ts` |
| Builtin functions and their typing rules | `packages/lang/src/builtins.ts` |
| Composition (which fields, flags, sensors, actions exist, and their owners) | `packages/lang/src/layout.ts` |
| Typechecker and validation | `packages/lang/src/check.ts` |
| TypeScript builder used by tests | `packages/lang/src/builder.ts` |
| Values, canonical encodings, symmetry action on values | `packages/engine/src/values.ts` |
| Compiler from IR to closures | `packages/engine/src/compile.ts` |
| Spaces, views, presentations of a Look, automorphisms | `packages/engine/src/space.ts` |
| Initial configurations and the step | `packages/engine/src/system.ts`, `packages/engine/src/scheduler.ts` |
| Explorer: state graph, verdicts, liveness, counterexamples | `packages/engine/src/explorer.ts` |
| Symmetry reduction, bounded equivariance test | `packages/engine/src/symmetry.ts` |
| Conformance fixtures | `packages/engine/conformance/*.json` (regenerate with `npx tsx packages/engine/conformance/generate.ts`) |
| Library spaces, sensors, components, tasks, families | `packages/stdlib/sim/` ([hand-written builder counterparts for tests](../packages/stdlib/README.md) in `packages/stdlib/test/helpers/`) |

## Experiments

An `Experiment` is JSON data: `irVersion` (2), a `model`, an `algorithm`, a `task`, `params` (name, type, an optional `domain` expression listing the exact finite domain, and an optional Boolean `accepts` refinement), and `agents` (`count`, and `pos`, a position, with the agent index `i` in scope). Experiments compiled from `.sim` also carry `source` (`{ file, line, endLine, uses }`): where the experiment is written and, in `uses`, every declaration it is built from (`kind` among `experiment`, `model`, `space`, `component`, `sensor`, `algorithm`, `task`, `goal`, `definition`, with its name, file and lines), the experiment first, then in order of use. It is for the model view only, like `Algorithm.source`: it has no meaning for the semantics, is ignored by the checker, the interpreter and the Lean generator, and is dropped from conformance fixtures.

A parameter's `domain` is always an exact membership restriction. Its `accepts` predicate adds a property and sees that parameter and earlier parameters; when both fields are present, membership requires both. Settings warnings and Lean's correctness/non-vacuity statements use this intersection. A predicate-only parameter ranges over all values satisfying it; a parameter with neither field ranges over its entire type. Exhaustive enumeration requires a finite `domain` for each parameter and filters through `accepts`. A project's `checkSettings` can supply finite settings separately when a domain cannot be enumerated. Simulator defaults are derived with a bounded search or supplied by the project, and never appear in the IR. These restrictions do not change the transition relation or turn invalid settings into initial configurations with failure: execution remains available outside the declared domain.

Experiment parameters may appear in the model's arguments: a space's `args`, the observation radius, a dynamic space's number of missing edges. They are evaluated per setting. Two settings share a state graph only when their instantiated models are equal; parameters that only set initial values do not prevent sharing, because they are part of the state.

## Models

A `Model` gives its `space`, `observation` and `frames`, its `scheduler`, its sensors and components, its memory model (`persistent` or `oblivious`), its movement (`alongEdges`) and its symmetries (`derived` or `none`).

A `Scheduler` (IR version 3; version 2 had a `round` instead) owns world and agent fields with initial values, like a component, and gives `events`, the cut of the Look-Compute-Move cycle into atomic events (nonempty lists of instants that together list `look`, `compute` and `move` once each, in order), its `fairness` (`activation` or `none`), and `schedule`, an expression with `C` in scope that returns an effect. The effect's `activate` part (agents, or a predicate on agents; only in `schedule`) marks the agents that take their next event; its other parts set the scheduler's own fields. `equivariant` is a claim, as for components. Until the Lean round runs over events, the Lean generator translates only `Schedulers.FSync`, `SSync` and `Sequential`, to its built-in rounds.

**Spaces.** A `graph` space has a vertex type (`Nat`, `Int`, or a record of them), an optional `vertices` list (omitted: an infinite vertex set with finite neighborhoods), and `neighbors`, an expression with one vertex in scope that lists its neighbors in order: that order is its port numbering, and a vertex may appear twice (parallel edges, as in the two-node cycle) but never in its own list: self-loops are rejected (a move along one would be a stay). A finite graph is checked when the space is built, so `Graphs.Cycle 1` is an error rather than a vertex with two loops. `params` and `args` are the space's own parameters and their values, expressions over experiment parameters; the space's expressions see its parameters as variables. `automorphisms` is `computed` (finite graphs), `dihedral n` (the cycle `Nat` mod `n`, whose reflections swap ports 0 and 1) or `translationsAndReflection` (`Int` vertices); an infinite graph must give one. A `dynamic` space wraps a graph: the adversary removes up to `missing` edges at the start of every round. A `euclidean` space is an interface only: the checker rejects it.

**Observations.** `full` (every position and edge, finite spaces only) or `radius r`: the r-hop view, the positions at distance at most `r` and the edges with at least one endpoint at distance less than `r`. An edge between two positions at distance exactly `r` is not visible. The structure of the view is information the observation grants.

**Frames.** The declared morphisms through which agents see their view: `isomorphisms` (any isomorphism of the visible domain fixing the observer, chosen at each Look), `identity` (the space's ports as they are), and `portPermutations` with `when` (`perLook` or `perRobot`) and `among` (`all` or `symmetries`, the permutations induced by automorphisms of the space). A `perRobot` permutation is chosen once per agent, at initialization.

A `Component` owns world fields, agent fields, flags, sensors and actions, gives their initial values, and may define four hooks (`beforeLook`, `onCompute`, `beforeMove`, `afterMove`), each an expression with `C : Config` in scope that returns an `effect`. An effect sets the component's own world fields, raises its own flags (on a collection of agents or on those satisfying a predicate), and, with `agents`, a function from an agent to a record, sets its own agent fields. Fields may have type `Pos`. `equivariant` is a claim: the component commutes with the automorphisms that the model's frames keep.

A `Sensor` is what an agent learns from its Look `L`. A per-location sensor (`perLocation`) also receives a location `l`. Its `look` bindings are its Look-level part, evaluated once per Look, which may contain choices; its body sees them, and is deterministic when the sensor is per location. A sensor's result contains no `Pos`, `Agent` or `Loc`. The Look offers `me`, `here`, `visible`, `visibleAgents`, `world` (the components' world fields; a component's sensor reads only its own) and `spaceSize` (finite spaces) as fields, and `occupants(L, l)`, `position(L, l)` and `edgePresent(L, a, b)` as builtins. Edge presence requires an actual edge between the positions behind the two locations, even when no edges are missing. With parallel edges it is true if at least one remains; it is false for the observer itself and for locations that are not neighbors.

An `Algorithm` is an explicit state machine: public state type `pub`, memory type `mem`, their initial values (index `i` in scope, no Look), and `step`, with `mem` and `pub` in scope, which reads its Look through `here`, `visible`, `neighbors(l)` and `distance(a, b)` and its sensors through `sense` expressions, and returns `{ move, pub, mem, ...actions }` where `move` is a location of the Look (`here` to stay). Neither `pub` nor `mem` may contain a location (valid for one activation) or a position (algorithms never see positions); an agent remembers a neighbor by its index in `neighbors(here)`, a port number when the frames keep ports. `native` names a TypeScript step function instead; the version 2 interpreter does not support it yet, and it is never translated to Lean. `source` (optional, `{ file, line, endLine, calls?, defs? }`) says where the algorithm is written, in `calls`, for each program-counter value inside inlined procedures, the lines of the calls around it (outermost first), and in `defs`, where the definitions of `defs` are written, for the algorithm view only: it has no meaning for the semantics, is ignored by the Lean generator, and is dropped from conformance fixtures. Expressions of `.sim` algorithms (the step and the definitions it uses) may carry `at`, their source line, also for display only. Structured algorithms are lowered to this form; their program-counter values are numbered by kind in program order (`move1`, `stay1`, `halt1`), and `line` maps them to source lines.

A `Task` has a `verdict` expression (`C` in scope) of type `Verdict` and a `goal`: `eventually` (some state is `success`), `eventuallyAlways` (from some point on, every state is `success`) or `safety`. A reachable `failure` verdict violates every goal. A task reads an answer given in an agent's own terms with `resolve(C, a, i)` (the neighbor of `a.pos` behind the agent's port `i`, in its kept frame) and `follow(C, a, i, k)` (the position after `k` steps through that port). Both are errors under per-Look frames and for a port the vertex does not have.

## Expressions

Every expression is pure, except `choose`, which is an adversary choice. Contexts restrict what may appear:

| Context | `param` | `choose` | Notes |
| --- | --- | --- | --- |
| parameter domains, model arguments | yes | no | `pos(v)` and `positions()` allowed |
| initial values (`init`, agent positions) | yes | yes | choices give several initial configurations |
| space vertices and neighbors | no | no | the space's parameters and one vertex in scope |
| sensors (`L`, `l`) | no | in the Look-level part, and in Look-level sensors | the choices are fixed for the whole Look |
| hooks (`C`) | no | yes | `decisionOf(a)` only in `onCompute` and `beforeMove` |
| algorithms (`mem`, `pub`) | no | no | the Look and the sensors in `uses`; no builtin that reads the configuration |
| tasks (`C`) | no | no | may read `a.mem` (nothing else may) |

Lambdas (`fn`) only appear as builtin arguments; their parameter types are inferred and must be deterministic. Definitions (`Def`) are named, typed, non-recursive functions; a definition is nondeterministic when its body contains a choice, directly or through a call, and algorithm-local when it reads the Look (`here`, `visible`, `neighbors`, `distance`, a sensor), directly or through a call: an algorithm-local definition can only be called by algorithms and other algorithm-local definitions. The comparisons `lt`, `le`, `gt`, `ge` take numbers, or two lists of `Bool` or of `Nat` (lexicographic, `false < true`, a prefix first: Lean's `List.lt`). Positions and locations can be compared for equality only.

`sense` reads a sensor of `uses`: `{ e: 'sense', sensor }` for a Look-level sensor, `{ e: 'sense', sensor, loc }` for a per-location sensor at the location `loc`. One sensor environment per Look: two reads of the same sensor at the same location agree, and Look-level choices are made once.

The type `pub` stands for the algorithm's public state inside library pieces (`otherStates : Multiset Pub`). Record types are compared by field names, not order. Agents (`Agent`) and locations (`Loc`) are valid within one round and cannot be stored. A multiset of locations has no order: `toList` rejects it, and only `visible` and `neighbors` give ordered lists of locations.

## Values and encodings

| Type | Value | Encoding |
| --- | --- | --- |
| `Unit`, `none` | `null` | empty, `-` |
| `Bool` | boolean | `0`, `1` |
| `Nat`, `Int`, `Agent` | number | decimal |
| `Pos` | its vertex | the vertex's encoding |
| `Loc` | an index into the Look (never stored) | decimal |
| enums, `Verdict` | constructor name | the name |
| `String` | string | JSON string |
| `Option T` | `null` or the value | `-` or `+` then the value |
| records | object | `{` fields in declared order, comma-separated `}` |
| `List`, `Multiset` | array (multisets sorted by encoding) | `[` elements `]` |

A configuration's key is its agents' keys, then the world's. An agent's key is its position, its kept port permutation (comma-separated ports under `portPermutations .perRobot`), its flags and component fields encoded together as a typed record in declaration order, its public state and its memory. Field boundaries are explicit so that distinct field values such as `(1, 23)` and `(12, 3)` cannot merge. Under FSYNC, agents are sorted by key (a multiset: anonymous agents gain no order); under SSYNC or sequential scheduling, they keep their index, because fairness is about identity.

Arithmetic follows Lean: `Nat` subtraction and division are truncated, division by zero is zero, `Int` division and modulo are Euclidean. Number literals are `Nat` unless an `Int` is expected.

## A step

`System.successors(C)` follows [scheduler-design.md](scheduler-design.md#1-cycles-events-and-phases). Each agent's Look-Compute-Move cycle is cut into atomic events by its scheduler (`SchedulerRuntime.events`); an agent's `phase` counts the events of its current cycle it has taken, and `pending` holds the decision of its last Look meanwhile. Both are absent between cycles, hence always with atomic cycles, and are part of the state key only when present.

1. The adversary chooses the space state (in a dynamic space: at most `missing` missing edges). Then all `beforeLook` hooks run on the same snapshot and their effects are merged (fields have one owner; flags are merged by "or").
2. If no agent is eligible (whose flags do not say `acts never`), the step idles. Otherwise the scheduler's `schedule` runs on the configuration: the agents marked by its effect's `activate` part, among the eligible ones, take their next event, and the rest of the effect updates the scheduler's own fields. Under `fairness = activation`, every continuously acting agent must take events infinitely often, without a bound on finite gaps.
3. Each scheduled agent whose event includes Look takes its Look, from the configuration of step 2: the visible domain around its position, and the order of its locations, the reference ordering followed by a morphism. The interpreter's reference ordering is the order of the physical vertices, which can leak information on views without symmetry (see the warning in [core-redesign.md](core-redesign.md#3-observations-ordering-and-frames)). The morphism is chosen by the adversary from the declared frames: under `isomorphisms`, among the isomorphisms of the visible domain fixing the observer; under `portPermutations`, the agent's kept permutation or one chosen for this Look; under `identity`, none. Then its sensors (one environment per Look, with their choices) and `step`. The decision's location is mapped back to a position through the Look. An agent's decisions are deduplicated by their effect (target position, new state, actions). Agents with `acts adversary` choose any destination the movement allows. The decisions are combined over agents (a product). Other scheduled agents use their pending decision.
4. `onCompute` hooks read, through `decisionOf(a)`, the decisions of the agents whose event includes Compute: `decided`, `target` (the position it moves to) and its actions; other agents have `decided = false` and `target` their position. Then those agents, if they still act, take the decision's public state and memory.
5. `beforeMove` hooks read, in the same way, the decisions of the agents whose event includes Move. Then those agents, if they still act, move (`alongEdges`) to their target, which must be their position or one of its neighbors; through an edge missing this step, they stay.
6. `afterMove` hooks. Then each scheduled agent advances in its cycle, keeping its decision as `pending` until its last event.

With atomic cycles a step is the previous round. A robot that a `beforeMove` hook crashes has taken its new state at Compute, before it.

The space state is then forgotten, and successors with the same key merge. Choices are enumerated in order, so successors come in the lexicographic order of their witnesses; a merged successor keeps the first witness, and the union of the agents scheduled by its witnesses.

Initial configurations are the product of the choices of the components' initial values (agent fields per agent, then world fields) and, under `portPermutations .perRobot`, of each agent's permutation.

## Exploration

`Explorer.run()` builds the state graph breadth-first, up to optional depth and state limits, with symmetry reduction unless disabled.

- A state with verdict `failure` is a counterexample (the shortest path to it).
- Under `eventually`, `success` states are not expanded. Bad cycles are searched among the expanded non-`success` states. Under `eventuallyAlways`, among all expanded states, in a strongly connected component containing a non-`success` state.
- A component counts only if it has a cycle (two states, or a self-loop) and, under activation fairness, if every agent that acts in it (flags are constant in a component, since they are never cleared) takes an event on one of its edges. The lasso then visits those edges.
- `incomplete` is returned only when a limit was reached and no counterexample was found. A lasso among expanded states is a genuine counterexample even then.

Counterexamples are replayed concretely, from a concrete initial configuration, so their configurations do not jump around the space.

## Symmetries

The group is derived from the model: the automorphisms of the space that preserve what the frames keep (all of them under `isomorphisms`; those preserving the ports under `identity`; under `portPermutations`, those whose induced port permutation belongs to `among`), provided every component and the task declare `equivariant`. Sensors read only their Look, so they need no claim. An automorphism maps every `Pos` value in the state and transforms the agents' kept permutations. The representative of an orbit is the configuration with the smallest key. Finite graphs compute their group (by backtracking; the port permutation of an automorphism is matched in neighbor order, parallel edges included); `dihedral` and `translationsAndReflection` are fast paths, the latter required on the line. On the line, the representative is always translated so that its positions start at 0, and the mirror image is tried too; quotienting by translations keeps the reachable state space finite when agents stay within a bounded spread. `equivarianceViolations` tests a claim on bounded instances (successors of g·C against g applied to successors of C, and verdicts). In the interpreter, reduction is exact only for algorithms that do not rely on the order of non-symmetric locations.

## Lean

The Lean package is in `lean/` (Lake, no Mathlib). Build with `cd lean && lake build Simulant && lake build Examples`.

| Layer | Where | Origin |
| --- | --- | --- |
| Semantic core: nondeterminism, spaces and views, the round, executions | `lean/Simulant/{ND,Space,Round,Builtins,Exec}.lean` | hand-written |
| Library spaces with closed forms (`Graphs.Cycle`, `Graphs.Line`) | `lean/Simulant/Spaces.lean` | hand-written |
| Generic lemmas: flags, preservation, views under automorphisms, equivariance, non-vacuity, invariants | `lean/Simulant/{Lemmas,Views,Equivariance,NonVacuity,Invariants}.lean` | hand-written |
| Component library | `lean/Simulant/Library/*.lean` | generated: `npx tsx packages/lean-gen/src/library.ts` |
| Library lemmas about components | `lean/Simulant/LibraryLemmas/*.lean` | hand-written |
| Model files | `lean/Examples/<Name>/Model.lean` | generated: `npx tsx packages/lean-gen/src/examples.ts` |
| Proofs | `lean/Examples/<Name>/{Proofs,Equivariance}.lean` | hand-written, checked by `packages/lean-gen/src/check-proofs.ts` |

**Translation.** A choice is `ND.choose site list` in the list monad `ND α := List (Witness × α)`; `Step C w C'` is membership of `(w, C')` in the round, so the computable round is the semantics. Every stage of `Model.roundA` mirrors the interpreter (same order of choices, same sites and indices): the space state (`edges`), the hooks, the activation, then per agent its presentations (`frame aI`, when there are several), its sensors' Look-level choices and its step. The differential test checks this on every conformance fixture (`packages/lean-gen/src/differential.ts`).

**Spaces and views.** A `Space` has positions with decidable equality, ordered neighbor lists, optionally its vertices, its largest degree, the interpreter's physical order of positions, and the position of a vertex number (`ofNat`, `ofInt`), which generated components use for `pos v`, since they are generic over the space. `Graphs.Cycle n` (positions `Fin n`) and `Graphs.Line` (positions `Int`) are written by hand in `Spaces.lean`; the generator uses them when an experiment's space has the library's IR, and generates other graph spaces from their IR (positions `Nat` or `Int`). The r-hop view, the rooted isomorphisms of a view, the presentations under port-based frames and under isomorphisms, the edges of a finite graph and the missing-edge states of a dynamic space follow `packages/engine/src/space.ts`. A location is a `Nat`; a `Look` gives the position behind each location to sensors, and the algorithm reads only `here`, the neighbor lists and distances.

**Reference orderings.** Under `Frames.isomorphisms`, the model takes the reference ordering `ord : RefOrder S` as an argument, and `Statement` and `NonVacuity` quantify over the orderings that satisfy `RefOrder.Lawful` (they enumerate the visible domain and give isomorphic views identical presented structure; docs/core-redesign.md, section 3). The round never uses the law. Differential tests evaluate the round with `RefOrder.physical`, the interpreter's ordering, which is not lawful in general. Under port-based frames, the model takes no ordering.

**Composition.** A configuration is generic over `Sig` (space, number of agents, flags, component agent fields, public state, memory, actions, world, sensor environment). A generated component sees only its own world and agent fields (through the lenses of its `Ctx`), its own flags (a `Flags` class with laws) and its own actions (an `Actions` class); its hooks return effects on its own parts (`OwnEffect`: world, flags, agent fields), lifted by `Hooks.toComponent`. Positions in components are the composition's `σ.S.Pos`. A model file composes the world and agent fields as one structure field per component, so lenses are projections and their laws hold by `rfl`; it proves `others_preserve_<C>` for each component that owns world fields, which is the side condition of library lemmas such as `BlackHole.site_stays`.

**Statements.** A model file defines `Statement` (every admissible execution, for every parameter value in its domain, and every lawful reference ordering under `Frames.isomorphisms`, satisfies the task's goal) and `NonVacuity` (an initial configuration, a successor for every reachable configuration, an admissible execution). The model's arguments are the experiment parameters it reads (the space's arguments, the observation radius, the number of missing edges) and the number of agents; a cycle's size must be a parameter, bound with `[NeZero N]`. Proofs live in a separate file; see [Lean guarantees and limits](architecture.md#lean-guarantees-and-limits) for proof checks and their scope.

**Equivariance.** `Model.step_app` maps steps to steps under a configuration map whose position map is an automorphism of the space (`Space.Auto`), given that the agents' decisions on the mapped configuration include the mapped decisions and that the components do not see the map. `Model.options_app` gives the former under port-based frames, from `Space.view_map` (an automorphism maps a view onto the view of the image), when the sensors read who is at a location rather than positions and the step reads only the locations. The cautious pair's rotation equivariance (`lean/Examples/CautiousPair/Equivariance.lean`) applies both.

**Layout and origins.** The lowered algorithm's `step` and `line` are `match mem.pc with ...` on the program counter; the generator writes their cases one per line (Lean reads line breaks inside parentheses as spaces, so the term is unchanged). `generateMappedModel` also returns, for each part of the file, what it translates: a parameter's domain, the agents, a component, a sensor, a definition, the task, the goal, the algorithm and, for each case of `step`, the program counter it resumes at, or `composition` for the glue between components. The page's Lean view maps these to `.sim` lines through `Experiment.source` and the line table.

**Definitions** of the model, the algorithm and the task are emitted before the model, callees first, as Lean `def`s, once each. Those that involve the composition (positions, agents, configurations, Looks) take the model's arguments first, and algorithm-local ones also the Look and the sensor environment. Definitions with choices are not generated yet.

**Not translated yet.** Native algorithms; port permutations among the symmetries of a space other than the library's cycle and line; Euclidean spaces; `subsets` of a multiset of non-agent values; equality of multisets; labels (`show`, `concat`), which are only for display.
