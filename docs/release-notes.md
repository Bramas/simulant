# Release notes

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
