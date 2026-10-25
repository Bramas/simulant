# Public projects: formalizing the mobile-robot literature

Planning draft · revised 25 October 2026 against the implemented graph core, scheduler DSL and planar visualization companion

## Purpose

Build a broad, public collection of executable formalizations of published research on mobile agents and autonomous robots operating in the Look–Compute–Move (LCM) model. Each project should let a reader compare a paper's assumptions and algorithm with its `.sim` translation, explore executions, reproduce finite checks, and inspect the corresponding Lean model where supported.

Start with graph and ring models, where Simulant already has useful infrastructure, while maintaining a catalog that includes grids, tori and continuous geometric models. The long-term objective is coverage of as much of the literature as practical. The first objective is a repeatable process that makes each additional paper cheaper to translate without weakening its model.

This document proposes a research and implementation program. The catalog below is an initial screening list, not a completed literature review or a commitment to implement every entry. Creating this plan does not publish new projects.

## What counts as a project

Use one public project per paper or closely related conference/journal version family. A project can expose several named experiments for its numbered algorithms and model variants. Record each algorithm and theorem separately so that translating one algorithm does not imply that the whole paper has been covered.

Keep three counts: distinct papers, translated algorithms, and covered claims. Several parameter settings, presets or scheduler variants of one algorithm do not count as additional papers. Link conference papers, journal extensions, preprints and corrections in one bibliographic record; split them only when the extension contributes substantially different results that warrant a separate artifact.

Include deterministic LCM algorithms, stateful mobile-agent protocols with clearly specified observations and movement, fault-tolerant variants, exploration, rendezvous, gathering and formation tasks. Include impossibility and lower-bound results in the catalog, even when their artifact initially consists of examples illustrating the obstruction. An example is not a formalization of the general impossibility proof.

Published conference and journal papers form the main collection. Preprints may enter the discovery backlog but remain explicitly marked until publication is verified. Surveys and books guide discovery; their cited original papers supply the implementation targets.

## Current starting point

The implementation baseline is described in [architecture.md](architecture.md), [sim-language.md](sim-language.md) and the [standard-library README](../packages/stdlib/README.md). Verification commands and existing limitations are maintained in [development.md](development.md).

| Capability | Available foundation | Consequence for this program |
| --- | --- | --- |
| Space | Generic graph definitions; library `Graphs.Cycle`, `Graphs.Line`, `Graphs.Star`; `Graphs.Dynamic base missing` | Lines run without padding. Finite grids/tori are library graph work; infinite-grid automorphisms and executable Euclidean geometry still need support. |
| Scheduling | Library `Schedulers.FSync`, `SSync`, `Sequential`, `Async events`, `Bounded k`, `Permutation` | Audit discrete ASYNC papers now. Look snapshots produce pending decisions; public state, memory, lights and pebbles apply at Compute; graph moves are atomic. `Permutation` chooses a new order each pass, not a fixed round-robin order. |
| Observations | Opaque `Loc` distinct from `Pos`; full/radius observations; declared isomorphisms or port frames; per-location occupancy, counts, local weak multiplicity and colors | Reuse sensors across topologies. Radius-r observations omit edges between boundary vertices. Observation radius and frames are model assumptions, not sensor-specific ring encodings. |
| State and effects | Oblivious/persistent families, owned agent fields, lights, pebbles, crash policies, black holes, four component hook points | New reusable policies usually belong in `.sim`. Check initialization, self-light visibility, fault phase and resource budgets against the paper. |
| Exploration | Reachable state graphs, safety failures, liveness checks and replayable counterexamples | State the tested settings, reductions and resource limits. Unbounded memory can prevent finite exploration even on a small ring. |
| Lean | Generated models and statements, with hand-written proofs supported for a translated subset | Generation, compilation, non-vacuity and correctness proofs are separate achievements. |

The original public paper projects are [black-hole search](../projects/black-hole-search/) and [stand-up gathering on lines](../projects/standup-gathering/README.md). New partial artifacts are indexed under [projects/public](../projects/public/README.md), including P03, P04, P07, P21 and P22. They include model contracts, rule mappings, examples, finite checks and Lean compilation evidence; none has an unbounded correctness proof. The [starter](../projects/starter/README.md) is a development example, not an additional paper.

In particular, the existing `algo6Async` experiment still selects `Schedulers.SSync`: its name does not mean it uses separate L/C/M events. The latency variants also retain synchronous pseudo-random idling. Preserve those reference variants and their recorded failures; any event-based ASYNC translation is a separately audited experiment, rather than an automatic scheduler substitution.

The graph part of [Phase 0](core-redesign.md) is complete, including the public-project ports and recorded baseline comparisons. The [scheduler implementation](scheduler-design.md) adds separate Look/Compute/Move events, activation fairness and stateful schedulers on that base (IR version 3). Private migration results remain in the private repository. Euclidean spaces remain interfaces; this plan does not treat them as executable.

Preserve the chosen reference-ordering tradeoff: the simulator uses a physical ordering under `Frames.isomorphisms`, while generated Lean statements quantify over lawful orderings. A bounded run with that implementation order is evidence about that run; it is not a proof under anonymity. Canonical ordering is a possible later improvement, not a prerequisite for starting this collection. Reflection comes from the admitted view isomorphisms; do not add a second ring-specific reflection mechanism.

The main remaining gaps are recurrence and composed temporal specifications, enabledness/terminality, richer dynamic-edge policies and transit feedback, selected library contracts, and the documented Lean export/proof limits. A new scheduler can often be written in `.sim`; a new fairness kind, moving-phase semantics or probability interpretation still changes the core.

## Discovering and selecting papers

1. **Build the bibliography.** Search proceedings and journals including DISC, PODC, OPODIS, SIROCCO, SSS, SAND, ICDCN, Distributed Computing, Theoretical Computer Science, Information and Computation, Theory of Computing Systems and The Computer Journal. Use publisher pages, author repositories, HAL and arXiv to obtain source texts. Bibliographic indexes help discovery and deduplication.
2. **Search by both task and capability.** Combine “Look Compute Move”, “mobile agents”, “oblivious robots”, “luminous robots” and “myopic robots” with gathering, rendezvous, exploration, dispersion, scattering, pattern formation, circle formation, black-hole search, crash, Byzantine, ring, line, grid and torus. Include ASYNC papers even when they require later work.
3. **Follow references and later work.** For each admitted paper, inspect its related work, earlier algorithm versions, later corrections and papers that reuse the same model. Expand by model family to maximize reusable components.
4. **Screen before implementing.** Read the complete model, algorithm and target theorem. Record the exact paper version and page/section/algorithm/theorem locators. Abstract-level screening establishes interest, not semantic compatibility.
5. **Keep rejected and deferred entries.** Record reasons such as duplicate version, outside LCM scope, inaccessible algorithm, unsupported semantics or unresolved ambiguity. A deferred paper stays visible in the program.

For each search pass, record the date, venue/year range or query, number of new records and deduplication decisions. This makes “broad coverage” measurable and exposes gaps. Do not claim completeness from this seed list.

Use these fit categories after full-text review:

| Fit | Meaning | Scheduling decision |
| --- | --- | --- |
| A | Exact target model expressible with existing capabilities | Ready for a project translation. |
| B | Needs a reusable library graph, scheduler policy, sensor, component, monitor or task within existing semantics | Implement the smallest missing capability, then translate. |
| C | Needs new movement, fairness, temporal goals, value domains, symmetry machinery or other semantic/API support | Keep in a separate extension queue with an explicit acceptance criterion. |
| D | Model, algorithm or source version is unresolved | Resolve the question before calling the translation faithful. |

An executable restriction can be useful while a C/D paper waits, but label it as a restricted variant and identify the executions or configurations it excludes.

Prioritize exact-fit candidates with clear pseudocode and accessible full texts. Among them, prefer small finite configurations, reuse across several papers, a new task/model family, and independent examples or existing artifacts that can check the translation. Use rough effort labels: small (project only), medium (shared capability), large (semantic extension), unknown (audit pending). Calibrate effort after the first three new translations; do not attach calendar promises before that.

## Initial paper catalog

Sources were initially screened on 19 October 2026; dependencies were revised on 24 October against the implementation. P03's model/problem definitions, P07's model and P06's fault contract were rechecked in the linked manuscripts. This is a targeted refresh, not a new exhaustive literature search. Venue names refer to the conference edition or journal issue; proceedings may have appeared the following calendar year. P03 Algorithm 2, P04's extracted protocol and P07 Algorithm 1 at radius one have scoped, self-reviewed public implementations; the rest of each paper remains unaudited for translation. The two existing projects still need a claim-by-claim audit.

### Reference artifacts and first graph projects

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P01 | [Searching for an Eventually-Emerging Black Hole in Rings — SAND 2026](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2026.18) | Audit the existing `black-hole-search` experiments against the numbered algorithms. | Explicit versus implicit identification; whether/when emergence is required; synchronous variants versus the paper's asynchronous algorithms. Existing deviations are recorded in development.md. | Existing reference |
| P02 | [A Visibility vs. Memory Trade-off for Stand-Up Indulgent Gathering on Lines — SIROCCO 2025 program](https://www.torontomu.ca/sirocco-2025/accepted-papers/) | Audit the existing three-algorithm `standup-gathering` project. | Pin the exact manuscript, document direct `Graphs.Line` observations, crash timing, stable gathering and the known figure discrepancy. No padding obligation remains. | Existing reference |
| P03 | [Ring Exploration with Myopic Luminous Robots — Information and Computation, 2022](https://www.sciencedirect.com/science/article/abs/pii/S0890540121000171); [pinned v1](https://arxiv.org/abs/1805.03965v1) | [Algorithm 2 artifact](../projects/public/myopic-luminous-exploration/README.md): three FSYNC robots, designated starts, coverage and rule activity. | All 40 starts at N = 3–12 pass reduced/unreduced checks; generated Lean compiles. Hidden rule-activity instrumentation needs a general correspondence proof. Recurrence and other algorithms remain backlog. | Implemented partial artifact |
| P04 | [On the Synthesis of Mobile Robots Algorithms: the Case of Ring Gathering — SSS 2014](https://arxiv.org/abs/1407.0978v2) | [Three-robot FSYNC artifact](../projects/public/synthesized-ring-gathering/README.md): extracted protocol plus literal-final-paragraph probe. | The strategy-description variant passes 351 settings through N = 12. Literal tower guard retains a lasso at N = 4, positions [0,0,2]; source correspondence needs clarification. Synthesis and optimality are not implemented. | Implemented; source discrepancy recorded |
| P05 | [Crash-Tolerant Perpetual Exploration with Myopic Luminous Robots on Rings — OPODIS 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2024.12) | Start with the FSYNC case after P03; later add SSYNC cases. | Match the paper's crash budget, fault timing, visibility and colors; distinguish infinitely recurring visits from having visited all nodes once. | Early shared extension |
| P06 | [Stand-Up Indulgent Gathering on Rings — SIROCCO 2024](https://doi.org/10.1007/978-3-031-60603-8_7); [pinned v1](https://arxiv.org/abs/2402.14233v1) | Public pilot removed at the author’s request; superseded by a private project covering a wider setting. | No further public translation is queued. Private work is managed separately. | Retired from public collection |

### Asynchrony and dynamic rings

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P07 | [Gathering on Rings for Myopic Asynchronous Robots with Lights — OPODIS 2019 full version](https://arxiv.org/abs/1911.04757v1) | [Algorithm 1 artifact](../projects/public/myopic-async-gathering/README.md), phi = 1 only, with fair ASYNC events and fixed-node gathering. | Mirrored guards, towers and phase timing checked; small complete graphs pass and generated Lean compiles. Higher radii, wrapping and Algorithm 2 remain backlog. No unbounded proof. | Implemented partial artifact |
| P08 | [Gathering Asynchronous Oblivious Mobile Robots in a Ring — TCS, 2008, author copy](https://users.softlab.ntua.gr/~emarkou/_Media/gathering.pdf); [author publication list](https://www.labri.fr/perso/klasing/klasing.html) | Reference case for symmetry, admissible initial configurations and stale observations. | Use event-based ASYNC if its atomic graph moves match; audit full views, periodic starts, multiplicity and stable gathering. | Early ASYNC audit |
| P09 | [Gathering in Dynamic Rings — TCS, 2020](https://www.sciencedirect.com/science/article/am/pii/S030439751830639X); [author manuscript](https://arxiv.org/abs/1704.02427) | Separate experiments for the published chirality/cross-detection cases. | Port/buffer behavior, cross detection, marked homebases and terminal near gathering; `Graphs.Dynamic (Graphs.Cycle N) 1` supplies only the missing-edge budget. | Dynamic-ring audit |
| P10 | [Black Hole Search in Dynamic Rings: The Scattered Case — OPODIS 2023](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2023.33) | Scattered-start search with pebbles on a dynamic ring. | Audit communication, movement and safe-survivor identification. Compare the later manuscript titled [Black Hole Search by Scattered Agents in Dynamic Rings](https://arxiv.org/abs/2404.15132) before treating it as the same source version. | Dynamic-ring audit |
| P11 | [Gracefully Degrading Gathering in Dynamic Rings — SSS 2018 proceedings](https://link.springer.com/book/10.1007/978-3-030-03232-6?page=2); [author manuscript](https://arxiv.org/abs/1805.05137) | Compare the guarantees offered under different classes of dynamics. | Encode each temporal topology assumption and its corresponding weakened goal. Independent per-round missing-edge choices do not express every dynamics class. | Temporal-semantics audit |

### Other discrete spaces and stronger adversaries

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P12 | [Black Hole Search in Dynamic Tori — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.6) | Rooted and scattered variants, with the paper's failure and identification conditions. | A library torus graph, correct ports and per-ring dynamics; a global missing-edge budget is insufficient. Check scalar vertex encoding for Lean. | Library topology + dynamics audit |
| P13 | [Asynchronous Gathering in a Torus — OPODIS 2021](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2021.9) | Gathering from the paper's rigid initial configurations. | Library torus graph and symmetry/frame audit. ASYNC events and generic `localMultiplicity` already exist; validate exact movement and views. | Discrete topology pilot |
| P14 | [Space and Move-Optimal Arbitrary Pattern Formation on Infinite Rectangular Grid by Oblivious Robot Swarm — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.20) | Grid formation from asymmetric configurations. | Infinite graph syntax exists, but a 2D automorphism/canonicalization strategy and pattern equivalence remain. Four-port ASYNC needs a frame audit; record vertices currently block Lean export. A finite box needs a confinement argument. | Infinite-grid extension |
| P15 | [Randomized Byzantine Gathering in Rings — OPODIS 2022](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2022.13) | An explicitly probabilistic artifact for the paper's communication and adversary models. | Random choices with probability, adaptive Byzantine messages/state and optional tracking. Current adversarial movement is not arbitrary Byzantine behavior. | Probability + adversary extension |

### Continuous LCM robots

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P16 | [Gathering on a Circle with Limited Visibility by Anonymous Oblivious Robots — DISC 2020](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2020.12) | SSYNC circle gathering and examples of visibility obstructions. | Continuous angular positions, exact geometry, chirality, rigid movement and asymmetric initial configurations. A discrete ring is a different space. | Geometry reference |
| P17 | [Optimal Rendezvous L-Algorithms for Asynchronous Mobile Robots with External-Lights — OPODIS 2018](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2018.24) | Two-robot rendezvous with the specified external-light restrictions. | ASYNC plus geometry and movement assumptions; robots cannot read their own external lights. | Small geometry pilot |
| P18 | [Brief Announcement: Model Checking Rendezvous Algorithms for Robots with Lights in Euclidean Space — DISC 2019](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2019.41) | Reproduce a published finite abstraction as a comparison artifact. | Obtain the full study and establish exactly what the abstraction preserves; distinguish it from a direct geometric semantics. | Abstraction reference |
| P19 | [Brief Announcement: Optimal Uniform Circle Formation by Asynchronous Luminous Robots — DISC 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2024.46); [full manuscript](https://arxiv.org/abs/2405.06617) | Formation with lights and opaque visibility. | ASYNC geometry, occlusion, collision constraints and exact construction predicates. Pin the full algorithm version. | Later geometry |
| P20 | [Forming Large Patterns with Local Robots in the OBLOT Model — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.14) | Limited-view pattern formation under the paper's initial conditions. | Continuous geometry, local frames, visibility, symmetry, connectivity and the paper's scheduler. | Later geometry |

### Mobile agents on trees and general graphs

| ID | Paper and pinned source | Artifact scope | Remaining claims | Status |
| --- | --- | --- | --- | --- |
| P21 | [Time and space optimality of rotor-router graph exploration — IPL 2017](https://doi.org/10.1016/j.ipl.2017.06.010); [v3](https://arxiv.org/abs/1502.05545v3) | [Rotor-router artifact](../projects/public/rotor-router-exploration/README.md): one memoryless agent, local writable node pointers, arbitrary finite connected port graphs. | General coverage/equivariance and the paper's time/space lower bounds remain unproved. Node storage stays project-local. | Implemented partial artifact |
| P22 | [Searching for a Black Hole in Synchronous Tree Networks — CPC 2007](https://doi.org/10.1017/S0963548306008133); [author manuscript](https://www.researchgate.net/publication/220357976_Searching_for_a_Black_Hole_in_Synchronous_Tree_Networks) | [Algorithm Tree artifact](../projects/public/tree-black-hole-search/README.md): arbitrary rooted trees, labelled agents, known map, split/probe deadlines, optional static hole and actual return home. | General correctness, source-scheme correspondence and the 5/3 bound remain unproved. Final report uses an additional activation. Optimized Line/Bushy-Tree are separate targets. | Implemented partial artifact |
| P23 | [Stand Up Indulgent Gathering — TCS 2023](https://doi.org/10.1016/j.tcs.2022.10.015); [v1](https://arxiv.org/abs/2302.03466v1) | [Numerical companion](../projects/public/standup-plane-gathering/README.md) for planar Algorithm 3: private frames, circle/extremity targets, non-rigid sample movements and crashes. | Exact planar observations, destinations, arithmetic, movement and Lean semantics remain unimplemented. See the [planar plan](planar-robots.md). | Visualization only; not a formal translation |

The catalog contains 23 distinct published paper families: two original public artifacts, five newly implemented partial formal artifacts, one numerical visualization companion, 14 prospective ones and one retired public target. Exact versions for the remaining targets still need full-text audits. Tree and general-graph agent exploration now has a first executable artifact; dispersion, self-stabilization, further search protocols and geometric faults remain discovery targets.

## From a paper to a public artifact

### 1. Write the model contract

Before translating pseudocode, make an assumption table with a paper locator, its `.sim` representation and any mismatch for every row:

| Area | Questions to settle |
| --- | --- |
| Space and movement | Nodes or points? Static or changing topology? Edge crossing, transit visibility, blocked moves, collisions, rigidity and non-rigid progress? |
| Scheduler | Which phases are atomic? Can a robot act on an old snapshot? Which activations and movement completions are fair? Are there bounded gaps or round-robin constraints? |
| Observation | Full or bounded visibility? Occlusion? Occupancy, local/global weak or strong multiplicity? Are edge states and co-located messages visible? |
| Identity and frames | Anonymous robots or IDs? Chirality? Stable versus changing local frames? Shared coordinates or unit distance? |
| State and knowledge | Private memory, public state, own/other light visibility, initial colors, pebbles, whiteboards, knowledge of population or space size? |
| Faults and dynamics | Crash location, budget, timing and visible effects? Byzantine powers? Is a hazard guaranteed to appear? Must an edge recur? |
| Initial configurations | Population bounds, symmetry exclusions, distinct positions, connected views, colors, safe starting nodes and parameter predicates? |
| Specification | Reach a configuration, stay there forever, terminate explicitly, identify correctly, visit once or visit infinitely often? Must correct robots meet at a fault location? |
| Complexity | Which events count as moves, rounds or asynchronous rounds? When does the time measurement start? |

Give the target an explicit fit category and record unresolved questions. A bounded checker may use the full global state to evaluate a task, but the algorithm may read only the paper's permitted sensors. Renderer labels and internal agent indices must never become accidental robot knowledge.

### 2. Translate one claim at a time

Choose one numbered algorithm and one theorem/model case. Write the model, algorithm, task, goal and experiment in `.sim`; preserve paper rule names and branch priorities. Use a source map from paper rules to declarations. Explain intentional reformulations, especially implicit control state introduced by structured algorithms: an oblivious robot must not acquire memory through a program counter or a local value retained across activations.

General theorem assumptions belong in parameter predicates. Simulator defaults and finite `checkSettings` belong in the project registry. A small sample domain must not silently replace the paper's unbounded assumptions. Keep theorem variants and exploratory variants separately named.

### 3. Establish evidence

Reproduce paper examples and check critical local transitions, tie breaking, symmetric views, fault timing and terminal behavior. Explore small complete domains when feasible; include boundary populations, multiplicities and symmetry exclusions. Save replayable witnesses for any discrepancy. Compare reduced and unreduced exploration on representative small cases before relying on a new equivariance claim.

For every check, record the source revision, package versions, complete settings or enumeration rule, limits, symmetry options, counts and outcome. Preserve `incomplete` when a resource limit is reached. For liveness under activation fairness (including SSYNC, sequential and ASYNC), use the exhaustive checker rather than the first-branch smoke check, whose fairness issue is already documented.

Where Lean translation is supported, generate and compile the model, then pursue non-vacuity, useful invariants and selected correctness theorems separately. Compilation alone does not prove correspondence with the paper or prove its result. Unsupported translation features remain visible in the evidence record.

### 4. Review and prepare the public project

Review the model contract and source mapping against the full paper. A second human reader is desirable for subtle semantics; when unavailable, record the review as a self-review. Resolve discrepancies explicitly: specification difference, translation bug, ambiguous source, possible paper error or incomplete check. A counterexample refutes the modeled claim under its assumptions; it is not automatically a counterexample to the published theorem.

Prepare the README, citations, examples, source, checks, results and limitations. New paper projects use `projects/public/<slug>/` and the shared viewer; the original public projects retain their paths. Reusable definitions belong in `packages/stdlib/sim/`; engine semantics belong in `packages/engine/`, with coordinated Lean/IR/conformance work as required by the architecture. An independent repository may instead use the published initializer and pinned dependencies.

Add a ready project's metadata to the explicit [public-project list](../apps/public-site/src/public-projects.mjs) and verify its page build. Record the source revision used for a release and retain dependency lockfiles. Public hosting follows the repository's existing build/deployment workflow; inclusion in this plan is not publication. Keep all private research sources and fixtures in their separate repository.

## Completion and evidence labels

Track project maturity independently from claim evidence:

| Project status | Exit requirement |
| --- | --- |
| Discovered | Deduplicated bibliographic record with a source link. |
| Audited | Full-text model contract, precise algorithm/theorem scope and fit decision. |
| Implemented | `.sim` translation runs and paper-rule mapping exists. |
| Reviewed | Semantic review and independent example/transition checks recorded; remaining differences disclosed. |
| Public | Reproducible source and page available with citations, evidence and limitations. |
| Deferred | Named missing capability or unresolved question, with a concrete condition for resuming. |

Each claim additionally records any of: **examples reproduced**, **bounded exhaustive checks passed**, **counterexample found**, **exploration incomplete**, **Lean model compiled**, **non-vacuity proved**, **invariant proved**, **correctness theorem proved**. These labels can coexist and should name their scope. An unbounded correctness label requires the actual theorem and checked proof assumptions. A public artifact may be valuable with bounded evidence, provided that is what it claims.

Minimum public-project checklist:

- [ ] Exact citation and source version; paper family deduplicated.
- [ ] Included algorithms/theorems and omitted results listed.
- [ ] Assumption contract, paper-to-source mapping and semantic differences documented.
- [ ] Executable `.sim` sources, registry, presets and readable configuration drawing.
- [ ] Paper examples and meaningful semantic checks with reproducible commands.
- [ ] Check bounds, incomplete runs, counterexamples and Lean status disclosed.
- [ ] README and page explain what the reader can reproduce.
- [ ] Pinned release revision/dependencies and public build verified.

## Shared capabilities to develop deliberately

The [standard-library additions proposal](stdlib-additions-proposal.md) now separates implemented definitions, remaining library proposals and semantic extensions. Keep generic sensors and position-based components independent of topology; keep ordered cycle/line adapters and paper-specific rules explicit.

| Work item | Papers it could unlock | Acceptance criterion |
| --- | --- | --- |
| Core + std observation foundation — complete | P01/P02 and the whole graph catalog | Reuse the migrated projects and star witnesses. Do not schedule another core rewrite or padding migration. |
| Stable task variants | P02, P04, P07, P08 | Add stable present/correct/SUIG contracts as appropriate. `Gathering` is only eventual co-location, and under ASYNC pending moves may break it. Permanent co-location still needs a stationarity condition or closure proof when the paper requires staying at a fixed node. |
| Exploration specifications | P03, P05 and later exploration papers | Distinguish coverage, recurrence, per-agent visits and paper-rule disabledness. Coverage plus a `done` output is only faithful when its relation to actual termination is established. Add recurrence/goal composition to the core only with explorer and Lean agreement. |
| Fault/task variants | P05 | Tests match the admitted paper's fault budget, phase timing, correct-agent quantification and required gathering location. |
| Dynamic-ring observations | P09, P10 | Model blocked moves, ports/communication and cross detection where needed; validate the exact per-round topology constraints. |
| Temporal environment assumptions | P11 and hazard variants of P01 | Specify recurrence/eventuality assumptions separately from activation fairness and test executions excluded by each assumption. |
| ASYNC paper matching — core available | P07, P08, P13; scheduler part of P17/P19 | Existing events, pending targets, Compute hooks and activation fairness cover atomic graph cycles. Audit each paper's simultaneous-event convention and moving visibility. Continuous/non-rigid transit remains separate. |
| Additional discrete topologies | P12–P14 | Define finite tori/grids as library spaces and reuse sensors. Verify ports, automorphisms and small degenerate dimensions. Infinite 2D symmetries and unsupported Lean vertex/frame forms are separate dependencies. |
| Storage and observation policies | P03, P05, P09, P10, future agent papers | Initial light colors, external colors or color counts, finite carried stock and anonymous marks; promote only contracts with demonstrated reuse or clear primitive value. |
| Proof infrastructure | All proof-track artifacts | Record generation/build/non-vacuity/proofs separately. Prioritize the export or equivariance gap encountered by an admitted pilot; do not make every currently unsupported Lean construct a global implementation gate. |
| Geometry / verified abstractions | P16–P20 | Choose an exact geometric domain or justify a finite abstraction for a stated property. Document precision, movement and boundary assumptions; numerical animation alone is insufficient. |
| Probability and Byzantine state | P15 | Separate probabilities from adversarial nondeterminism and represent the paper's actual adversary powers. Do not infer almost-sure or high-probability correctness from ordinary nondeterministic checking. |

Promote shared code when its contract is understood and tests demonstrate reuse. Do not design every extension before the first projects: use concrete paper audits to decide the next capability.

## Delivery sequence

These are proposed milestones, not fixed deadlines. The foundation is available; begin paper audits and translations now. Keep one active translation and, when needed, one shared-capability item. Start with P07's audit because its published atomic-move model matches the new scheduling design closely; select another audited exact-fit paper if that audit exposes a mismatch.

| Milestone | Work | Completion measure |
| --- | --- | --- |
| F0: graph foundation — complete | Phase 0 graph core, ported consumers and library schedulers, including event-based ASYNC. | Retain the existing baseline/conformance records. Euclidean execution and future fairness kinds are later scope, not unfinished graph migration. |
| M0: reference audits | Pin P01/P02 source versions and claim/evidence records; record simulator-ordering and Lean qualifications. | Two reference cards distinguish preserved behavior from paper correctness. Do not change known algorithm deviations merely to make an audit pass. |
| M1: first new ASYNC artifact | Audit P07's first algorithm, then translate its exact initial class using existing events, sensors and lights plus its fixed-node gathering specification. | One new family passes the public checklist; stale-snapshot, Compute/light, pending-move and gathering-closure cases checked. Any view mismatch is resolved or explicitly defers the exact claim. |
| M2: repeat and specify exploration | Audit P04 and P03 Algorithm 2. Add only shared task/storage/observation contracts that the audits require. | Three new families in total, or named blockers and replacement exact-fit papers. P03 coverage may be public as partial evidence; terminating/perpetual claims wait for their specifications. |
| M3: broaden the inventory | Follow references and subsequent work; screen at least 50 distinct published paper families in total. | Model/task/venue/year coverage report, deduplicated records, and a ranked next ten. This is an inventory target, not a claim that 50 fit today. |
| M4: expand the collection | Translate the next admitted graph/ring cases; choose a shared extension supported by multiple completed audits. | Ten new public paper families in total, with model and evidence coverage reported separately. |
| M5: expand expressive scope | Select a finite-torus pilot (P13), a dynamic-policy pilot (P09/P10/P12), and a small geometry/abstraction pilot (P17/P18). Sequence by audited dependencies. | Each enabled model has semantic/conformance validation and a reviewed artifact. Separate library graph work from new movement, fairness, probability or geometry semantics. |

After every three completed translations, review effort, semantic blockers and component reuse. Reorder the queue to increase coverage. Maintain a small proof track for selected representative claims while the main artifact collection grows; proving every paper's full theorem is a separate, much larger objective.

Track: distinct published paper families discovered/audited/public; algorithms and claims covered; exact versus restricted models; model families enabled; bounded checks and unbounded proofs; incomplete checks and unresolved discrepancies. Record counts by topology, scheduler, observation, memory/light model, task and fault model so that many similar ring examples do not conceal missing areas.

## Reusable project card

Create one card per paper family in the project's README or a dedicated planning record. A paper with several algorithms repeats the claim/evidence rows for each target.

```text
ID / slug:
Title, authors, venue, year, DOI:
Open source link and exact version:
Related conference/journal versions and corrections:
Owner / reviewer / last reviewed:
Status / fit / estimated effort:

Target algorithm(s), theorem(s), sections and pages:
Included results / excluded results:
Topology / movement / scheduler events / fairness:
Sensors / frames / memory / lights / initial knowledge:
Faults / dynamics / initial configurations:
Task, temporal goal and complexity measure:
Assumption-to-.sim mapping:
Known differences / open questions:
Shared dependencies / condition for resuming if deferred:

Source-to-rule mapping and implementation paths:
Paper examples and transition checks:
Finite settings / enumeration / limits / reductions:
Commands / source revision / versions / results:
Counterexamples / replayable witnesses / incomplete runs:
Reference ordering / reduction assumptions:
Lean generation / build / unsupported constructs / non-vacuity / invariant / theorem status:
Review findings:
Public source / simulator / artifact release:
Next concrete action:
```

## Immediate next actions

1. Pin P01/P02 versions and complete their reference cards using current sources and known-issue records. Their migration is complete; the remaining work is scientific traceability.
2. Extend the implemented P07 radius-one artifact with the asynchronous figure, then audit higher-radius views and guards before translating them. Keep Algorithm 2 separately scoped.
3. Review the project-local initial lights, color-count sensor and specification monitors for promotion only when their reusable contracts and consumers are established. The stdlib remains unchanged in this increment.
4. Prove the P03 FSYNC rule-activity instrumentation correspondence, then audit the other algorithms. Treat recurrence as a separate core item shared with P05.
5. Audit P04/P08, compare P10's versions and expand the bibliography toward 50 published families. Keep private compatibility checks and fixtures in their own repository.

## Review and validation of this revision

On 24 October the plan was checked against the graph/view runtime, scheduler IR/runtime, `.sim` library and scheduler/event/space tests, plus the maintained language, architecture and limitation documents. A focused baseline passed 66 tests covering conformance, graph observations/symmetries, ASYNC event cuts, library schedulers, shared robot components, the starter, black-hole Algorithm 1 and stand-up gathering. Snapshot type generation and strict TypeScript checking also passed. The library proposal's 19 executable snippets were combined in temporary compilation probes: seven experiments compiled without diagnostics and produced initial successors on cycles, a star and the proposed torus. These are syntax/composition/runtime smoke checks, not full validation of the proposed contracts. This revision changes planning documents only; it does not add a project, implement the proposed library entries or prove a paper theorem. Lean, browser acceptance and the full historical baseline comparison were not rerun for this documentation update.

Project implementation uses the checks maintained in [development.md](development.md), including strict typechecking and the relevant project, conformance, page and Lean checks when applicable.

## First implementation increment · 24 October

Branch `feat/public-literature-projects` starts P07 and P03 under `projects/public/`; their READMEs pin source versions and scope. Both are runnable pages and CLI registries. Shared candidates remain project-local while their contracts and proof obligations are assessed; the stdlib and semantic core are unchanged.

Next implementation work: reproduce P07's asynchronous figure and audit higher radii, establish the P03 instrumentation correspondence, then select the next audited paper. The broader bibliography, the audits of P01/P02/P08, and the remaining P04 claims remain open. Earlier milestone rows describe the program, not a claim that these complete paper formalizations are finished.

P06 previously had a two-robot FSYNC pilot. On 25 October it was removed from the public collection at the author's request, because a private project covering a wider setting supersedes it. Its bibliography entry is retained as retired; it is not an active translation or audit target. New projects are committed individually on this branch after their checks.

P04 now has a fourth partial artifact: the extracted FSYNC protocol, with all non-periodic rotation-normalized triples checked through N = 12, and a separately named literal-source experiment retaining the disoriented-tower counterexample. The source issue is recorded in development.md; game synthesis, optimality and general correspondence remain open.


P21 broadens the implementation to local mobile agents on trees and general graphs. Its
rotor-router model admits arbitrary finite connected ordered adjacency lists and arbitrary
valid pointer vectors. All 340 registered starts/pointers on five example graphs pass;
reduced and unreduced results agree, and the generated Lean model compiles. Theorem proofs
and asymptotic lower bounds remain separate work.

P22 adds the general tree black-hole procedure, with a static known input map and local
face-to-face observations. All 153 increasing parent encodings through six vertices pass
for every non-root hole placement (719 cases) and no hole (153 cases), with independent
unreduced checks. Both generated models compile in Lean. The completion task includes
survival, correct answers and actual return home. Further graph search papers should
retain their own timing, initial knowledge, communication and connectivity assumptions;
the current timed procedure is not an asynchronous black-hole-search formalization.


P23 starts the planar track with a numerical companion in the existing viewer. It does not
count as an additional formal translation or a proved claim. The current scope includes
all Algorithm 3 branches and six example scenarios; geometry and movement predicates are
approximate. The exact `.sim` core work is scoped in [planar-robots.md](planar-robots.md).
