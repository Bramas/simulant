# Release notes

## Next release (breaking): schedulers

This release moves schedulers into the language ([scheduler-design.md](scheduler-design.md)). It is breaking for `.sim` sources (`round` is gone), the IR (version 3), the engine's configurations (agents may carry a pending decision) and the Lean library (the step runs over events). It is the next minor version (`pnpm release:version minor`).

### Models

- **Schedulers replace rounds.** A model takes a `scheduler` (default `Schedulers.FSync`): `Schedulers.SSync`, `Schedulers.Sequential`, `Schedulers.Async`, `Schedulers.Bounded k`, `Schedulers.Permutation`, or one of your own. `round := .ssync` becomes `scheduler := Schedulers.SSync`; the `Round` type and its constructors are gone.
- **Asynchronous cycles.** A scheduler's `events` cut the Look-Compute-Move cycle into atomic events: one per cycle (the classic rounds), `[[.look, .compute], [.move]]` (LC-atomic), `[[.look], [.compute, .move]]` (CM-atomic) or `[[.look], [.compute], [.move]]` (ASYNC). An agent decides at its Look; its decision stays pending until its Compute (public state, memory, light, pebbles) and its Move, and a Look at the same instant sees the previous state.
- **Writing a scheduler.** A `def … : Scheduler` owns agent and world fields like a component; its `schedule C` returns an effect whose `activate` part lists the agents that take their next event (`C.eligible`: those able to act; `a.phase`: an agent's progress in its cycle; `nonemptySubsets xs`). `fairness := .activation` (default) admits only executions in which every agent that keeps acting takes events infinitely often; `.none` admits all of them.
- **Components act at Compute.** A new hook point, `onCompute`, reads the decisions taking effect. `Storage.Lights` and `Storage.Pebbles` act there; `Faults.CrashAt` stays in `beforeMove`, and a robot it crashes has taken its new state at Compute.

### Tools

- **Engine.** `System.successors` runs a step over events; agents carry `phase` and `pending`. `SystemOptions.scheduler` replaces the model's scheduler (tests). Explanations name the event an agent took and say when its decision stays pending or when it applies an earlier one.
- **Simulator.** Rounds are now steps. Pending moves are drawn as dashed arrows; the state panel shows an agent's phase and pending decision; the model view describes the scheduler, its events and its fairness, and the step phase by phase (`onCompute` included).
- **Lean.** Agents carry their phase and pending decision; schedulers are generated like components (the library's in `Simulant.Library`); `Model.roundA` mirrors the interpreter's step, and the differential test covers asynchronous fixtures. Proofs that destructure the round, `Component.Total`/`Preserves` (four hooks) and `Model.total` (the scheduler's totality) need porting, as the library's examples were. `Model.atomic_step` shows that atomic cycles never leave a decision pending.
- **Site and editor.** The builder offers the library schedulers, asynchronous cuts included; the library page lists them; the guide has a section on schedulers. Completions and hovers know `Scheduler`, `onCompute`, `C.eligible`, `a.phase` and `nonemptySubsets`.

### Upgrading a project

1. Replace `round := .fsync` (or remove it), `.ssync` and `.sequential` with `scheduler := Schedulers.FSync`, `Schedulers.SSync` and `Schedulers.Sequential`.
2. Move component effects that belong to Compute (lights, tokens) from `beforeMove` to `onCompute`.
3. Regenerate the Lean model with `simulant lean` and port proofs to the step over events.

## 0.4.1 (2026-10-22): initializer compatibility

The initializer copies each template entry into the destination, preserving overwrite refusal while accepting both new and existing empty directories on Node.js 24.22. The `0.4.0` tag failed CI before npm publication; `0.4.1` includes the generic-core changes below and this correction.

## 0.4.0 (2026-10-22, breaking): the generic core

This release replaces the ring-based core with a generic one ([core-redesign.md](core-redesign.md)). It is breaking at every level: `.sim` sources, the IR (version 2), the engine's API, the simulator's renderers and the Lean library. It increments the minor version while the packages are `0.x`. Saved links and settings from earlier versions are not kept.

### Models

- **Spaces replace topologies.** A model's space is a graph with ordered neighbor lists (its ports): `Graphs.Cycle N` (including the two-node multigraph), `Graphs.Line` (infinite), `Graphs.Star k`, your own, and `Graphs.Dynamic space k` for an adversary that removes up to `k` edges each round. `Ring` and `DynamicRing k` are gone. Positions have type `Pos` (`pos v`, `positions`), opaque outside experiments and spaces; `Node` and `node` are gone.
- **Observations and frames.** `Observe.radius r` (the r-hop view) or `Observe.full`. Frames are the morphisms through which an agent sees its view: `Frames.identity` (replaces `Frames.common`), `Frames.isomorphisms` (replaces `Frames.dynamicReflection`), `Frames.portPermutations .perLook` / `.perRobot` (replaces `Frames.persistent` and `Frames.PersistentReflection`).
- **Model families.** `robots space observation frames sensors (components := …)` and `blackHoleRobots space policy size (extra := …) (view := …)` replace `obliviousRing` and `blackHoleRing`. No capability is granted implicitly.
- **Sensors receive the Look.** A sensor is `sensor name (L : Look) : T` or, about each location, `sensor name (L : Look) (l : Loc) : T`, with an optional Look-level part (`sensor name (L : Look) where`, then bindings such as `hidden := choose …` and `at (l : Loc) : T := …`). The library's sensors are `occupied`, `count`, `localMultiplicity`, `lossyOccupied k`, `colors`, `ownLight`, `otherStates`, `otherStatesLossy k`, `edgeTo` and `spaceSize`. `ringPresence`, `ringCount`, `ringSize`, `lineView`, `colorView` and `Vision.Radius` are gone: map a per-location sensor over `Line.window`, read `spaceSize`, choose the radius with `Observe.radius`.
- **Components.** `Faults.CrashAt` replaces `Faults.CrashAtNode`; `Storage.Lights k` stores the light as an agent field (`a.light`) updated through effects on agents, without slots or a world list. Fields may have type `Pos`. `@[equivariant]` takes no arguments: it claims commutation with the automorphisms the frames keep.

### Algorithms and tasks

- **Locations instead of directions.** An algorithm reads its Look (`here`, `visible`, `neighbors l`, `distance a b`) and its sensors, and moves to a location: `move Ring.cw`, `move (port i)`, `move l`. `Move`, `.cw`, `.ccw`, `.stay`, `dir.opposite` are gone; a stored direction is a port number (`Port.cw`, `Port.ccw`, `Port.opposite`). Locations are valid for one activation and cannot be stored. Algorithms cannot read parameters.
- **Definitions that read the Look** (`here`, `visible`, `neighbors`, `distance`, a sensor) are algorithm-local: only algorithms call them.
- **Tasks read answers in the agent's terms** with `C.resolve a i` and `C.follow a i k`. Black-hole claims are port numbers (`claim : Option Nat`, `claimPort`, `claimSteps`); `claimDir` is gone.
- **Parameters.** `param x : T := list` is gone: write `param x : T in list`.

### Tools

- **Engine.** `System.observations(config, agent)` lists an agent's sensor values. Step explanations show the Look: each location, the position behind it, its neighbors and the per-location sensor values. A finite space is checked when built: self-loops are rejected. `check-all` shares a state graph among settings with the same instantiated model (space arguments, radius).
- **Simulator.** The default renderer follows the space: rings for cycles, a window of the line, a circular layout for other finite graphs (a star's center in the middle). Under `Frames.isomorphisms`, the model view and the CLI warn that the simulator's reference ordering of locations can leak information on views without symmetry.
- **Lean.** The Lean library has a generic `Space`, Looks and presentations; under `Frames.isomorphisms`, statements quantify over every lawful reference ordering. Generated models take the experiment parameters the model reads and `nAgents`. Proofs about earlier generated models need porting; the library's examples were ported.
- **Editor.** Completions, hovers and the grammar follow the new built-ins.
- **Website.** A guide, a standard-library reference and an interactive model builder document the new core and compile examples in the browser.
- **Release fixes.** Agent-state keys preserve boundaries between component fields and port numbers, so distinct configurations cannot hide a counterexample. Edge sensors reject locations with no connecting edge, in both TypeScript and Lean. Record-valued positions use JSON settings and survive compatible source updates. Lean generation groups a component's initial agent fields into one record.

### Upgrading a project

1. Replace the model: `blackHoleRing p s` becomes `blackHoleRobots (Graphs.Cycle N) p s`; `obliviousRing (view := …) (components := …)` becomes `robots (Graphs.Cycle N) (Observe.radius 1) Frames.isomorphisms [sensors] (components := …)`, with the space, radius and frames of your model.
2. Replace moves and directions: `move .cw` becomes `move Ring.cw`, a stored `Move` becomes a port number.
3. Replace positions: `Node` becomes `Pos`, `node i` becomes `pos i`, `param x : T := …` becomes `param x : T in …`.
4. Replace view sensors with per-location sensors read over the Look (`Line.window`, `neighbors here`).
5. Regenerate the Lean model with `simulant lean` and port proofs to the generic round.
