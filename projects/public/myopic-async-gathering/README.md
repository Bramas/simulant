# Myopic asynchronous gathering on rings

P07 · executable first case · self-reviewed translation, bounded evidence.

Source: Kamei, Lamani, Ooshita, Tixeuil and Wada, *Gathering on Rings for Myopic
Asynchronous Robots with Lights*, OPODIS 2019. Implementation version:
[arXiv:1911.04757v1](https://arxiv.org/abs/1911.04757v1), Algorithm 1,
including the explicit radius-one rules in §3.1.1.

## Implemented scope

[algorithm1.sim](sim/algorithm1.sim) implements the odd-block algorithm at **φ = 1**.
R2a/R3a are disabled in this specialization; R2b/R3b require a white neighbor and
R5 requires a singly-blue neighbor. Higher radii and Algorithm 2 remain backlog.

| Assumption | Representation |
| --- | --- |
| Anonymous cycle, no chirality | `Graphs.Cycle N`, `Frames.isomorphisms` |
| One-hop, full-light observations | `Observe.radius 1`, `colors` and `ownLight`; no counts |
| White/Red/Blue | `Storage.Lights 3`, initially 0; Red = 1, Blue = 2 |
| Oblivious robots | Unit public/private state; no identifiers or size/population sensor |
| Fair ASYNC, atomic moves | `Schedulers.Async`; separate L/C/M events and pending decisions |
| Odd occupied block, towers allowed | `admittedBlock`; sorted positions normalized to start at 0 |
| Outer hole longer than φ | At least two empty nodes outside the occupied interval |
| Fixed-node gathering | `MeetingSite` history and `eventually always .success` |

The radius-one initial class has consecutive occupied nodes with an odd count
of at least three. Multiplicity is unrestricted. Choosing the block to start at
vertex 0 supplies representatives up to rotation; it is not robot knowledge.
The admitted domain is unbounded; registry samples are finite checks only.

## Rule mapping and specification

The source labels R0, R1, R2b, R3b, R4a/R4b and R5 follow Algorithm 1's priority.
Every asymmetric guard is checked in both orientations. R0 does not cancel a
decision from an earlier Look.

`MeetingSite` records occupied positions after every global step. It reports
success only when all robots occupy the same single position as in the preceding
configuration. Eventual permanent success therefore excludes a group moving
together forever. An old pending move can invalidate a temporary success.
This monitor has no sensor and adds no algorithm knowledge.

## Run and reproduce

From the workspace root:

~~~bash
pnpm --filter @bramas/simulant-project-myopic-async-gathering dev
pnpm cli check-all -p myopic-async-gathering-phi-one
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/public-literature.test.ts
pnpm cli lean -p myopic-async-gathering-phi-one -o /private/tmp/myopic-gathering-lean --build
~~~

Presets include three robots, a border tower and a larger five-node block.
Disc colors identify agents; adjacent W/R/B letters display their actual lights.
The default 100,000-state limit may leave larger cases incomplete.

## Evidence and remaining work

The initial reduced checks at N = 5 pass for positions `[0,1,2]`,
`[0,0,1,2]` and `[0,1,1,2]`: respectively 2,002, 19,778 and 20,276 states.
Tests cover mirrored guards, mixed-color/equal-color towers, Compute-time light
updates, pending departure and stationarity. Generated Lean compiles; no
non-vacuity or correctness theorem has been proved.

The simulator uses its documented physical reference ordering; Lean statements
quantify over lawful orderings. The radius-one rules read only the two ports and
their colors. General equivariance/correspondence remains a proof obligation.
This is a partial paper artifact, not coverage of higher-radius algorithms or
all the paper's results. Next: reproduce the asynchronous figure, audit φ > 1,
then translate the second algorithm.
