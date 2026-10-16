# The Simulant IR and its interpreter

Status: version 1. A change to the IR updates, together, the conformance fixtures, the interpreter, the Lean generator and this document. See the [architecture](architecture.md) for package boundaries and design choices, and [development](development.md) for verification and known issues.

## Where things are

| Piece | File |
| --- | --- |
| IR types (`Experiment`, `Model`, `Component`, `Expr`, ...) | `packages/lang/src/ir.ts` |
| Builtin functions and their typing rules | `packages/lang/src/builtins.ts` |
| Composition (which fields, flags, sensors, actions exist, and their owners) | `packages/lang/src/layout.ts` |
| Typechecker and validation | `packages/lang/src/check.ts` |
| TypeScript builder used by tests | `packages/lang/src/builder.ts` |
| Values, canonical encodings, symmetry action on values | `packages/engine/src/values.ts` |
| Compiler from IR to closures | `packages/engine/src/compile.ts` |
| Topologies of the semantic core | `packages/engine/src/topology.ts` |
| Initial configurations and the standard round | `packages/engine/src/system.ts` |
| Explorer: state graph, verdicts, liveness, counterexamples | `packages/engine/src/explorer.ts` |
| Symmetry reduction, bounded equivariance test | `packages/engine/src/symmetry.ts` |
| Conformance fixtures | `packages/engine/conformance/*.json` (regenerate with `npx tsx packages/engine/conformance/generate.ts`) |
| Library components, sensors, tasks, families | `packages/stdlib/sim/` ([hand-written builder counterparts for tests](../packages/stdlib/README.md) in `packages/stdlib/test/helpers/`) |

## Experiments

An `Experiment` is JSON data: `irVersion` (1), a `model`, an `algorithm`, a `task`, `params` (name, type, and a domain expression listing the values for `check-all`), and `agents` (`count`, and `pos` with the agent index `i` in scope). Experiments compiled from `.sim` also carry `source` (`{ file, line, endLine, uses }`): where the experiment is written and, in `uses`, every declaration it is built from (`kind` among `experiment`, `model`, `component`, `sensor`, `algorithm`, `task`, `goal`, `definition`, with its name, file and lines), the experiment first, then in order of use. It is for the model view only, like `Algorithm.source`: it has no meaning for the semantics, is ignored by the checker, the interpreter and the Lean generator, and is dropped from conformance fixtures.

A `Model` names its topology (`ring` or `dynamicRing k`, with a size expression) and its round (`fsync`, `ssync` or `sequential`), lists its sensors and components, and chooses its memory model (`persistent` or `oblivious`), frame model (`common`, `dynamicReflection`, or `persistent` with an agent field of type `Frame`), movement (`rigid`) and symmetries (`derived` or `none`).

A `Component` owns world fields, agent fields, flags, sensors and actions, gives their initial values, and may define three hooks (`beforeLook`, `beforeMove`, `afterMove`), each an expression with `C : Config` in scope that returns an `effect`. An effect sets the component's own world fields and raises its own flags, on a collection of agents or on the agents satisfying a predicate.

An `Algorithm` is an explicit state machine: public state type `pub`, memory type `mem`, their initial values (index `i` in scope), and `step`, with `mem`, `pub` and `view` (one field per sensor in `uses`) in scope, returning `{ move, pub, mem, ...actions }`. Moves are local. `native` names a TypeScript step function instead (interpreter only, never translated to Lean). `source` (optional, `{ file, line, endLine, calls?, defs? }`) says where the algorithm is written, in `calls`, for each program-counter value inside inlined procedures, the lines of the calls around it (outermost first), and in `defs`, where the definitions of `defs` are written, for the algorithm view only: it has no meaning for the semantics, is ignored by the Lean generator, and is dropped from conformance fixtures (it holds an absolute path). Expressions of `.sim` algorithms (the step and the definitions it uses) may carry `at`, their source line, also for display only (the explanation of a step: which statement decided, which line each definition returned from); the checker, the interpreter's normal evaluation and the Lean generator ignore it. Structured algorithms are lowered to this form; their program-counter values are numbered by kind in program order (`move1`, `stay1`, `halt1`), and `line` maps them to source lines.

A `Task` has a `verdict` expression (`C` in scope) of type `Verdict` and a `goal`: `eventually` (some state is `success`), `eventuallyAlways` (from some point on, every state is `success`) or `safety`. A reachable `failure` verdict violates every goal.

## Expressions

Every expression is pure, except `choose`, which is an adversary choice. Contexts restrict what may appear:

| Context | `param` | `choose` | Notes |
| --- | --- | --- | --- |
| parameter domains, topology size | yes | no | `node(n)` and node literals allowed |
| initial values (`init`, agent positions) | yes | yes | choices give several initial configurations |
| sensors (`C`, `me`, `frame`) | no | yes | a choice is fixed for the whole activation |
| hooks (`C`) | no | yes | `decisionOf(a)` only in `beforeMove` |
| algorithms (`mem`, `pub`, `view`) | no | no | only the sensors in `uses`; no builtin that reads the configuration |
| tasks (`C`) | no | no | may read `a.mem` (nothing else may) |

Lambdas (`fn`) only appear as builtin arguments; their parameter types are inferred and must be deterministic. Definitions (`Def`) are named, typed, non-recursive functions; a definition is nondeterministic when its body contains a choice, directly or through a call. The comparisons `lt`, `le`, `gt`, `ge` take numbers, or two lists of `Bool` or of `Nat` (lexicographic, `false < true`, a prefix first: Lean's `List.lt`).

The type `pub` stands for the algorithm's public state inside library pieces (`otherStates : Multiset Pub`). Record types are compared by field names, not order. Agents (`Agent`) are references valid within one round and cannot be stored.

## Values and encodings

| Type | Value | Encoding |
| --- | --- | --- |
| `Unit`, `none` | `null` | empty, `-` |
| `Bool` | boolean | `0`, `1` |
| `Nat`, `Int`, `Node`, `Agent` | number | decimal |
| `Frame` (ring) | boolean (mirrored) | `i`, `m` |
| `Move`, enums, `Verdict` | constructor name | the name |
| `String` | string | JSON string |
| `Option T` | `null` or the value | `-` or `+` then the value |
| records | object | `{` fields in declared order, comma-separated `}` |
| `List`, `Multiset` | array (multisets sorted by encoding) | `[` elements `]` |

A configuration's key is its agents' keys, then the world's. An agent's key is its position, its flags (one bit each, declaration order), its component fields, its public state and its memory. Under FSYNC, agents are sorted by key (a multiset: anonymous agents gain no order); under SSYNC or sequential scheduling, they keep their index, because fairness is about identity.

Arithmetic follows Lean: `Nat` subtraction and division are truncated, division by zero is zero, `Int` division and modulo are Euclidean.

## The standard round

`System.successors(C)`:

1. The adversary chooses the topology state (on `dynamicRing k`: at most `k` missing edges). Then all `beforeLook` hooks run on the same snapshot and their effects are merged (fields have one owner; flags are merged by "or").
2. Activation: FSYNC activates every agent whose flags do not say `acts never`; SSYNC lets the adversary choose a nonempty set of them; `sequential` chooses exactly one. If none is eligible, the round idles. Both adversarial activation modes require every continuously acting agent to be activated infinitely often, without a bound on finite activation gaps.
3. For each activated agent: a frame (one per model frame rule), its sensors (each evaluated once, with its choices), and `step`. The local move is mapped through the frame. An agent's decisions are deduplicated by their effect (global move, new state, actions). Agents with `acts adversary` choose any move. The decisions are combined over agents (a product).
4. `beforeMove` hooks, which read the decisions through `decisionOf(a)` (total: agents that did not decide have `decided = false` and move `stay`).
5. Move: agents that decided and still act apply their decision; rigid movement follows an edge only when it is present in this round's topology state.
6. `afterMove` hooks.

The topology state is then forgotten, and successors with the same key merge. Choices are enumerated in order, so successors come in the lexicographic order of their witnesses; a merged successor keeps the first witness, and under SSYNC or sequential scheduling the union of the agents activated by its witnesses.

Initial configurations are the product of the choices of the components' initial values (agent fields per agent, then world fields).

## Exploration

`Explorer.run()` builds the state graph breadth-first, up to optional depth and state limits, with symmetry reduction unless disabled.

- A state with verdict `failure` is a counterexample (the shortest path to it).
- Under `eventually`, `success` states are not expanded. Bad cycles are searched among the expanded non-`success` states. Under `eventuallyAlways`, among all expanded states, in a strongly connected component containing a non-`success` state.
- A component counts only if it has a cycle (two states, or a self-loop) and, under SSYNC or sequential scheduling, if it is scheduler-fair: every agent that acts in it (flags are constant in a component, since they are never cleared) is activated on one of its edges. The lasso then visits those edges.
- `incomplete` is returned only when a limit was reached and no counterexample was found. A lasso among expanded states is a genuine counterexample even then.

Counterexamples are replayed concretely, from a concrete initial configuration, so their configurations do not jump around the ring.

## Symmetries

The group is derived (`derivedGroup`): rotations if every component, sensor and the task declare rotation equivariance; reflections if, in addition, they declare reflection equivariance and the frame model is `dynamicReflection` or `persistent`. An automorphism maps every `Node` value and composes every `Frame` value; moves and other values are local and unchanged. The representative of an orbit is the configuration with the smallest key. `equivarianceViolations` tests a claim on bounded instances (successors of g·C against g applied to successors of C, and verdicts).

## Lean

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

**Composition.** A configuration is generic over `Sig` (ring size, number of agents, flags, component agent fields, public state, memory, actions, world, view). A generated component sees only its own world and agent fields (through the lenses of its `Ctx`), its own flags (a `Flags` class with laws) and its own actions (an `Actions` class); its hooks return effects on its own part (`OwnEffect`), lifted by `Hooks.toComponent`. A model file composes the world and agent fields as one structure field per component, so lenses are projections and their laws hold by `rfl`; it proves `others_preserve_<C>` for each component that owns world fields, which is the side condition of library lemmas such as `BlackHole.site_stays`.

**Statements.** A model file defines `Statement` (every admissible execution, for every parameter value in its domain, satisfies the task's goal) and `NonVacuity` (an initial configuration, a successor for every reachable configuration, an admissible execution). Proofs live in a separate file; see [Lean guarantees and limits](architecture.md#lean-guarantees-and-limits) for proof checks and their scope.

**Layout and origins.** The lowered algorithm's `step` and `line` are `match mem.pc with ...` on the program counter; the generator writes their cases one per line (Lean reads line breaks inside parentheses as spaces, so the term is unchanged). `generateMappedModel` also returns, for each part of the file, what it translates: a parameter's domain, the agents, a component, a sensor, a definition, the task, the goal, the algorithm and, for each case of `step`, the program counter it resumes at, or `composition` for the glue between components. The page's Lean view maps these to `.sim` lines through `Experiment.source` and the line table.

**Definitions** of the model, the algorithm and the task are emitted before the model, callees first, as Lean `def`s (deterministic ones on values: not yet those on nodes, agents or with choices).

**Not translated yet.** Native algorithms; `toList` of a multiset; `subsets` of a multiset of non-agent values; equality of multisets; labels (`show`, `concat`), which are only for display.
