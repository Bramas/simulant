# Public projects: formalizing the mobile-robot literature

Planning draft · 19 October 2026

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
| Space | `Ring`, `DynamicRing k`; a project-specific padded-ring encoding of finite line configurations | Start with rings. Audit the padding and confinement argument for each line encoding. Grids, tori and continuous space require additional support. |
| Scheduling | FSYNC, fair SSYNC and fair sequential singleton activation | FSYNC and SSYNC are initial targets. Sequential activation does not implement general ASYNC LCM. Round-robin restrictions also require a separate audit. |
| Observations and state | Sensors, frames, limited visibility, oblivious models, private memory, fixed finite light palettes, pebbles and fault components | Compose existing capabilities only when their visibility, initialization and update timing match the paper. |
| Exploration | Reachable state graphs, safety failures, liveness checks and replayable counterexamples | State the tested settings, reductions and resource limits. Unbounded memory can prevent finite exploration even on a small ring. |
| Lean | Generated models and statements, with hand-written proofs supported for a translated subset | Generation, compilation, non-vacuity and correctness proofs are separate achievements. |

There are already two explicitly listed public paper projects: [black-hole search](../projects/black-hole-search/) and [stand-up gathering on lines](../projects/standup-gathering/README.md). Audit and document them as the first reference artifacts rather than counting them as new translations. The [starter](../projects/starter/README.md) is a development example, not an additional paper.

The agreed first implementation phase is the [core and standard-library redesign](core-redesign.md): graph and Euclidean core spaces, observations through opaque locations, sensors queried by location, declared frames, and library spaces such as cycles and lines. It keeps no legacy definitions; it rewrites the packages one by one and ports both existing public projects and the starter, while the private projects are ported in their own repository, before the collection is extended. Literature discovery and paper audits can continue during that phase.

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
| B | Needs a reusable sensor, component, monitor or task within existing semantics | Implement the smallest missing capability, then translate. |
| C | Needs a topology, scheduler, value domain or other semantic extension | Keep in a separate extension queue with an explicit acceptance criterion. |
| D | Model, algorithm or source version is unresolved | Resolve the question before calling the translation faithful. |

An executable restriction can be useful while a C/D paper waits, but label it as a restricted variant and identify the executions or configurations it excludes.

Prioritize exact-fit candidates with clear pseudocode and accessible full texts. Among them, prefer small finite configurations, reuse across several papers, a new task/model family, and independent examples or existing artifacts that can check the translation. Use rough effort labels: small (project only), medium (shared capability), large (semantic extension), unknown (audit pending). Calibrate effort after the first three new translations; do not attach calendar promises before that.

## Initial paper catalog

Sources were screened on 19 October 2026. Links point to primary publication records or author manuscripts. Venue names refer to the conference edition or journal issue; proceedings may have appeared the following calendar year. These are preliminary dependency assessments inferred from the sources and the current implementation, not completed model audits. No new entry below has passed the fit gate. The two existing projects still need a claim-by-claim audit.

### Reference artifacts and first graph projects

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P01 | [Searching for an Eventually-Emerging Black Hole in Rings — SAND 2026](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2026.18) | Audit the existing `black-hole-search` experiments against the numbered algorithms. | Explicit versus implicit identification; whether/when emergence is required; synchronous variants versus the paper's asynchronous algorithms. Existing deviations are recorded in development.md. | Existing reference |
| P02 | [A Visibility vs. Memory Trade-off for Stand-Up Indulgent Gathering on Lines — SIROCCO 2025 program](https://www.torontomu.ca/sirocco-2025/accepted-papers/) | Audit the existing three-algorithm `standup-gathering` project. | Pin the exact manuscript used, distinguish it from the conference version, document the line encoding, crash timing, stable gathering and known figure discrepancy. | Existing reference |
| P03 | [Ring Exploration with Myopic Luminous Robots — Information and Computation, 2022](https://www.sciencedirect.com/science/article/abs/pii/S0890540121000171); [author manuscript](https://arxiv.org/abs/1805.03965) | Begin with a terminating FSYNC algorithm; add the other published scheduler/task cases separately. | Radius-one color observations, initial colors and configurations, termination predicate; perpetual exploration needs an appropriate recurrence monitor. | First new translation |
| P04 | [On the Synthesis of Mobile Robots Algorithms: the Case of Ring Gathering — SSS 2014](https://arxiv.org/abs/1407.0978) | Translate the published three-robot gathering algorithm and reproduce small-ring examples. | Audit the game's scheduler and observation model; reproduce the excluded ring-size cases and the actual stabilization requirement. Algorithm synthesis itself is a separate research task. | Early candidate |
| P05 | [Crash-Tolerant Perpetual Exploration with Myopic Luminous Robots on Rings — OPODIS 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2024.12) | Start with the FSYNC case after P03; later add SSYNC cases. | Match the paper's crash budget, fault timing, visibility and colors; distinguish infinitely recurring visits from having visited all nodes once. | Early shared extension |
| P06 | [Stand-Up Indulgent Gathering on Rings — SIROCCO 2024](https://doi.org/10.1007/978-3-031-60603-8_7); [author manuscript](https://arxiv.org/abs/2402.14233) | A separate ring-gathering artifact reusing audited fault/vision capabilities. | Verify the scheduler, lack of multiplicity detection, single crash location and task requiring gathering at crashed robots. Do not assume P02's task is interchangeable. | Early candidate |

### Asynchrony and dynamic rings

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P07 | [Gathering on Rings for Myopic Asynchronous Robots with Lights — OPODIS 2019 full version](https://arxiv.org/abs/1911.04757) | Translate its light-based algorithms, preserving the initial parity and visibility conditions. | Full ASYNC LCM with delayed observations and independent robot phases; exact light visibility and update timing. A synchronous restriction must be labeled. | ASYNC reference |
| P08 | [Gathering Asynchronous Oblivious Mobile Robots in a Ring — TCS, 2008, author copy](https://users.softlab.ntua.gr/~emarkou/_Media/gathering.pdf); [author publication list](https://www.labri.fr/perso/klasing/klasing.html) | Reference case for symmetry, admissible initial configurations and stale observations. | ASYNC semantics; periodic configurations and multiplicity assumptions. | ASYNC reference |
| P09 | [Gathering in Dynamic Rings — TCS, 2020](https://www.sciencedirect.com/science/article/am/pii/S030439751830639X); [author manuscript](https://arxiv.org/abs/1704.02427) | Separate experiments for the published chirality/cross-detection cases. | Port/buffer behavior, cross detection, marked homebases and terminal gathering on one node or two adjacent nodes; `DynamicRing 1` alone is insufficient. | Dynamic-ring audit |
| P10 | [Black Hole Search in Dynamic Rings: The Scattered Case — OPODIS 2023](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2023.33) | Scattered-start search with pebbles on a dynamic ring. | Audit communication, movement and safe-survivor identification. Compare the later manuscript titled [Black Hole Search by Scattered Agents in Dynamic Rings](https://arxiv.org/abs/2404.15132) before treating it as the same source version. | Dynamic-ring audit |
| P11 | [Gracefully Degrading Gathering in Dynamic Rings — SSS 2018 proceedings](https://link.springer.com/book/10.1007/978-3-030-03232-6?page=2); [author manuscript](https://arxiv.org/abs/1805.05137) | Compare the guarantees offered under different classes of dynamics. | Encode each temporal topology assumption and its corresponding weakened goal. Independent per-round missing-edge choices do not express every dynamics class. | Temporal-semantics audit |

### Other discrete spaces and stronger adversaries

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P12 | [Black Hole Search in Dynamic Tori — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.6) | Rooted and scattered variants, with the paper's failure and identification conditions. | Torus topology and its per-ring dynamics; observations and ports. A ring encoding does not supply these semantics. | Topology extension |
| P13 | [Asynchronous Gathering in a Torus — OPODIS 2021](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2021.9) | Gathering from the paper's rigid initial configurations. | Torus, ASYNC, local weak multiplicity detection and symmetry assumptions. | Topology + ASYNC |
| P14 | [Space and Move-Optimal Arbitrary Pattern Formation on Infinite Rectangular Grid by Oblivious Robot Swarm — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.20) | Grid formation from asymmetric configurations. | Infinite-grid representation, four movement directions, ASYNC and target-pattern equivalence. Finite boxes need a confinement argument. | Grid extension |
| P15 | [Randomized Byzantine Gathering in Rings — OPODIS 2022](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2022.13) | An explicitly probabilistic artifact for the paper's communication and adversary models. | Random choices with probability, adaptive Byzantine messages/state and optional tracking. Current adversarial movement is not arbitrary Byzantine behavior. | Probability + adversary extension |

### Continuous LCM robots

| ID | Paper / source | Proposed artifact | First audit or dependency | Queue |
| --- | --- | --- | --- | --- |
| P16 | [Gathering on a Circle with Limited Visibility by Anonymous Oblivious Robots — DISC 2020](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2020.12) | SSYNC circle gathering and examples of visibility obstructions. | Continuous angular positions, exact geometry, chirality, rigid movement and asymmetric initial configurations. A discrete ring is a different space. | Geometry reference |
| P17 | [Optimal Rendezvous L-Algorithms for Asynchronous Mobile Robots with External-Lights — OPODIS 2018](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.OPODIS.2018.24) | Two-robot rendezvous with the specified external-light restrictions. | ASYNC plus geometry and movement assumptions; robots cannot read their own external lights. | Small geometry pilot |
| P18 | [Brief Announcement: Model Checking Rendezvous Algorithms for Robots with Lights in Euclidean Space — DISC 2019](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2019.41) | Reproduce a published finite abstraction as a comparison artifact. | Obtain the full study and establish exactly what the abstraction preserves; distinguish it from a direct geometric semantics. | Abstraction reference |
| P19 | [Brief Announcement: Optimal Uniform Circle Formation by Asynchronous Luminous Robots — DISC 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2024.46); [full manuscript](https://arxiv.org/abs/2405.06617) | Formation with lights and opaque visibility. | ASYNC geometry, occlusion, collision constraints and exact construction predicates. Pin the full algorithm version. | Later geometry |
| P20 | [Forming Large Patterns with Local Robots in the OBLOT Model — SAND 2024](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.SAND.2024.14) | Limited-view pattern formation under the paper's initial conditions. | Continuous geometry, local frames, visibility, symmetry, connectivity and the paper's scheduler. | Later geometry |

The seed list contains 20 distinct published paper families: two existing public artifacts and 18 prospective ones. Exact implementation versions still need to be pinned during full-text audits. It does not yet cover the full literature on dispersion, self-stabilization, trees, general graphs, opaque robots, movement errors or fault-tolerant geometric gathering. These are explicit discovery targets for the next bibliography pass.

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

For every check, record the source revision, package versions, complete settings or enumeration rule, limits, symmetry options, counts and outcome. Preserve `incomplete` when a resource limit is reached. For SSYNC/sequential liveness, use the exhaustive checker rather than the first-branch smoke check, whose fairness issue is already documented.

Where Lean translation is supported, generate and compile the model, then pursue non-vacuity, useful invariants and selected correctness theorems separately. Compilation alone does not prove correspondence with the paper or prove its result. Unsupported translation features remain visible in the evidence record.

### 4. Review and prepare the public project

Review the model contract and source mapping against the full paper. A second human reader is desirable for subtle semantics; when unavailable, record the review as a self-review. Resolve discrepancies explicitly: specification difference, translation bug, ambiguous source, possible paper error or incomplete check. A counterexample refutes the modeled claim under its assumptions; it is not automatically a counterexample to the published theorem.

Prepare the README, citations, examples, source, checks, results and limitations. In this repository, use a project under `projects/<slug>/` and the shared viewer. Reusable definitions belong in `packages/stdlib/sim/`; engine semantics belong in `packages/engine/`, with coordinated Lean/IR/conformance work as required by the architecture. An independent repository may instead use the published initializer and pinned dependencies.

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

The [standard-library additions proposal](stdlib-additions-proposal.md) gives categorized contracts and proposed `.sim` definitions for the reusable capabilities, distinguishing current-language definitions from future semantic interfaces.

| Work item | Papers it could unlock | Acceptance criterion |
| --- | --- | --- |
| Core + std observation foundation | P01/P02 migration and shared capabilities across the catalog | One generic occupancy/multiplicity definition on cycles and a branching graph; explicit observation structure and derived admissible frames; both public projects retain their behavior; private compatibility has a separate recorded outcome. |
| Exploration specifications | P03, P05 and later exploration papers | Distinguish collective coverage, per-robot coverage, termination and recurrence. A cumulative visited-set alone cannot detect infinite recurrence. Validate on a cycle that stops revisiting one node. |
| Fault/task variants | P05, P06 | Tests match the admitted paper's fault budget, phase timing, correct-agent quantification and required gathering location. |
| Dynamic-ring observations | P09, P10 | Model blocked moves, ports/communication and cross detection where needed; validate the exact per-round topology constraints. |
| Temporal environment assumptions | P11 and hazard variants of P01 | Specify recurrence/eventuality assumptions separately from activation fairness and test executions excluded by each assumption. |
| ASYNC LCM | P07, P08, P13, P17, P19 | Represent independent phases, stored observations/destinations, delayed compute/move and the paper's transit behavior; validate overlapping cycles and admissible fairness. Extend the interpreter, Lean semantics, conformance fixtures and docs together. |
| Additional discrete topologies | P12–P14 | Explicit adjacency, movement, frames, observations and symmetry actions for grids/tori; validate movement and equivariance. Infinite spaces need an appropriate semantics and proof strategy. |
| Geometry / verified abstractions | P16–P20 | Choose an exact geometric domain or justify a finite abstraction for a stated property. Document precision, movement and boundary assumptions; numerical animation alone is insufficient. |
| Probability and Byzantine state | P15 | Separate probabilities from adversarial nondeterminism and represent the paper's actual adversary powers. Do not infer almost-sure or high-probability correctness from ordinary nondeterministic checking. |

Promote shared code when its contract is understood and tests demonstrate reuse. Do not design every extension before the first projects: use concrete paper audits to decide the next capability.

## Delivery sequence

These are proposed milestones, not fixed deadlines. Complete the foundation migration before expanding the implementation collection; bibliography and model audits may proceed independently. Afterwards, keep one active paper translation and, when it unblocks several admitted papers, one shared-capability item in progress.

| Milestone | Work | Completion measure |
| --- | --- | --- |
| F0: core and std foundation | Execute [Phase 0](core-redesign.md): core spaces, observations, sensors, movement, library spaces, model families, and the ported projects. | Both public projects and the starter run on the new base and match their recorded baselines; a star witness shares their generic sensors; core/IR/Lean/consumer checks agree; private compatibility is recorded separately. |
| M0: establish the process | Audit P01/P02, complete the project-card template and start the deduplicated bibliography. | Two reference artifacts have explicit claim/evidence records; each seed entry has a bibliographic status and next action. |
| M1: first new project | Fully audit P03, translate one terminating FSYNC case and prepare its public artifact. | One new paper project passes the public checklist; actual effort and missing capabilities recorded. |
| M2: repeat across nearby models | Audit P04 and P06; take the first exact-fit case, then the other. Investigate P05's recurrence specification. | Three new paper families in total have reviewed, reproducible artifacts, or a documented blocker and a replacement exact-fit paper. |
| M3: broaden the inventory | Follow references and subsequent work; screen at least 50 distinct published paper families in total. | Model/task/venue/year coverage report, deduplicated records, and a ranked next ten. This is an inventory target, not a claim that 50 fit today. |
| M4: expand the collection | Translate the next admitted graph/ring cases; choose a shared extension supported by multiple completed audits. | Ten new public paper families in total, with model and evidence coverage reported separately. |
| M5: expand expressive scope | Select an ASYNC pilot (P07/P08), a topology pilot (P12/P14), and a small geometry/abstraction pilot (P17/P18). Sequence them according to audit results and capacity. | Each enabled model has semantic/conformance validation and at least one reviewed artifact; unsupported pilots remain explicitly deferred. |

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
Topology / movement / scheduler / fairness:
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
Lean generation / build / non-vacuity / invariant / theorem status:
Review findings:
Public source / simulator / artifact release:
Next concrete action:
```

## Immediate next actions

1. Complete step 0 of [Phase 0](core-redesign.md#9-steps): record current baselines, write the target `.sim` sources for the stdlib and the public projects, and settle the open questions. Keep private inventory and fixtures in their own repository.
2. Pin the exact public paper/manuscript versions behind P01 and P02 and complete their cards using the existing known-issue records; preserve their current semantics during migration.
3. Read P03's full algorithm and model sections, select one terminating FSYNC case and prepare its assumption table for implementation after the foundation gate.
4. Audit P04/P06, compare P10's conference and later manuscript versions, and expand the deduplicated bibliography toward 50 published families while the core work proceeds.

Project implementation uses the checks maintained in [development.md](development.md), including strict typechecking and the relevant project, conformance, page and Lean checks when applicable.
