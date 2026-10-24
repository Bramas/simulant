# Standard-library additions for the literature program

Design proposal · revised 24 October 2026 · documentation only

This is the reusable-capability backlog for the [public-paper program](public-projects-roadmap.md). P01–P20 refer to that catalog. Admit an addition when two audited papers need the same contract, or when it is a small, broadly useful primitive. Potential reuse below is a design judgment until those audits are complete.

The graph [core redesign](core-redesign.md) and [scheduler DSL](scheduler-design.md) are implemented. This revision replaces the obsolete ring-core prototypes. It proposes no second foundation rewrite and keeps no legacy API aliases. The standard library is unchanged by this document.

Blocks tagged `sim` use the current language; they are proposed definitions, not installed exports. Blocks tagged `sim-design` need a semantic/API decision or implementation before they are executable. Proposed snippets share `import "std/models.sim"`; a later snippet may depend on an earlier one. Compilation checks and their limits are recorded at the end.

## 0. Implemented foundation and closed proposals

| Area / earlier IDs | Existing definitions | Planning consequence |
| --- | --- | --- |
| Graphs and observations | `Graphs.Cycle`, `Graphs.Line`, `Graphs.Star`; `Observe.full` / `Observe.radius` | Ring/line encodings no longer belong in multiplicity or color sensors. Lines need no padding. Euclidean execution is still absent. |
| Frames and symmetry | `Frames.isomorphisms`, `Frames.identity`, `Frames.portPermutations` | Admissible view morphisms determine information and symmetry. Do not add ring reflection components; word reversal remains a value operation. |
| S1, S2/S3 base | `occupied`, `count`, `localMultiplicity`, `ownLight` | Own light and local weak multiplicity are done. A capped-count convenience sensor remains optional. |
| S4 base | `colors`, `Storage.Lights k` | Color sets include self and erase equal-color multiplicity. They are not count vectors or external-only colors. |
| S6 | `edgeTo` | Incident-edge sensing is done. It reports whether any parallel edge remains, not a particular port edge or crossing. |
| C/F base | `Storage.Pebbles`, `Faults.CrashStop f`, `Faults.CrashAt`, `Hazards.BlackHole policy` | Owned agent fields replace slot-indexed storage. Existing pebbles do not limit carried stock. Crash policies have distinct hook timings. |
| M/T base | `Monitors.Visited`, `Exploration`, `Gathering`, `Dispersion`, identification tasks | Coverage and eventual gathering exist; stable gathering, termination and recurrence remain distinct contracts. |
| R1 | `obliviousRobots`, `agentsWithMemory`, `blackHoleSearch` | Model families already compose space, observation, frames, sensors, components, movement and scheduler. Do not add a constructor for each paper combination. |
| E3 graph ASYNC | `Schedulers.Async events`, pending decisions, `onCompute` | ASYNC, LC-atomic and CM-atomic graph cycles exist. Continuous transit does not. |
| Scheduler policies | `FSync`, `SSync`, `Sequential`, `Bounded k`, `Permutation` in `Schedulers` | New policies often need only a library declaration. Fixed round-robin differs from a new permutation each pass. |
| E4 graph base | User-defined finite/infinite graph spaces | Finite tori/grids need library definitions; infinite 2D symmetry support and some Lean forms remain separate work. |

Algorithms read locations valid for one Look; sensors map those locations to hidden positions internally. Components/tasks store `Pos`, never leaked indices. Observation radius controls the domain independently of sensor strength. At radius r, boundary-to-boundary edges are omitted; a radius-one view does not expose the closing edge of a triangle.

The intentional simulator reference-ordering shortcut remains. Under isomorphism frames, Lean correctness statements quantify over lawful orderings. Record that distinction in paper evidence; canonical ordering is not a gate for these library additions.

The first implementations now live in [P03](../projects/public/myopic-luminous-exploration/README.md) and [P07](../projects/public/myopic-async-gathering/README.md). P03 prototypes initial colors, color counts and hidden FSYNC rule-activity instrumentation; P07 prototypes a position-history monitor for fixed-node gathering. They remain project-local pending promotion review. Both export to Lean, but neither has a general correctness/correspondence proof. P03's initializer keeps a directly initialized color list to satisfy the current exporter, unlike the minimal C1 sketch below.

## 1. Promotion rules

- Preserve paper-specific rules, theorem bounds, named colors, initial classes and examples in projects. The stdlib holds the common contract.
- Prefer a generic per-location sensor to cycle/line duplicates. An ordered adapter must state which structure and orientation justify its order.
- Effects of lights, memory and token actions apply at Compute; movement-sensitive faults act at their declared hook. Test delayed Compute/Move as well as atomic cycles.
- Components own their fields. Alternative components below that own the same flag/action/light fields are alternatives, not intended to compose together.
- Test sensors on a cycle and a branching graph. Test stateful effects with simultaneous requests, delayed events and position transformations.
- Keep public definitions generic. Check private consumers locally and keep their implementations and fixtures in their separate repository.

## 2. Value helpers for views and configurations

Proposed module: `std/views.sim`; V1–V5 remain value-level candidates on the new core. These functions operate on values already observed by a robot or supplied in an initial-domain predicate. They do not grant access to the global configuration. `List Nat` represents a word of occupancy counts or other numeric symbols; separate functions distinguish a centered interval from a rooted circular word.

### V1. Safe occupancy and interval predicates

**Use:** P02/P06/P07 and local rules in P03/P05. Empty intervals are true only when the requested interval is inside the view. Guard bounds before indexing; out-of-view locations must not be classified as observed empty nodes.

```sim
def Views.occupiedAt (v : List Nat) (i : Nat) : Bool :=
  i < v.length ∧ v.at i > 0

def Views.emptyRange (v : List Nat) (start : Nat) (length : Nat) : Bool :=
  start + length ≤ v.length ∧
  (range length).all (fun j => v.at (start + j) = 0)

def Views.occupiedRange (v : List Nat) (start : Nat) (length : Nat) : Bool :=
  start + length ≤ v.length ∧
  (range length).all (fun j => v.at (start + j) > 0)

def Views.occupiedOffsets (v : List Nat) : List Nat :=
  (range v.length).filter (fun i => v.at i > 0)
```

### V2. Reflection, rotation and normalization

**Use:** P02/P03/P05/P07 use mirrored local rules; P04/P06/P08 use circular symmetries. `mirrorInterval` reverses an odd-length centered view and keeps its center fixed. `reflectRing` fixes offset 0. They are intentionally different operations. The helpers return values, not an extra robot orientation or an identity.

```sim
def Views.mirrorInterval (v : List Nat) : List Nat :=
  ofFn v.length fun i => v.at (v.length - 1 - i)

def Views.rotateRing (v : List Nat) (shift : Nat) : List Nat :=
  ofFn v.length fun i => v.at ((i + shift) % v.length)

def Views.reflectRing (v : List Nat) : List Nat :=
  ofFn v.length fun i => v.at ((v.length - i) % v.length)

def Views.presence (counts : List Nat) : List Nat :=
  counts.map (fun n => if n = 0 then 0 else 1)

def Views.mirrorColorCounts (v : List (List Nat)) : List (List Nat) :=
  ofFn v.length fun i => v.at (v.length - 1 - i)

def Views.colorPresence (v : List (List Nat)) : List Nat :=
  v.map (fun colors => if colors.sum = 0 then 0 else 1)
```

For an empty word, `ofFn 0` produces `[]` without evaluating an index. For an even-length interval, reversal has no single fixed center; callers must use the representation's stated convention.

### V3. Periodicity, reflection symmetry and canonical ring words

**Use:** P04/P06/P08; general finite symmetry and initial-domain helpers. Canonicalization returns a word; it does not choose a physical leader among indistinguishable robots. Keeping multiplicities or colors in the input is the caller's responsibility.

```sim
def Views.periodicRing (v : List Nat) : Bool :=
  (range v.length).any (fun k => k > 0 ∧ Views.rotateRing v k = v)

def Views.reflectionSymmetricRing (v : List Nat) : Bool :=
  (range v.length).any (fun k =>
    Views.rotateRing (Views.reflectRing v) k = v)

def Views.canonicalRing (v : List Nat) (allowReflection : Bool) : List Nat :=
  if v.isEmpty then [] else
    let direct := ofFn v.length fun k => Views.rotateRing v k
    let reflected := if allowReflection
      then ofFn v.length fun k => Views.rotateRing (Views.reflectRing v) k
      else []
    let candidates := direct ++ reflected
    (candidates.filter (fun w => candidates.all (fun other => w ≤ other))).at 0
```

An empty configuration needs its own domain condition; these predicates do not decide whether gathering is possible. Canonicalizing color multisets would require a suitable encoding first, rather than flattening them and losing node boundaries.

### V4. Sorted coordinate domains and neighboring gaps

**Use:** P02/P07 initial hull/gap assumptions and other line models. These Nat-coordinate helpers apply to nonnegative initial data, not to opaque positions or arbitrary signed line coordinates. Add an Int counterpart if an admitted consumer needs it; they are not sensors. Distances count edges; they do not count empty nodes. `maximumGap` accepts nondecreasing coordinates and ignores multiplicity gaps of zero naturally.

```sim
def Domains.nondecreasing (positions : List Nat) : Bool :=
  (range positions.length).all (fun i =>
    i = 0 ∨ positions.at (i - 1) ≤ positions.at i)

def Domains.validColors (colors : List Nat) (palette : Nat) (population : Nat) : Bool :=
  palette > 0 ∧ colors.length = population ∧ colors.all (fun c => c < palette)

def Views.maximumGap (positions : List Nat) : Nat :=
  let gaps := ofFn positions.length fun i =>
    if i = 0 then 0 else positions.at i - positions.at (i - 1)
  if gaps.isEmpty then 0
  else (gaps.filter (fun gap => gaps.all (fun other => other ≤ gap))).at 0

def Views.cyclicGaps (occupancy : List Nat) : List Nat :=
  let occupied := Views.occupiedOffsets occupancy
  ofFn occupied.length fun i =>
    let next := if i + 1 < occupied.length
      then occupied.at (i + 1) else occupied.at 0 + occupancy.length
    next - occupied.at i
```

`cyclicGaps` returns `[]` for no occupied node and `[N]` for one occupied node on an N-node ring. It returns gaps in the input word's order, not a canonical gap sequence.

### V5. Borders and isolation in a centered occupancy window

**Use:** P02/P07 border rules, and P03/P05 isolation cases. These classify the observed window only: an empty half-window does not prove that no robot exists farther away. Paper-specific border-neighbor patterns should be built from these helpers in the project.

```sim
def Views.leftBorder (v : List Nat) : Bool :=
  v.length % 2 = 1 ∧ Views.occupiedAt v (v.length / 2) ∧
  Views.emptyRange v 0 (v.length / 2)

def Views.rightBorder (v : List Nat) : Bool :=
  Views.leftBorder (Views.mirrorInterval v)

def Views.isolated (v : List Nat) : Bool :=
  Views.leftBorder v ∧ Views.rightBorder v

def Views.nearestRight (v : List Nat) : Option Nat :=
  let center := v.length / 2
  let seen := (range v.length).filter (fun i => i > center ∧ v.at i > 0)
  if seen.isEmpty then none else some (seen.at 0 - center)
```

`nearestRight` returns an edge distance and `none` when no robot is observed on that side. Use an odd-length centered input; mirroring gives the corresponding left query.

### V6. Visible shortest-path steps

**Observed reuse:** the implemented [P04 tower case](../projects/public/synthesized-ring-gathering/sim/three-robots.sim) and [P06 rendezvous strategy](../projects/public/standup-ring-gathering/sim/rendezvous.sim) both filter the observer's neighbors by decreasing distance to one observed target. This is a topology-independent algorithm-local helper, suitable for promotion after reviewing its distance contract:

~~~sim
def shortestStepsTo (target : Loc) : List Loc :=
  (neighbors here).filter fun l => distance l target + 1 = distance here target
~~~

The result includes all tied first steps, and is empty when the target is `here`. It does not choose an orientation or grant target visibility. Distances are those of the visible graph; both current consumers have full observations. A bounded-view consumer must justify using those distances. For dynamic spaces, filter edge availability separately when the model grants that sensor. The caller decides whether a tie means waiting (P06) or an adversarial choice through admissible frames (P04). The expression is exercised in both projects; the standard library remains unchanged.

## 3. Observation and knowledge proposals

### S2. Capped multiplicity (optional convenience)

**Use:** gathering/exploration model comparisons, including P08/P13. This is independent of observation radius and topology. Cap 1 gives occupancy, cap 2 weak multiplicity; cap 0 means exact counts. Prefer existing `occupied`/`count`/`localMultiplicity` when they already express the contract.

~~~sim
sensor cappedMultiplicity (cap : Nat) (L : Look) (l : Loc) : Nat :=
  let n := (L.occupants l).count present
  if cap = 0 then n else min cap n
~~~

S3's local weak variant is already `localMultiplicity`: cap 2 at `L.here` and cap 1 elsewhere. No extra ring or radius version is proposed.

### S4. Color counts and external-only color sets

**Use:** P03's multiset-valued observation audit; P17's external-light restriction, also useful in comparisons of luminous models. `colors` and `ownLight` already cover P07's set-valued full-light interface. Supplying counts and discarding them in the algorithm would grant excessive information.

~~~sim
sensor colorCounts (includeSelf : Bool) (L : Look) (l : Loc) : List Nat :=
  ofFn L.world.colorCount fun c =>
    (L.occupants l).count fun a =>
      present a ∧ (includeSelf ∨ a ≠ L.me) ∧ a.light = c

sensor externalColors (L : Look) (l : Loc) : List Nat :=
  (range L.world.colorCount).filter fun c =>
    (L.occupants l).any fun a => present a ∧ a ≠ L.me ∧ a.light = c
~~~

These require light storage. External-only models omit `ownLight` and any other route to self color. This sensor does not supply P17's geometric semantics.

### S5. Explicit initial-population knowledge

**Use:** knowledge distinctions in P09 and a general mobile-agent primitive. Do not infer global population from `L.visibleAgents`. Store supplied initial knowledge, not a mutable survivor count.

~~~sim
@[equivariant]
def Knowledge.Population : Component where
  World := { initialPopulation : Nat }
  sensors := [populationSize]
  init := { initialPopulation := param population }

sensor Knowledge.Population.populationSize (L : Look) : Nat :=
  L.world.initialPopulation
~~~

An experiment using this knowledge sets `agents := population`. Space-size knowledge already has `spaceSize`; supplying a parameter to a model does not automatically make it algorithm knowledge.

## 4. Storage and environmental information

### C1. Supplied initial light colors

**Use:** P03/P05 and general colored-start/self-stabilization experiments. Extend the existing light component's initialization policy when promoted; this alternate definition makes the contract explicit now. Require a positive palette and one valid entry per agent. Actions still apply at Compute.

~~~sim
@[equivariant]
def Storage.InitialLights (colors : Nat) : Component where
  World := { colorCount : Nat }
  Agent := { light : Nat }
  actions := [action setLight : Option Nat := none]
  init := { colorCount := colors }
  init i := { light := (param initialColors).at i }
  onCompute C :=
    { agents := fun a =>
        let c := (decisionOf a).setLight
        { light := if (decisionOf a).decided ∧ c.isSome ∧ c.getD 0 < colors
                   then c.getD 0 else a.light } }
~~~

Use `Domains.validColors` in experiment assumptions. An agent-indexed initializer is internal bookkeeping, not a sensor exposing identity. Arbitrary colors alone do not model arbitrary memory or arbitrary scheduler state.

### C2. Finite carried pebbles

**Use:** P10 and token-based search protocols; check which P01 variants actually use tokens. Unlike `Storage.Pebbles`, each agent has finite carried stock. Picks at one position compete for the pre-Compute supply; simultaneous drops become available after that Compute.

~~~sim
@[equivariant]
def Storage.FinitePebbles (perAgent : Nat) : Component where
  World := { pebbles : Multiset Pos }
  Agent := { carried : Nat }
  actions := [action pebble : PebbleAction := .none]
  sensors := [pebblesHere, carriedPebbles]
  init := { pebbles := [] }
  init i := { carried := perAgent }
  onCompute C :=
    let drops := C.agents.filter fun a =>
      (decisionOf a).decided ∧ (decisionOf a).pebble = .drop ∧ a.carried > 0
    let requests := C.agents.filter fun a =>
      (decisionOf a).decided ∧ (decisionOf a).pebble = .pick
    let granted := choose (subsets requests) such that fun selected =>
      C.agents.all fun a =>
        selected.count (fun b => b.pos = a.pos) =
          min (requests.count (fun b => b.pos = a.pos))
              (C.world.pebbles.count (fun p => p = a.pos))
    { world := { C.world with pebbles :=
        (C.world.pebbles.diff (granted.map (·.pos))) ++ drops.map (·.pos) },
      agents := fun a =>
        { carried := a.carried - (if drops.contains a then 1 else 0) +
                      (if granted.contains a then 1 else 0) } }

sensor Storage.FinitePebbles.pebblesHere (L : Look) (l : Loc) : Nat :=
  L.world.pebbles.count (fun p => p = L.position l)

sensor Storage.FinitePebbles.carriedPebbles (L : Look) : Nat :=
  L.me.carried
~~~

No pickup-capacity bound is imposed. Carried tokens on destroyed agents become inaccessible; include them as lost stock in the conservation invariant. Deposit-only resources, owned tokens and tokens released on crash are different policies. The multiset of positions and owned agent stock avoid global node/slot indexing and work on infinite lines as well as finite graphs.

### C3. Anonymous marks and home recognition

**Use:** P09 and general landmarks/search starts. Per-location marks disclose only membership, not physical labels.

~~~sim
@[equivariant]
def Environment.Marks : Component where
  World := { marked : List Pos }
  sensors := [marked]
  init := { marked := param marks }

sensor Environment.Marks.marked (L : Look) (l : Loc) : Bool :=
  L.world.marked.contains (L.position l)
~~~

A unique home, several indistinguishable homes, personal home recognition and guaranteed safety are separate assumptions. Personal home recognition can use an owned `home : Pos` field and a Boolean sensor; it must not expose the home's position.

### C4. Finite whiteboards with write arbitration

**Use:** P21 now supplies a concrete single-writer consumer in [NodeRotors](../projects/public/rotor-router-exploration/sim/rotor.sim). It reads only the pointer at the current node and advances it at Compute. This validates a local node-storage use case; concurrent whiteboard writes still need an arbitration contract before promotion. The project uses parallel position-key and scalar-value arrays so Lean can export the component without nested board-entry records. Store position-keyed records so symmetry transforms keys. Avoid node-number-indexed values. A proposed representation is:

~~~sim-design
structure BoardEntry where
  site : Pos
  value : Nat

def Storage.Whiteboards (values : Nat) : Component where
  World := { boards : List BoardEntry }
  actions := [action writeBoard : Option Nat := none]
  -- Initialize every board to 0 on the chosen finite domain.
  -- At onCompute: choose one valid writer per written position, keep other entries.
  -- A per-location sensor returns that position's value.
~~~

This is a contract sketch, not a complete definition. Specify whether whiteboards cover all finite vertices or a sparse domain, and how concurrent reads/writes linearize. Nested record-valued component fields currently hit a Lean export limitation. Resolve that for the proof track; do not restore opaque node indices as a workaround.

## 5. Fault and hazard variants

Existing `Faults.CrashStop f` acts before Look. `Faults.CrashAt` permits crashes at one fixed position before movement; light changes already applied at Compute survive. Under ASYNC, a hook executes every global step, so moving a crash policy to a hook does not itself restrict crashes to agents taking that event.

### F1/F2. Budgeted crashes before movement, optionally at a fixed position

**Use:** phase-sensitive comparisons in P02/P05/P06. Audit the paper before selecting either variant. They are alternatives to the existing crash components.

~~~sim
@[equivariant]
def Faults.CrashBeforeMove (f : Nat) : Component where
  flags := [flag crashed visible, acts never]
  beforeMove C :=
    let S := choose (subsets (C.agents.filter correct)) such that fun S =>
      C.agents.count (·.crashed) + S.length ≤ f
    { raise crashed := S }

@[equivariant]
def Faults.BoundedCrashAt (f : Nat) : Component where
  World := { crashNode : Pos }
  flags := [flag crashed visible, acts never]
  init := { crashNode := param crashNode }
  beforeMove C :=
    let eligible := C.agents.filter fun a => correct a ∧ a.pos = C.world.crashNode
    let S := choose (subsets eligible) such that fun S =>
      C.agents.count (·.crashed) + S.length ≤ f
    { raise crashed := S }
~~~

A position universally selected as an initial parameter is not automatically an adaptively chosen first-crash position. Describe quantifier order and the all-crashed case explicitly.

### F3/F4. Multiple destructive positions and selective destruction

**Use:** broadly useful hazard primitives, deferred until an admitted paper needs them. They do not assert that P01/P10/P12 solve these stronger variants.

~~~sim
@[equivariant]
def Hazards.MultipleBlackHoles : Component where
  World := { sites : List Pos }
  flags := [flag dead hidden, acts never]
  init := { sites := param holes }
  afterMove C :=
    { raise dead := fun a => present a ∧ C.world.sites.contains a.pos }

@[equivariant]
def Hazards.SelectiveKiller : Component where
  World := { site : Pos }
  flags := [flag dead hidden, acts never]
  init := { site := param killerNode }
  afterMove C :=
    let victims := choose (subsets (C.agents.filter fun a =>
      present a ∧ a.pos = C.world.site))
    { raise dead := victims }
~~~

No fairness forces selective destruction. This is not a full Byzantine hole: it cannot forge messages, mutate other components' storage or move agents.

## 6. History monitors and task data

### M1. Repeated collective coverage epochs

**Use:** P03/P05 perpetual exploration on finite graphs. Reset a visited set after every complete coverage and pulse a Boolean. Infinite pulses are equivalent to infinite collective revisits on a fixed finite domain; the monitor alone does not add recurrence to the goal language.

~~~sim
@[equivariant]
def Monitors.CoverageEpoch : Component where
  World := { seen : Multiset Pos, complete : Bool }
  init := { seen := [], complete := false }
  beforeLook C :=
    { world := { C.world with seen :=
        (C.world.seen ++ (C.agents.filter present).map (·.pos)).dedup } }
  afterMove C :=
    let seen := (C.world.seen ++ (C.agents.filter present).map (·.pos)).dedup
    let complete := C.positions.all fun p => seen.contains p
    { world := { C.world with seen := if complete then [] else seen, complete } }
~~~

Do not expose monitor state to algorithms. Per-correct-agent recurrence with crashes is a different contract; one survivor's collective visits do not prove every correct robot explores.

### M2. Target-pattern data

**Use:** P14 and later formation papers; also useful for ring patterns. A target can be stored as `List Pos`, but the task must compare it modulo an explicitly specified transformation group. Space automorphisms are not necessarily the target's allowed similarities (e.g. scale). Keep the matching API at design status until that group/action is available; do not invent a canonical physical orientation.

### M3. Last completed movement feedback

**Use:** P09/P10 where the protocol is told whether its requested move succeeded. Owned fields can store origin and pending target at `beforeMove`, then compare the resulting position at `afterMove`. Update feedback only for a robot actually taking Move, preserve it through other robots' events, and define crash behavior.

~~~sim-design
-- Proposed component contract; fields below are hidden.
Agent := { origin : Pos, requested : Pos, movingThisStep : Bool,
           lastMoveSucceeded : Bool }
-- beforeMove: remember decisionOf(a).target only when decided.
-- afterMove: success := final position = requested, for those agents only.
-- Sensor: return lastMoveSucceeded at the next Look.
~~~

This does not require rebuilding event-based ASYNC. It may require an explicit initialization/context facility for owned position fields; settle that with the admitted paper. It does not model port buffers, crossings or transit visibility.

## 7. Task proposals and exact temporal meaning

Tasks inspect physical positions. Sensors remain independent. Empty/correct-agent populations must follow the paper's convention rather than silently granting success.

### T1/T2. Stable gathering of present or correct robots

**Use:** P02/P04/P06/P07/P08 and general fault variants. Existing `Gathering` asks only for a moment of co-location. Under ASYNC a pending move can leave that position afterward.

~~~sim
@[equivariant]
task StableGathering (C : Config) : Verdict :=
  let robots := C.agents.filter present
  if robots.isEmpty then .failure
  else if robots.all (fun a => robots.all (fun b => a.pos = b.pos))
  then .success else .inProgress

goal StableGathering := eventually always .success

@[equivariant]
task StableCorrectGathering (C : Config) : Verdict :=
  let robots := C.agents.filter correct
  if robots.isEmpty then .failure
  else if robots.all (fun a => robots.all (fun b => a.pos = b.pos))
  then .success else .inProgress

goal StableCorrectGathering := eventually always .success
~~~

These tasks guarantee permanent co-location. They still permit a co-located group to move together forever. If a paper requires staying at one fixed meeting position, add a position-history/stationarity condition or prove that the algorithm's gathered configurations have no future movement, including pending moves. In particular, permanent co-location alone is not the full P07 specification.

For SUIG, gathering only correct robots ignores the crashed location. A separate stable contract includes all visible crashed bodies or explicitly requires the correct robots to reach the unique crash position, matching the admitted fault model. P06's [fault/task model](https://arxiv.org/html/2402.14233v1#S2) must be checked independently of P02.

### T3. Stable near gathering

**Use:** P09 and related dynamic-gathering variants. All relevant robots must eventually remain on one position or the two ends of an edge. A generic task needs physical adjacency; `neighbors` is currently algorithm-local. Do not express it using `C.resolve` without a kept-port assumption.

~~~sim-design
task StableNearGathering (C : Config) : Verdict :=
  -- nonempty relevant robots, supported on {p} or {p,q} with physical adjacency p~q
goal StableNearGathering := eventually always .success
~~~

Decide whether adjacency means the underlying edge or an edge present at that step. A task-level adjacency query is a small core API proposal; a cycle-specific project predicate can instead use the paper's known space definition.

### T4. Collision freedom

**Use:** a broadly useful safety primitive for exploration/formation variants. This is state collision freedom; opposite-direction edge crossings are different.

~~~sim
@[equivariant]
task CollisionFree (C : Config) : Verdict :=
  let robots := C.agents.filter present
  if robots.all (fun a => robots.count (fun b => b.pos = a.pos) ≤ 1)
  then .success else .failure

goal CollisionFree := always ¬ .failure
~~~

### T5. Coverage with reported termination

**Use:** a general explicit-output contract, potentially a subclaim in P03. Algorithms expose `output done`. This does not establish that no paper rule is enabled, or that pending movement is absent.

~~~sim
@[equivariant]
task ReportedExploration (C : Config) : Verdict :=
  if C.positions.all (fun p => C.world.visited.contains p) ∧
     C.agents.all (fun a => a.done)
  then .success else .inProgress

goal ReportedExploration := eventually always .success
~~~

Needs `Monitors.Visited`. [P03 §2.3](https://arxiv.org/html/1805.03965v1#S2.SS3) defines termination by eventual rule-disabledness. Prove an output/disabledness correspondence or supply the exact rule predicate; do not rename a coverage check “terminating exploration.” Generic enabledness is E2.

### T6. At least one surviving identifier

**Use:** search papers with a survivor-based guarantee, after auditing P10/P12's exact requirements. Existing identification tasks require every correct survivor to claim. This variant permits other survivors to remain undecided.

~~~sim
@[equivariant]
task SomeIdentifyBlackHole (C : Config) : Verdict :=
  let alive := C.agents.filter correct
  if alive.isEmpty then .failure
  else if alive.any (fun a =>
    a.claim.isSome ∧ C.resolve a (a.claim.getD 0) = C.world.site)
  then .success else .inProgress

goal SomeIdentifyBlackHole := eventually always .success
~~~

This only requires one correct answer eventually forever. If the paper also forbids every incorrect declaration, add that safety condition explicitly. Persistent ports are required by `C.resolve`; remote outputs need their own interpretation.

### T7. Stable pattern formation

**Use:** P14 and formation families. Requires M2's specified target equivalence, plus a separate collision/connectivity condition if the theorem requires it.

~~~sim-design
task PatternFormation (C : Config) : Verdict :=
  -- .success iff the occupied configuration matches the target under the admitted group
goal PatternFormation := eventually always .success
~~~

## 8. Remaining semantic extensions

| ID | Extension and proposed contract | Papers / acceptance criterion |
| --- | --- | --- |
| E1 | Recurrence (`infinitely often`), goal conjunction, separate environment assumptions | P03/P05/P11. Add to IR, explorer and Lean together. Check an execution that covers once then omits one node forever, unfair scheduling, and topology assumptions independently. An epoch pulse must recur, not merely appear once. |
| E2 | Enabledness, actual terminality; later weak/strong daemon fairness | P03 and self-stabilization. Define paper-rule enabledness versus “some possible decision changes state”; these are not interchangeable. Scheduling currently uses `C.eligible`, not `C.enabled`. See the scheduler design's deferred work. |
| E3 | Remaining ASYNC scope: continuous moving phase, non-rigid progress, transit observations | Graph event cuts are implemented. P17/P19 still need geometry/motion; discrete pilots need only a contract audit unless they require extra transit semantics. |
| E4 | More discrete spaces and edge policies | Finite tori/grids are library additions. P12's row/column dynamics and P11's temporal constraints need an explicit edge/environment policy. Infinite 2D canonicalization and Lean record vertices remain unsupported. |
| E5 | Exact geometry, local coordinate frames and justified finite abstractions | P16–P20. Choose executable exact arithmetic or prove a property-preserving abstraction. `Euclidean.Plane` is an interface, not an executable model. |
| E6 | Port buffers, cross detection and movement events | P09/P10 where required. Expose information at the paper's next observation; a current-edge sensor or M3 feedback does not implement a crossing. Audit behavior when an edge disappears between Look and Move. |
| E7 | Probability and Byzantine state/messages | P15. Separate probabilistic transitions from adversarial `choose`; specify adaptive powers and information. `acts adversary` alone supplies movement choices, not arbitrary messages/state corruption. |

### E4 library part: a finite torus

**Use:** P12/P13. This is an ordinary `Space` definition on the current graph core. A scalar vertex encoding also stays within the current Lean vertex-type subset. The port convention below is east/north/west/south; the selected frames decide whether agents retain that convention. Start validation with dimensions at least 3; audit smaller dimensions against each paper instead of silently treating parallel edges as a simple torus.

~~~sim
def Graphs.Torus (rows : Nat) (cols : Nat) : Space where
  Vertex := Nat
  vertices := range (rows * cols)
  neighbors v :=
    let r := v / cols
    let c := v % cols
    [r * cols + (c + 1) % cols,
     ((r + 1) % rows) * cols + c,
     r * cols + (c + cols - 1) % cols,
     ((r + rows - 1) % rows) * cols + c]
  automorphisms := .computed
~~~

Generic occupancy, multiplicity, color and mark sensors need no torus versions. Computed automorphisms may become expensive; measure small instances before introducing a specialized group implementation. This graph alone supplies neither P12's per-ring dynamic constraints nor a proof of either paper's algorithm.

Example future goal surface, deliberately not accepted syntax:

~~~sim-design
task RepeatedCoverage (C : Config) : Verdict :=
  if C.world.complete then .success else .inProgress
goal RepeatedCoverage := infinitely often .success
~~~

A new core API follows the repository's coordinated semantics/IR/conformance/interpreter/Lean workflow. A new finite graph, sensor or policy using current APIs does not need another core redesign.

## 9. Priority and promotion checks

| Priority | Work | Why / exit criterion |
| --- | --- | --- |
| First pilot | T1 and P07 audit; reuse existing sensors, lights and ASYNC | Validate stale observations, a Look concurrent with Compute, and gathering followed by an old pending move. Do not add an unneeded own-light or ASYNC implementation. |
| Next shared additions | C1, S4, useful V helpers, P03/P06/P04 audits | Preserve initial colors and exactly the visible information. Choose one public consumer plus another audited need, or justify the primitive's general value. |
| Exploration specification | E2/T5 for P03; E1/M1 for P03/P05 | Exact disabledness/recurrence before claiming terminating/perpetual results. Rule translation and coverage evidence can proceed separately. |
| Dynamic-agent cases | C2/C3/S5/M3 and the applicable E6/E4 work | Check resource conservation, blocked moves, per-port availability and environment assumptions. Prefer existing components where their contracts already match. |
| Topology/proof track | Finite torus pilot P13; export/equivariance gap met by a selected artifact | Reuse generic sensors; test port/symmetry conventions. Scalar vertex encodings can avoid the record-vertex Lean limitation when faithful. |
| Demand driven | C4, F3/F4, M2/T7, geometry and probability | Wait for a concrete admitted protocol rather than building every conceivable interface. |

Each promoted entry needs a short contract, named consumers, current-language source, meaningful semantic examples and relevant tests. Components with `@[equivariant]` need verification against the admitted transformations; the attribute is a claim, not a theorem. For proof-track consumers, check export and state the remaining proof obligations. Current generic equivariance lemmas do not automatically cover every isomorphism-frame, conjugated-effect or dynamic-space case.

## 10. Review and validation

The 24 October revision inspected the actual stdlib, graph/view and event/scheduler runtime and tests. The focused 66-test baseline and strict TypeScript check are recorded in the [roadmap](public-projects-roadmap.md#review-and-validation-of-this-revision). All 19 executable snippets were combined in temporary compilation probes with seven experiment/component/task combinations, including cycles, a star and the proposed torus; compilation had no diagnostics and each experiment produced initial successors. These smoke checks do not establish all contract properties, conservation, equivariance or Lean export. Proposal snippets are not installed library code. Design sketches deliberately keep unavailable APIs/goals visible rather than presenting them as existing exports. No paper theorem follows from this proposal, from bounded checks, or from generated Lean compilation.
