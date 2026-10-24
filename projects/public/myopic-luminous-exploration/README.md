# Ring exploration with myopic luminous robots

P03 · executable first case · self-reviewed translation, bounded evidence.

Source: Ooshita and Tixeuil, *Ring Exploration with Myopic Luminous Robots*,
Information and Computation (2022). The pinned implementation source is
[arXiv:1805.03965v1](https://arxiv.org/abs/1805.03965v1),
Algorithm 2 and Theorem 9; other versions/results require a separate comparison.

## Implemented scope

[algorithm2.sim](sim/algorithm2.sim) translates the five rules for three
fully synchronous robots with two colors. White = 0, Green = 1.

| Assumption | Representation |
| --- | --- |
| Cycle with N ≥ 3, no orientation | `Graphs.Cycle N`, `Frames.isomorphisms` |
| Radius-one multiset color view | `colorCounts` returns W/G counts per location |
| Two persistent colors, no other algorithm memory | `InitialLights`, oblivious model |
| FSYNC | Default `Schedulers.FSync` |
| Designated starts | Three consecutive positions; WWW, GWW, WWG or GWG |
| Terminating exploration | Collective visits and eventual rule-disabledness |

Both orientations are tested for asymmetric guards. For symmetric GWG, the
Look's two reflected presentations provide both permitted directions.

## Source mapping and task instrumentation

The source comments identify 0GW, 0WG, 0WW, GWW and GWG. The first two steps
of the WWW example reproduce the paper's Figure 2, including both GWG choices.

`Monitors.Visited` records coverage. A matched rule additionally sets the
`ruleEnabled` action, and the hidden `RuleActivity` component records that
Boolean at Compute. Every robot reports every FSYNC round. With no enabled rule
the configuration cannot change, so eventual permanent false reports express
eventual rule-disabledness with a one-round observation delay. A coverage-only
verdict would be weaker. The instrumentation is specific to this FSYNC case;
it is not a general enabled-agent scheduler.

There is no sensor for activity or visits. The algorithm's public/private state
remains Unit. `InitialLights` retains its input list as a hidden world field
so the current Lean exporter can infer the initializer parameter type.
Erasure of this specification instrumentation and correspondence with the
paper remain proof obligations.

## Run and reproduce

From the workspace root:

~~~bash
pnpm --filter @bramas/simulant-project-myopic-luminous-exploration dev
pnpm cli check-all -p myopic-luminous-exploration-three-fsync
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/public-literature.test.ts
pnpm cli lean -p myopic-luminous-exploration-three-fsync -o /private/tmp/myopic-exploration-lean --build
~~~

Disc colors identify agents; adjacent W/G letters display their actual lights.

The general domain allows every N ≥ 3. The registry checks N = 3–12 and all
four designated color starts (40 settings). Presets use JSON text for the
color lists to avoid the existing generic editor's array-preset limitation.

## Evidence and remaining work

All 40 settings pass reduced and unreduced checks. Tests also reproduce the
WWW example, reject coverage while rules remain active and check that terminal
reports agree with possible decisions. Generated Lean compiles; no
non-vacuity or correctness theorem has been proved.

The documented simulator ordering shortcut and lawful-ordering Lean
quantification apply. This artifact does not cover perpetual exploration,
the SSYNC/ASYNC algorithms, universality or impossibility proofs. Next: establish
the instrumentation correspondence in Lean and audit the recurrence cases.
