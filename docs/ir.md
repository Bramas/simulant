# The Simulant IR and its interpreter

Status: version 2, the generic core of [Phase 0](core-redesign.md). The frontend (`packages/lang`) produces and checks it. The interpreter, the explorer, the conformance fixtures and the Lean generator are being ported to it package by package (Phase 0, steps 2 and 6); until then, the sections on the round, exploration and Lean state the contract they must implement. A change to the IR updates, together, the conformance fixtures, the interpreter, the Lean generator and this document. See the [architecture](architecture.md) for package boundaries, and [development](development.md) for verification and known issues.

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
| Spaces, Looks and frames of the semantic core | `packages/engine/src/topology.ts` (being ported) |
| Initial configurations and the standard round | `packages/engine/src/system.ts` |
| Explorer: state graph, verdicts, liveness, counterexamples | `packages/engine/src/explorer.ts` |
| Symmetry reduction, bounded equivariance test | `packages/engine/src/symmetry.ts` |
| Conformance fixtures | `packages/engine/conformance/*.json` (regenerate with `npx tsx packages/engine/conformance/generate.ts`) |
| Library spaces, sensors, components, tasks, families | `packages/stdlib/sim/` ([hand-written builder counterparts for tests](../packages/stdlib/README.md) in `packages/stdlib/test/helpers/`) |

## Experiments

An `Experiment` is JSON data: `irVersion` (2), a `model`, an `algorithm`, a `task`, `params` (name, type, an optional `domain` expression listing the exact finite domain, and an optional Boolean `accepts` refinement), and `agents` (`count`, and `pos`, a position, with the agent index `i` in scope). Experiments compiled from `.sim` also carry `source` (`{ file, line, endLine, uses }`): where the experiment is written and, in `uses`, every declaration it is built from (`kind` among `experiment`, `model`, `space`, `component`, `sensor`, `algorithm`, `task`, `goal`, `definition`, with its name, file and lines), the experiment first, then in order of use. It is for the model view only, like `Algorithm.source`: it has no meaning for the semantics, is ignored by the checker, the interpreter and the Lean generator, and is dropped from conformance fixtures.

A parameter's `domain` is always an exact membership restriction. Its `accepts` predicate adds a property and sees that parameter and earlier parameters; when both fields are present, membership requires both. Settings warnings and Lean's correctness/non-vacuity statements use this intersection. A predicate-only parameter ranges over all values satisfying it; a parameter with neither field ranges over its entire type. Exhaustive enumeration requires a finite `domain` for each parameter and filters through `accepts`. A project's `checkSettings` can supply finite settings separately when a domain cannot be enumerated. Simulator defaults are derived with a bounded search or supplied by the project, and never appear in the IR. These restrictions do not change the transition relation or turn invalid settings into initial configurations with failure: execution remains available outside the declared domain.

Experiment parameters may appear in the model's arguments: a space's `args`, the observation radius, a dynamic space's number of missing edges. They are evaluated per setting. Two settings share a state graph only when their instantiated models are equal; parameters that only set initial values do not prevent sharing, because they are part of the state.

## Models

A `Model` gives its `space`, `observation` and `frames`, its round (`fsync`, `ssync` or `sequential`), its sensors and components, its memory model (`persistent` or `oblivious`), its movement (`alongEdges`) and its symmetries (`derived` or `none`).

**Spaces.** A `graph` space has a vertex type (`Nat`, `Int`, or a record of them), an optional `vertices` list (omitted: an infinite vertex set with finite neighborhoods), and `neighbors`, an expression with one vertex in scope that lists its neighbors in order: that order is its port numbering, and a vertex may appear twice (parallel edges, as in the two-node cycle). `params` and `args` are the space's own parameters and their values, expressions over experiment parameters; the space's expressions see its parameters as variables. `automorphisms` is `computed` (finite graphs), `dihedral n` (the cycle `Nat` mod `n`, whose reflections swap ports 0 and 1) or `translationsAndReflection` (`Int` vertices); an infinite graph must give one. A `dynamic` space wraps a graph: the adversary removes up to `missing` edges at the start of every round. A `euclidean` space is an interface only: the checker rejects it.

**Observations.** `full` (every position and edge, finite spaces only) or `radius r`: the r-hop view, the positions at distance at most `r` and the edges with at least one endpoint at distance less than `r`. An edge between two positions at distance exactly `r` is not visible. The structure of the view is information the observation grants.

**Frames.** The declared morphisms through which agents see their view: `isomorphisms` (any isomorphism of the visible domain fixing the observer, chosen at each Look), `identity` (the space's ports as they are), and `portPermutations` with `when` (`perLook` or `perRobot`) and `among` (`all` or `symmetries`, the permutations induced by automorphisms of the space). A `perRobot` permutation is chosen once per agent, at initialization.

A `Component` owns world fields, agent fields, flags, sensors and actions, gives their initial values, and may define three hooks (`beforeLook`, `beforeMove`, `afterMove`), each an expression with `C : Config` in scope that returns an `effect`. An effect sets the component's own world fields, raises its own flags (on a collection of agents or on those satisfying a predicate), and, with `agents`, a function from an agent to a record, sets its own agent fields. Fields may have type `Pos`. `equivariant` is a claim: the component commutes with the automorphisms that the model's frames keep.

A `Sensor` is what an agent learns from its Look `L`. A per-location sensor (`perLocation`) also receives a location `l`. Its `look` bindings are its Look-level part, evaluated once per Look, which may contain choices; its body sees them, and is deterministic when the sensor is per location. A sensor's result contains no `Pos`, `Agent` or `Loc`. The Look offers `me`, `here`, `visible`, `visibleAgents`, `world` (the components' world fields; a component's sensor reads only its own) and `spaceSize` (finite spaces) as fields, and `occupants(L, l)`, `position(L, l)` and `edgePresent(L, a, b)` as builtins.

An `Algorithm` is an explicit state machine: public state type `pub`, memory type `mem`, their initial values (index `i` in scope, no Look), and `step`, with `mem` and `pub` in scope, which reads its Look through `here`, `visible`, `neighbors(l)` and `distance(a, b)` and its sensors through `sense` expressions, and returns `{ move, pub, mem, ...actions }` where `move` is a location of the Look (`here` to stay). Neither `pub` nor `mem` may contain a location (valid for one activation) or a position (algorithms never see positions); an agent remembers a neighbor by its index in `neighbors(here)`, a port number when the frames keep ports. `native` names a TypeScript step function instead (interpreter only, never translated to Lean). `source` (optional, `{ file, line, endLine, calls?, defs? }`) says where the algorithm is written, in `calls`, for each program-counter value inside inlined procedures, the lines of the calls around it (outermost first), and in `defs`, where the definitions of `defs` are written, for the algorithm view only: it has no meaning for the semantics, is ignored by the Lean generator, and is dropped from conformance fixtures. Expressions of `.sim` algorithms (the step and the definitions it uses) may carry `at`, their source line, also for display only. Structured algorithms are lowered to this form; their program-counter values are numbered by kind in program order (`move1`, `stay1`, `halt1`), and `line` maps them to source lines.

A `Task` has a `verdict` expression (`C` in scope) of type `Verdict` and a `goal`: `eventually` (some state is `success`), `eventuallyAlways` (from some point on, every state is `success`) or `safety`. A reachable `failure` verdict violates every goal. A task reads an answer given in an agent's own terms with `resolve(C, a, i)` (the neighbor of `a.pos` behind the agent's port `i`, in its kept frame) and `follow(C, a, i, k)` (the position after `k` steps through that port). Both are errors under per-Look frames and for a port the vertex does not have.

## Expressions

Every expression is pure, except `choose`, which is an adversary choice. Contexts restrict what may appear:

| Context | `param` | `choose` | Notes |
| --- | --- | --- | --- |
| parameter domains, model arguments | yes | no | `pos(v)` and `positions()` allowed |
| initial values (`init`, agent positions) | yes | yes | choices give several initial configurations |
| space vertices and neighbors | no | no | the space's parameters and one vertex in scope |
| sensors (`L`, `l`) | no | in the Look-level part, and in Look-level sensors | the choices are fixed for the whole Look |
| hooks (`C`) | no | yes | `decisionOf(a)` only in `beforeMove` |
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

A configuration's key is its agents' keys, then the world's. An agent's key is its position, its kept port permutation (under `portPermutations .perRobot`), its flags (one bit each, declaration order), its component fields, its public state and its memory. Under FSYNC, agents are sorted by key (a multiset: anonymous agents gain no order); under SSYNC or sequential scheduling, they keep their index, because fairness is about identity.

Arithmetic follows Lean: `Nat` subtraction and division are truncated, division by zero is zero, `Int` division and modulo are Euclidean. Number literals are `Nat` unless an `Int` is expected.

## The standard round

`System.successors(C)`:

1. The adversary chooses the space state (in a dynamic space: at most `missing` missing edges). Then all `beforeLook` hooks run on the same snapshot and their effects are merged (fields have one owner; flags are merged by "or").
2. Activation: FSYNC activates every agent whose flags do not say `acts never`; SSYNC lets the adversary choose a nonempty set of them; `sequential` chooses exactly one. If none is eligible, the round idles. Both adversarial activation modes require every continuously acting agent to be activated infinitely often, without a bound on finite activation gaps.
3. For each activated agent, its Look: the visible domain around its position, and the order of its locations, the reference ordering followed by a morphism. The interpreter's reference ordering is the order of the physical vertices, which can leak information on views without symmetry (see the warning in [core-redesign.md](core-redesign.md#3-observations-ordering-and-frames)). The morphism is chosen by the adversary from the declared frames: under `isomorphisms`, among the isomorphisms of the visible domain fixing the observer; under `portPermutations`, the agent's kept permutation or one chosen for this Look; under `identity`, none. Then its sensors (one environment per Look, with their choices) and `step`. The decision's location is mapped back to a position through the Look. An agent's decisions are deduplicated by their effect (target position, new state, actions). Agents with `acts adversary` choose any destination the movement allows. The decisions are combined over agents (a product).
4. `beforeMove` hooks, which read the decisions through `decisionOf(a)`: `decided`, `target` (the position it moves to) and its actions. Agents that did not decide have `decided = false` and `target` their position.
5. Move (`alongEdges`): agents that decided and still act move to their target, which must be their position or one of its neighbors; through an edge missing this round, they stay.
6. `afterMove` hooks.

The space state is then forgotten, and successors with the same key merge. Choices are enumerated in order, so successors come in the lexicographic order of their witnesses; a merged successor keeps the first witness, and under SSYNC or sequential scheduling the union of the agents activated by its witnesses.

Initial configurations are the product of the choices of the components' initial values (agent fields per agent, then world fields) and, under `portPermutations .perRobot`, of each agent's permutation.

## Exploration

`Explorer.run()` builds the state graph breadth-first, up to optional depth and state limits, with symmetry reduction unless disabled.

- A state with verdict `failure` is a counterexample (the shortest path to it).
- Under `eventually`, `success` states are not expanded. Bad cycles are searched among the expanded non-`success` states. Under `eventuallyAlways`, among all expanded states, in a strongly connected component containing a non-`success` state.
- A component counts only if it has a cycle (two states, or a self-loop) and, under SSYNC or sequential scheduling, if it is scheduler-fair: every agent that acts in it (flags are constant in a component, since they are never cleared) is activated on one of its edges. The lasso then visits those edges.
- `incomplete` is returned only when a limit was reached and no counterexample was found. A lasso among expanded states is a genuine counterexample even then.

Counterexamples are replayed concretely, from a concrete initial configuration, so their configurations do not jump around the space.

## Symmetries

The group is derived from the model: the automorphisms of the space that preserve what the frames keep (all of them under `isomorphisms`; those preserving the ports under `identity`; under `portPermutations`, those whose induced port permutation belongs to `among`), provided every component and the task declare `equivariant`. Sensors read only their Look, so they need no claim. An automorphism maps every `Pos` value in the state and transforms the agents' kept permutations. The representative of an orbit is the configuration with the smallest key. Finite graphs compute their group; `dihedral` and `translationsAndReflection` are fast paths, the latter required on the line, where quotienting by translations keeps the reachable state space finite. `equivarianceViolations` tests a claim on bounded instances (successors of g·C against g applied to successors of C, and verdicts). In the interpreter, reduction is exact only for algorithms that do not rely on the order of non-symmetric locations.

## Lean

Status: the generator and the Lean core described here translate IR version 1; Phase 0 step 6 rewrites them for version 2 (a generic `Space`, the reference ordering as a parameter satisfying its law, morphisms as choices). Until then, Lean export is unavailable.

The Lean package is in `lean/` (Lake, no Mathlib). Build with `cd lean && lake build Simulant && lake build Examples`.

| Layer | Where | Origin |
| --- | --- | --- |
| Semantic core: nondeterminism, rings, the round, executions | `lean/Simulant/{ND,Ring,Round,Builtins,Exec}.lean` | hand-written |
| Generic lemmas: flags, preservation, equivariance, non-vacuity | `lean/Simulant/{Lemmas,Equivariance,NonVacuity}.lean` | hand-written |
| Component library | `lean/Simulant/Library/*.lean` | generated: `npx tsx packages/lean-gen/src/library.ts` |
| Library lemmas about components | `lean/Simulant/LibraryLemmas/*.lean` | hand-written |
| Model files | `lean/Examples/<Name>/Model.lean` | generated: `npx tsx packages/lean-gen/src/examples.ts` |
| Proofs | `lean/Examples/<Name>/Proofs.lean` | hand-written, checked by `packages/lean-gen/src/check-proofs.ts` |

**Translation.** A choice is `ND.choose site list` in the list monad `ND α := List (Witness × α)`; `Step C w C'` is membership of `(w, C')` in the round, so the computable round is the semantics. Every stage of `Model.roundA` mirrors the interpreter (same order of choices, same sites and indices), which the differential test checks (`packages/lean-gen/src/differential.ts`).

**Composition.** A configuration is generic over `Sig` (space, number of agents, flags, component agent fields, public state, memory, actions, world, view). A generated component sees only its own world and agent fields (through the lenses of its `Ctx`), its own flags (a `Flags` class with laws) and its own actions (an `Actions` class); its hooks return effects on its own part (`OwnEffect`), lifted by `Hooks.toComponent`. A model file composes the world and agent fields as one structure field per component, so lenses are projections and their laws hold by `rfl`; it proves `others_preserve_<C>` for each component that owns world fields, which is the side condition of library lemmas such as `BlackHole.site_stays`.

**Statements.** A model file defines `Statement` (every admissible execution, for every parameter value in its domain, satisfies the task's goal) and `NonVacuity` (an initial configuration, a successor for every reachable configuration, an admissible execution). Proofs live in a separate file; see [Lean guarantees and limits](architecture.md#lean-guarantees-and-limits) for proof checks and their scope.

**Layout and origins.** The lowered algorithm's `step` and `line` are `match mem.pc with ...` on the program counter; the generator writes their cases one per line (Lean reads line breaks inside parentheses as spaces, so the term is unchanged). `generateMappedModel` also returns, for each part of the file, what it translates: a parameter's domain, the agents, a component, a sensor, a definition, the task, the goal, the algorithm and, for each case of `step`, the program counter it resumes at, or `composition` for the glue between components. The page's Lean view maps these to `.sim` lines through `Experiment.source` and the line table.

**Definitions** of the model, the algorithm and the task are emitted before the model, callees first, as Lean `def`s (deterministic ones on values: not yet those on positions, agents or with choices).

**Not translated yet.** Native algorithms; `toList` of a multiset; `subsets` of a multiset of non-agent values; equality of multisets; labels (`show`, `concat`), which are only for display.
