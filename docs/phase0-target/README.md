# Phase 0 target sources

Step 0 of the [core redesign](../core-redesign.md#9-steps) writes the `.sim` sources that the rewritten toolchain must accept. They are design files. Today's compiler does not accept them, and they are named `*.sim-design` so that the CLI, the language server and `pnpm sim-types` do not try to compile them. Inside the files, imports use the names the files will have once ported (`std/models.sim`, `./model.sim`). Step 1 is done when these sources typecheck.

| Target | Current source | Notes |
| --- | --- | --- |
| [`stdlib/core.sim-design`](stdlib/core.sim-design) | (built in) | Signatures of the core: spaces, observations, frames, the Look, what algorithms and tasks read |
| [`stdlib/spaces.sim-design`](stdlib/spaces.sim-design) | `Ring`, `DynamicRing` | `Graphs.Cycle` (including the 2-node multigraph), `Graphs.Line`, `Graphs.Star`; `Graphs.Dynamic` is built in |
| [`stdlib/helpers.sim-design`](stdlib/helpers.sim-design) | `Move`, `offset` | `port`, `Ring.cw`/`Ring.ccw`, `Port.cw`/`Port.ccw`/`Port.opposite`, `Line.window` |
| [`stdlib/sensors.sim-design`](stdlib/sensors.sim-design) | `packages/stdlib/sim/sensors.sim` | Look sensors; per-location sensors; `lossyOccupied` with a Look-level choice |
| [`stdlib/components.sim-design`](stdlib/components.sim-design) | `packages/stdlib/sim/components.sim` | `Pos` fields; lights as an agent field updated by a hook |
| [`stdlib/tasks.sim-design`](stdlib/tasks.sim-design) | `packages/stdlib/sim/tasks.sim` | `C.resolve`, `C.follow`; new `Dispersion` |
| [`stdlib/models.sim-design`](stdlib/models.sim-design) | `packages/stdlib/sim/models.sim` | `robots`, `blackHoleRobots` |
| [`starter/main.sim-design`](starter/main.sim-design) | `projects/starter/src/main.sim` | |
| [`black-hole-search/algo0.sim-design`](black-hole-search/algo0.sim-design) … [`algo6`](black-hole-search/algo6.sim-design) | `projects/black-hole-search/sim/algo*.sim` | Every experiment, including `algo5Sync`, `algo6Sync`, `algo6Async` |
| [`standup-gathering/`](standup-gathering/) | `projects/standup-gathering/sim/*.sim` | `Graphs.Line`, `Frames.isomorphisms`, no padding |
| [`star/witnesses.sim-design`](star/witnesses.sim-design) | (new) | `starGathering` (must succeed), `starDispersion` (expected counterexample) |

## How the algorithms were translated

The algorithms keep their logic. A mechanical comparison (translate the target back with the rules below, then diff the algorithm blocks) leaves only the `Pub` field types and comments.

- Black-hole search runs under `Frames.identity`: port 0 is clockwise for every agent, as `.cw` is today. `move .cw` becomes `move Ring.cw` (`port 0`); a stored direction `dir : Move` becomes a port index `dir : Nat`, moved through with `move (port dir)`; `dir.opposite` becomes `Port.opposite dir`; the constants `.cw`/`.ccw` stored in public states become `Port.cw`/`Port.ccw`. Claims are port indices, which the tasks interpret with `C.resolve` and `C.follow`. The outputs `claimDir`/`bhDir` are renamed `claimPort`/`bhPort`. `ringSize` becomes `spaceSize`.
- Stand-up gathering keeps every guard unchanged. `lineView` and `colorView` become algorithm-local definitions of the project that map the per-location sensors `occupied` and `colors` over `Line.window`. The project's own `occupied` helper is renamed `occupiedAt`, because the library sensor now has that name. The `light` action becomes `setLight`, because `light` is now the agent field. The experiments lose `N`, `fitsLine` and the `LineDomain` component; positions are `List Int` and `crashNode` is a `Pos`.

Where writing these files showed that the design needs a change, the change is listed in the step 0 answers and decisions at the end of [core-redesign.md](../core-redesign.md#step-0-answers-and-decisions), and written into its sections 1–8.

## Baselines

The results these sources must reproduce are in [`tests/fixtures/phase0-baselines/`](../../tests/fixtures/phase0-baselines/README.md), written by `scripts/phase0-baselines.ts` from the current code.
