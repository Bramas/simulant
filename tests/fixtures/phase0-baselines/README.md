# Phase 0 baselines

What the current ring-based core computes for the starter, black-hole search and stand-up gathering, recorded before the rewrite of [docs/core-redesign.md](../../../docs/core-redesign.md) deletes it (step 0 of section 9). Step 4 compares the ported projects with these files. The target sources are in [docs/phase0-target/](../../../docs/phase0-target/README.md).

Regenerate with:

```bash
node --import tsx --import ./packages/vite-plugin/src/register.ts scripts/phase0-baselines.ts
```

The whole run takes about eight minutes: about two minutes each for the two pseudo-random latency variants and for `algo6Async` (297,097 states), seconds for the rest. Use `--only algo3,twoColors,decisions` to rerun some files, and `--skip-decisions` to skip the decision tables. Once the old core is deleted, these files can no longer be regenerated: they are the record.

## Files

| File | Experiment | Settings |
| --- | --- | --- |
| `starter/cautiousPair.json` | `projects/starter/src/main.sim` | N = 3..8, every site but node 0 (27) |
| `black-hole-search/algo0.json` … `algo6.json` | `projects/black-hole-search/sim/algo*.sim` | the experiment's whole domain |
| `black-hole-search/algo5Sync.json`, `algo6Sync.json` | the exhaustive variants | the whole domain |
| `black-hole-search/algo5.json`, `algo6.json` | the pseudo-random latency variants | the whole domain, with a state limit of 20000 per setting |
| `black-hole-search/algo6Async.json` | SSYNC variant | N = 5, site = 3 only |
| `standup-gathering/hPlusThree.json`, `hPlusOne.json`, `twoColors.json` | `projects/standup-gathering/sim/*.sim` | the 57 settings of `src/projects.ts` |
| `standup-gathering/decisions.json` | the three rule sets | decisions on exhaustive small views, plus samples |
| `star-witnesses.expected.json` | `docs/phase0-target/star/witnesses.sim-design` | expected results, not measured (no current code) |

Each experiment file records the model's round, frame, memory, goal and derived symmetry group, the limits used, and one line per setting:

- `verdict`: `success`, `failure` or `incomplete`, from an exhaustive check of that setting alone (no graph sharing), with the experiment's limits unless the file says otherwise.
- `counterexample`: `kind` (`failure`: a reachable failing configuration; `lasso`: an execution that never satisfies the goal) and `length` (rounds). For a lasso, also `cycleStart` and `cycleLength`, and `minStem` (below).
- `explored`: the states the check stored, up to the derived symmetry group. The check does not expand failing states, nor successful ones under an `eventually` goal, and stops at the first failing state, so this depends on the goal.
- `reachable`: the configurations reachable from the setting's initial configurations, up to the derived symmetry group, without that pruning; `reachableComplete` is false when the limits stopped the count.
- `reachableLineOrbits` (stand-up only): the same configurations counted up to translations and the reflection of the line (below).

## Skipped or limited

- `algo5` and `algo6` (pseudo-random idling): their state spaces are infinite, so every setting is `incomplete` unless a counterexample is found first (`algo5` fails on N = 2, like `algo5Sync`). They are recorded with a limit of 20000 states per setting instead of the declared 100000, which would take about 25 minutes. Compare them with the same limit.
- `algo6Async`: only the documented counterexample setting (N = 5, site = 3). The whole domain takes much longer than the ordinary suite allows, and checking the whole experiment stops at this first failure anyway.
- `algo0`: the experiment's own limit of 100000 states. On N = 4, site = 1 the limit is reached, but a lasso is found in the explored part. The verdict is reliable; its length and `minStem` depend on the limit.

## Normalization

The baselines store no configurations, only verdicts, lengths, counts and decisions. Normalization therefore concerns what is counted, how settings are written, and how decisions are oriented.

- **Node numbering.** Settings use today's coordinates: node i of `Ring N` is vertex i of `Graphs.Cycle N`, and `site` (a `Node`) is that vertex (`pos i` in the target). On the line, `positions` and `crashNode` are line coordinates; the padding size `N` that the current adapter computes (`max(64, …)`) is recorded but has no counterpart on `Graphs.Line`.
- **Chiral orientation.** Today's `.cw` is +1 on the ring; it is port 0 of `Graphs.Cycle` under `Frames.identity`. Black-hole search uses common chirality, so its derived group is the rotations only, as for `Frames.identity` in the target. Reflections are never used to merge black-hole configurations.
- **Agents.** Under FSYNC, agents are anonymous and stored as a sorted multiset, so the order of agents never affects a count. Under SSYNC (`algo6Async`), agents keep their identities in states because fairness depends on them, and the counts include them. The target engine must do the same.
- **Counting up to symmetry.** `explored` and `reachable` count canonical representatives under the model's derived group. For the cycles, that group is the rotations, which `Frames.identity` keeps in the target, so these counts must match exactly.
- **The line.** The stand-up models run today on a padded ring with `symmetries := .none`, and lights are a world list indexed by internal slots. `reachableLineOrbits` counts what the target engine will store on `Graphs.Line` with the derived group of `Frames.isomorphisms` (translations and the reflection). Each configuration is reduced to its agents as sorted (position, crashed, light) triples and its crash node. They are translated so that the smallest of these positions is 0, and the smaller of the key and its mirror image is kept. Light slots disappear, as they do with the target's light agent field. Where `reachableLineOrbits` differs from `reachable` (12 of the 57 settings), the difference comes from slot permutations, translations and mirror images, which the target merges. Step 4 compares the line models with `reachableLineOrbits`. The padding keeps every observation and move away from the wraparound, so no wrapped configuration is counted.
- **Counterexample lengths.** A `failure` counterexample is a shortest path (breadth-first search), so its length is canonical and must match. A lasso's `length` and `cycleStart` depend on the explorer's numbering of states, which a new engine may change. `minStem` is canonical. It is the smallest breadth-first depth of a state on a nontrivial strongly connected component that contains a non-successful state. It is computed on the explored graph, FSYNC only. Compare the verdict, the kind and `minStem`; the explorer's own lasso length is recorded for information.
- **Decisions.** `decisions.json` gives, for each rule set, the decision on every view of the listed radii in a documented enumeration order (in the file). Moves are relative to the view: `+` towards larger indices (today's `.cw`; in the target, `Ring.cw` = `port 0`, the k > 0 side of `Line.window`), `-` towards smaller indices, `0` stay. The two-color codes add the light request (`X`, `Y`, or `_` for none). Codes relative to the view do not depend on the morphism, so they compare directly with the target's decisions on the same window.

## Decision tables

As in the readability-refactor comparison of `docs/development.md`, the tables cover:

- `hPlusThree` and `hPlusOne`: every occupancy view of radius 1 to 7 with the center occupied, 21,844 views each.
- `twoColors`: every color-set view of radius 1 to 3 with a nonempty center, 13,104 views.
- 10,000 deterministic samples of radius 4 to 8, stored with their views.

That is 66,792 views in total.
