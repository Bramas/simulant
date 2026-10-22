# Stand-Up Indulgent Gathering on Lines

Interactive companion to *A Visibility vs. Memory Trade-off for Stand-Up Indulgent Gathering on Lines*. This project translates the three numbered algorithms in the journal manuscript. It uses the shared Simulant viewer for executions, adversary branches, the configuration graph, algorithm explanations and the model/source view.

| Simulation | Paper | Visibility | Initial parity |
| --- | --- | --- | --- |
| `standup-gathering-h-plus-three` | Algorithm 1, oblivious | φ ≥ max(4, H_init + 3) | odd O_init or odd M_init |
| `standup-gathering-h-plus-one` | Algorithm 2, oblivious | φ ≥ max(4, H_init + 1) | odd O_init |
| `standup-gathering-two-colors` | Algorithm 3, two colors | φ ≥ max(1, H_init) | odd O_init or odd M_init |

H_init is the maximum distance between neighboring occupied nodes, O_init counts distinct occupied nodes, and M_init includes both borders. These are assumptions on the initial configuration; the robots do not know them. The robots are anonymous, disoriented and fully synchronous. The oblivious algorithms have one color; Algorithm 3 starts every light at X and uses X/Y, with Z meaning both colors on one node.

```bash
# From the workspace root
pnpm --filter @bramas/simulant-project-standup-gathering dev
pnpm --filter @bramas/simulant-project-standup-gathering build
pnpm cli check-config -p standup-gathering-two-colors -s '{"positions":[0,2,4],"phi":2}'
pnpm cli check-all -p standup-gathering-h-plus-one
node --import tsx --import ./packages/vite-plugin/src/register.ts --test --test-isolation=none tests/standup-gathering.test.ts
```

Select an algorithm in the top bar and load a saved example. The crash presets fix a node and include recorded executions: border and partial crashes occur in round 1, and the interior crash occurs in round 2. Round 0 is the initial configuration. Step through a preset to replay its crash and subsequent gathering, or choose other adversary branches. In the luminous partial-crash preset, the crash happens after Compute: one robot keeps its new Y light at the crash coordinate while another moves. The luminous drawing uses blue for X and orange for Y, keeping the paper’s letters; a node containing both is Z. Red crosses identify crashed robots in the drawing; robots cannot sense those marks. The presets cover fault-free gathering, fixed-node border and interior crashes, an even occupied count with odd span, and an initial multiplicity that permits partial crashes. The only editable settings are visibility φ, the initial coordinates and the crash node. The settings take one coordinate per robot, so `[0,0,1,2]` places two robots at coordinate 0. Coordinates are sorted by the adapter. Visibility is chosen initially from the algorithm's bound and can be edited. The `.sim` definitions report violated visibility/parity assumptions while allowing runs outside the theorem's scope. Their `where` predicates accept arbitrary valid configurations, including multiplicities, larger hulls and larger visibility; starting configurations and finite check settings are supplied separately in `src/projects.ts`. Parity counts distinct occupied nodes, not individual robots; an even border distance is equivalent to odd M_init.

## Encoding the paper's model

`sim/model.sim` builds the paper's model with the standard `robots` family: the infinite line (`Graphs.Line`), radius-φ views (`Observe.radius phi`), `Frames.isomorphisms` (at each Look, the adversary chooses which side of the line comes first: the robots are disoriented), the per-location sensor `occupied` or, for Algorithm 3, `colors`, and the components `Faults.CrashAt` and, for Algorithm 3, `Storage.Lights 2`. `lineView` and `colorView` read the sensor over `Line.window`, the locations of the view from one end to the other, whose radius the robots read from the view itself: they never see φ or a coordinate. The paper's X = 0 and Y = 1 notation and its X/Y/Z view encoding remain in `sim/two-colors.sim`. Every experiment uses the existing `Gathering` task and its eventual goal. `sim/h-plus-three.sim`, `sim/h-plus-one.sim` and `sim/two-colors.sim` define one Boolean guard per paper rule. Each `main` tests the view and its mirror in priority order, with movement and light updates written directly in the matching branch (`move Ring.cw` goes towards the larger indices of the window). Idle rules also take priority across orientations; the adversary's morphism resolves symmetric directional matches. The guards can be opened below the algorithm view. No branch stores private algorithm memory.

Initial coordinates are positions of the line, so robot and crash-node labels use the same coordinates, with no padding. The general parameter predicates retain the paper's population, parity and visibility assumptions; `requiredVisibility` supplies the radius bound and warning value. Too-small visibility is advisory, and guards remain evaluable below the bound, down to φ = 0 (a robot that sees nothing stays). Structurally invalid settings appear inline without console errors. The finite checks do not prove the unbounded theorem.

`crashNode` fixes the only faulty node. The `Faults.CrashAt` component chooses any subset of correct robots there before movement; choosing the empty subset permits a fault-free execution. Crash presets supply that node and record the round of the crash. The luminous component commits Compute-phase color updates before the crash prevents movement, since both hooks read the same snapshot. This composition uses the standard `Gathering` goal (`eventually success`).

Algorithms 1 and 2 have occupancy detection without lights or light actions. Algorithm 3 uses the generic light component, instantiated with two colors: the light is an agent field, and `colors` observes the set of colors at each location, without multiplicity or fault information. The drawing keeps blue X and orange Y, and the model uses `some X` / `some Y` updates rather than a two-color-specific action type.

`src/projects.ts` supplies the settings adapter and presets; `src/renderer.ts` draws the line, the robots' lights, multiplicities and crashed robots using the drawing theme. The page and graph worker share the same registry. The public website includes this project through its explicit public-project list; no publication or deployment is performed by creating it.

Checks filter the finite settings supplied by `src/projects.ts` through the model domain predicates, then explore every reachable adversary branch, subject to the experiment's state/depth limits. They are evidence for the translation rather than a proof of the paper. Tests additionally compare both two-color examples and the Algorithm 1 example against the manuscript figures, check Algorithm 2’s false-border recovery, and verify that a crash preserves a computed color while preventing movement. The Algorithm 2 illustration disagrees with its formal four-block rules after its first three transitions: the showcase follows the formal rules and proof prose. See [Known issues](../../docs/development.md#known-issues) for coordinates and reproduction.
