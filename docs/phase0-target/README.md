# Phase 0 target sources

Step 0 of the [core redesign](../core-redesign.md#9-steps) wrote the `.sim` sources that the rewritten toolchain must accept, as `*.sim-design` files in this directory. Step 1 moved the standard library's targets into [`packages/stdlib/sim/`](../../packages/stdlib/sim/), and step 4 moved the project targets to the projects, replacing their sources. What remains here is [`stdlib/core.sim-design`](stdlib/core.sim-design), the signatures of the built-in core (spaces, observations, frames, the Look, what algorithms and tasks read), which no file compiles. `packages/lang/test/targets.test.ts` compiles the ported sources.

| Target | Now | Notes |
| --- | --- | --- |
| [`stdlib/core.sim-design`](stdlib/core.sim-design) | (built in) | Signatures of the core |
| [`spaces.sim`](../../packages/stdlib/sim/spaces.sim) | replaces `Ring`, `DynamicRing` | `Graphs.Cycle` (including the 2-node multigraph), `Graphs.Line`, `Graphs.Star`; `Graphs.Dynamic` is built in |
| [`helpers.sim`](../../packages/stdlib/sim/helpers.sim) | replaces `Move`, `offset` | `port`, `Ring.cw`/`Ring.ccw`, `Port.cw`/`Port.ccw`/`Port.opposite`, `Line.window` |
| [`sensors.sim`](../../packages/stdlib/sim/sensors.sim) | | Look sensors; per-location sensors; `lossyOccupied` with a Look-level choice |
| [`components.sim`](../../packages/stdlib/sim/components.sim) | | `Pos` fields; lights as an agent field updated by a hook |
| [`tasks.sim`](../../packages/stdlib/sim/tasks.sim) | | `C.resolve`, `C.follow`; new `Dispersion` |
| [`models.sim`](../../packages/stdlib/sim/models.sim) | | `robots`, `blackHoleRobots` |
| starter | [`projects/starter/src/main.sim`](../../projects/starter/src/main.sim) | |
| black-hole search | [`projects/black-hole-search/sim/algo*.sim`](../../projects/black-hole-search/sim/) | Every experiment, including `algo5Sync`, `algo6Sync`, `algo6Async` |
| stand-up gathering | [`projects/standup-gathering/sim/*.sim`](../../projects/standup-gathering/sim/) | `Graphs.Line`, `Frames.isomorphisms`, no padding |
| star witnesses | `starGathering`, `starDispersion` in [`conformance.sim`](../../packages/stdlib/sim/conformance.sim) | `starGathering` succeeds, `starDispersion` has the expected counterexample |

## How the algorithms were translated

The algorithms keep their logic. A mechanical comparison (translate the target back with the rules below, then diff the algorithm blocks) leaves only the `Pub` field types and comments.

- Black-hole search runs under `Frames.identity`: port 0 is clockwise for every agent, as `.cw` is today. `move .cw` becomes `move Ring.cw` (`port 0`); a stored direction `dir : Move` becomes a port index `dir : Nat`, moved through with `move (port dir)`; `dir.opposite` becomes `Port.opposite dir`; the constants `.cw`/`.ccw` stored in public states become `Port.cw`/`Port.ccw`. Claims are port indices, which the tasks interpret with `C.resolve` and `C.follow`. The outputs `claimDir`/`bhDir` are renamed `claimPort`/`bhPort`. `ringSize` becomes `spaceSize`.
- Stand-up gathering keeps every guard unchanged. `lineView` and `colorView` become algorithm-local definitions of the project that map the per-location sensors `occupied` and `colors` over `Line.window`. The project's own `occupied` helper is renamed `occupiedAt`, because the library sensor now has that name. The `light` action becomes `setLight`, because `light` is now the agent field. The experiments lose `N`, `fitsLine` and the `LineDomain` component; positions are `List Int` and `crashNode` is a `Pos`.

Where writing these files showed that the design needs a change, the change is listed in the step 0 answers and decisions at the end of [core-redesign.md](../core-redesign.md#step-0-answers-and-decisions), and written into its sections 1–8.

## Baselines

The results these sources must reproduce are in [`tests/fixtures/phase0-baselines/`](../../tests/fixtures/phase0-baselines/README.md), recorded from the old core; `scripts/phase0-compare.ts` compares the ported projects with them.
