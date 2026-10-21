# Core and standard-library redesign proposal

Design proposal · revised 20 October 2026 · documentation only

This document proposes reusable definitions for the [public-paper program](public-projects-roadmap.md). Paper IDs P01–P20 refer to that catalog. Admit a definition when at least two papers need its contract, or when it is a small, broadly useful primitive. Reuse assessments below are design judgments; they do not replace the full model audit for each paper.

**The first phase, specified in [core-redesign.md](core-redesign.md), rewrites the semantic core and the shared `.sim` standard library.** Physical positions and observed locations are separate, sensors are queried by location, and the model declares the morphisms through which agents see their surroundings. The ring becomes a library graph with helpers. This supersedes the earlier plan to start by adding more ring-specific sensors.

The catalog retains **30 current-language proposal groups** and **7 later extension groups** as a feature backlog. Its ring-based implementations are not the target architecture: each capability is rewritten on the Phase 0 base when it is promoted (section 0).

Blocks tagged `sim-design` describe proposed interfaces requiring implementation; they are not accepted `.sim` syntax. Blocks tagged `sim` are the earlier executable prototypes against today's core. Their successful compilation does not validate the new architecture. Names and surface syntax remain proposals. All current-language blocks share these imports, and later blocks may use earlier definitions:

```sim
import "std/models.sim"
import "std/tasks.sim"
```

## 0. Foundation: Phase 0

The foundation is specified in [core-redesign.md](core-redesign.md): graph and Euclidean core spaces, observations through opaque locations whose order hides physical identities, sensors queried by location, declared frames (morphism sets), movement models, library spaces (`Graphs.Cycle`, `Graphs.Line`, `Graphs.Star`, ...) and the steps that bring the existing projects back. Phase 0 keeps no legacy definitions.

The catalog below predates that design. Its `sim` blocks are prototypes against the current ring core, kept for their semantics: when an entry is promoted, rewrite it on the Phase 0 base. In particular:

| Earlier proposals | Destination on the Phase 0 base |
| --- | --- |
| S1–S4, S6 | Per-location sensors (`occupied`, `count`, `localMultiplicity`, `colors`, `ownLight`, `edgeTo`); radius and full visibility are observation choices. |
| S5 | An explicit knowledge sensor, never implied by the configuration. |
| C1–C4, F1–F4, M1–M3 | Components with `Pos`-typed fields and owned agent fields instead of global node or slot indices. |
| T1–T7 | Tasks over positions; local outputs interpreted with `C.resolve`. Pattern matching needs an explicit transformation group. |
| V1–V5 | Value helpers over lists built from locations (`(Line.window phi).map occupied`). |
| R1 | Superseded by `robots` in core-redesign.md. |
| E3–E5 | ASYNC, further spaces and Euclidean execution build on the Phase 0 interfaces. |

## 1. Reuse the existing library

These definitions exist in today's core. Phase 0 rewrites their capabilities on the new base without keeping the old entry points; this inventory records what the rewrite must cover:

| Existing definitions | Reuse |
| --- | --- |
| `Vision.Radius`, `lineView`, `colorView` | Finite-radius occupancy and color-set observations: P02, P03, P05, P07. Audit the required multiplicity information before selecting a view. |
| `ringPresence`, `ringCount` | Full-ring occupancy or exact multiplicities: ring gathering and synthesis, including P04/P08. |
| `Storage.Lights k` | Fixed positive palette, initially color 0; P02/P03/P05/P07. The component stores colors; sensors decide who can read them. |
| `Faults.CrashStop f`, `Faults.CrashAtNode` | Global crash budget before Look, or unbounded crashes at a fixed node before movement. |
| `Storage.Pebbles`, `otherStates`, `ringSize` | Existing node-token actions, co-located public states and ring-size knowledge. Finite carried-token inventories are a distinct missing capability. |
| `Monitors.Visited`, `Exploration`, `Gathering` | Collective visits, eventual coverage and eventual co-location of present robots. Stable gathering and recurrence have different specifications. |
| `Frames.PersistentReflection`, `Frames.common`, `Frames.dynamicReflection` | Existing orientation choices; a new paper does not need another orientation component. |
| `Ring`, `DynamicRing k`, `.fsync`, `.ssync`, `.sequential` | Existing core constructors, not `.sim` library implementations. Sequential scheduling is not general ASYNC. |

In particular, do not add `TwoColorLights`, `RadiusOneVision`, a separate crash component per paper, or a model constructor for every combination of capabilities. Keep paper rules, special parity/visibility bounds, X/Y/Z notation, ring padding and manuscript examples in their projects.

## 2. Value helpers for views and configurations

Proposed module: `std/views.sim`. These functions operate on values already observed by a robot or supplied in an initial-domain predicate. They do not grant access to the global configuration. `List Nat` represents a word of occupancy counts or other numeric symbols; separate functions distinguish a centered interval from a rooted circular word.

### V1. Safe occupancy and interval predicates

**Use:** P02/P06/P07 and local rules in P03/P05. Empty intervals are true only when the requested interval is inside the view. An out-of-view node must not become an observed empty node through the default returned by indexing.

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

**Use:** P02/P07 initial hull/gap assumptions and other line models. These are initial-data helpers, not sensors. Distances count edges; they do not count empty nodes. `maximumGap` accepts nondecreasing coordinates and ignores multiplicity gaps of zero naturally.

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

## 3. Observation capabilities

Proposed module: `std/sensors.sim` or a later split into `std/vision.sim` and `std/knowledge.sim`. All sensors below use `present`, so crashed visible robots remain observable and hidden destroyed robots disappear. None reveals correctness flags. Choosing stronger sensors must be an explicit model decision.

### S1. Own light

**Use:** P03/P05 explicitly distinguish the observing robot's own color; P02/P07 can reuse it when their models permit self-light observation. The [exploration paper's model, §2.1](https://arxiv.org/html/1805.03965) and the [crash-tolerant paper's model, §2.1](https://drops.dagstuhl.de/storage/00lipics/lipics-vol324-opodis2024/html/LIPIcs.OPODIS.2024.12/LIPIcs.OPODIS.2024.12.html) motivate keeping own-light access separate from neighboring color observations.

```sim
sensor ownLight (C : Config) (me : Agent) : Nat :=
  if me.slot < C.world.lights.length then C.world.lights.at me.slot else 0
```

Needs `Storage.Lights` or C1 below. Do not add it to external-light models such as P17. “External” describes what an observer can read, not merely where the color is stored.

### S2. Finite-radius multiplicity, with an explicit information cap

**Use:** General observation lattice for gathering/exploration papers. P08/P13 motivate distinct multiplicity capabilities; P13's torus version needs a topology-specific view later. `cap = 1` gives occupancy, `cap = 2` distinguishes empty/singleton/multiple, and `cap = 0` means exact counts. The output contains `2φ+1` offsets, not N entries.

```sim
sensor radiusCounts (cap : Nat) (C : Config) (me : Agent) (frame : Frame) : List Nat :=
  ofFn (2 * C.world.phi + 1) fun i =>
    let p := offset me.pos frame ((C.size + i - C.world.phi) % C.size)
    let count := C.agents.count (fun a => present a ∧ a.pos = p)
    if cap = 0 then count else min cap count
```

Needs `Vision.Radius`. Require `φ < N` for this ring implementation's offset arithmetic, and preferably `2φ < N` when the model must see each node at most once. An infinite-line project needs a confinement/padding argument. This is not a generic graph-distance sensor.

### S3. Local weak multiplicity with full-ring occupancy

**Use:** P08/P13 and other models where a robot can detect a multiplicity only at its own node. The center is 0/1/2; other entries are 0/1. This does not grant exact population knowledge.

```sim
sensor ringLocalWeakMultiplicity (C : Config) (me : Agent) (frame : Frame) : List Nat :=
  ofFn C.size fun i =>
    let p := offset me.pos frame i
    let count := C.agents.count (fun a => present a ∧ a.pos = p)
    min (if i = 0 then 2 else 1) count
```

The representation exposes ring size through its length, as existing full-ring views do. A bounded-view model should instead cap only the center of a finite-radius observation.

### S4. Color multiplicities and external-light views

**Use:** P03/P05 colored configurations; P02/P07 when an audited observation needs more than the existing color sets. Each entry is a vector of counts indexed by the palette, preserving multiplicities. `includeSelf = false` removes the observing robot but preserves co-located other robots. Own-light access remains S1, selected separately.

```sim
sensor radiusColorCounts (includeSelf : Bool) (C : Config) (me : Agent) (frame : Frame) : List (List Nat) :=
  ofFn (2 * C.world.phi + 1) fun i =>
    let p := offset me.pos frame ((C.size + i - C.world.phi) % C.size)
    ofFn C.world.colorCount fun color => C.agents.count (fun a =>
      present a ∧ a.pos = p ∧ (includeSelf ∨ a ≠ me) ∧
      (if a.slot < C.world.lights.length then C.world.lights.at a.slot else 0) = color)

sensor ringColorCounts (includeSelf : Bool) (C : Config) (me : Agent) (frame : Frame) : List (List Nat) :=
  ofFn C.size fun i =>
    let p := offset me.pos frame i
    ofFn C.world.colorCount fun color => C.agents.count (fun a =>
      present a ∧ a.pos = p ∧ (includeSelf ∨ a ≠ me) ∧
      (if a.slot < C.world.lights.length then C.world.lights.at a.slot else 0) = color)

sensor externalColorView (C : Config) (me : Agent) (frame : Frame) : List (List Nat) :=
  ofFn (2 * C.world.phi + 1) fun i =>
    let p := offset me.pos frame ((C.size + i - C.world.phi) % C.size)
    (range C.world.colorCount).filter (fun color => C.agents.any (fun a =>
      present a ∧ a ≠ me ∧ a.pos = p ∧
      (if a.slot < C.world.lights.length then C.world.lights.at a.slot else 0) = color))
```

Needs light storage; radius versions also need `Vision.Radius` and S2's offset-domain restriction. `externalColorView` returns sets of other robots' colors, unlike the count vectors; it provides the missing external-only counterpart of the existing `colorView`. These are graph observations, not an implementation of P17's Euclidean geometry. When only sets including self are allowed, use existing `colorView`; deriving sets inside the algorithm after supplying counts would already grant excess information.

### S5. Initial population knowledge

**Use:** P09's distinctions between knowledge of n and k, plus a general known-population capability. The engine retains agent records after destruction, so this is the initial population, not the number currently visible or correct.

```sim
sensor populationSize (C : Config) (me : Agent) : Nat :=
  C.agents.length
```

Do not silently add this sensor to anonymous weak-robot models. Knowing a parameter in the experiment does not mean the robots know it.

### S6. Incident-edge availability

**Use:** P09/P10 and dynamic-ring search. Returns `[local ccw, local cw]` for the current Look. It reports availability, not how many agents traverse an edge, and does not retain a blocked agent in a port.

```sim
sensor incidentEdges (C : Config) (me : Agent) (frame : Frame) : List Bool :=
  [edgePresent me.pos (toGlobal frame .ccw),
   edgePresent me.pos (toGlobal frame .cw)]
```

## 4. Storage and fixed environmental information

Proposed module: `std/storage.sim`. Slot fields below are internal associations, never robot IDs or public sensors. Alternative implementations owning the same fields/actions are mutually exclusive. Components still obey the existing snapshot and ownership rules.

### C1. Light storage with supplied initial colors

**Use:** P03/P05 configured colored starts; P07 and self-stabilizing models. Prefer eventually extending `Storage.Lights` with an optional initialization policy; this separately named proposal makes the changed contract reviewable without modifying the existing component. Requires `initialColors` of exactly the agent count, in the palette. It preserves today's Compute-before-movement update timing.

```sim
def Storage.InitialLights (colors : Nat) : Component where
  World := { colorCount : Nat, lights : List Nat }
  Agent := { slot : Nat }
  actions := [action light : Option Nat := none]
  init := { colorCount := colors, lights := param initialColors }
  init i := { slot := i }
  beforeMove C :=
    let lights := ofFn C.agents.length fun i =>
      let previous := if i < C.world.lights.length then C.world.lights.at i else 0
      let updates := C.agents.filter (fun a => a.slot = i ∧ (decisionOf a).decided ∧
        (decisionOf a).light.isSome ∧ (decisionOf a).light.getD 0 < C.world.colorCount)
      if updates.isEmpty then previous else (updates.map (fun a => (decisionOf a).light.getD 0)).sum
    { world := { C.world with lights } }
```

Use `Domains.validColors` in the experiment. Arbitrary initial colors can be enumerated as experiment settings; arbitrary private memory and arbitrary fault state need their own self-stabilization contracts.

### C2. Finite carried pebbles

**Use:** P01/P10 and token-based mobile-agent algorithms. Existing `Storage.Pebbles` counts node tokens but has no carried stock, so it cannot establish a bound on the number of physical pebbles. This component gives every agent `perAgent` pebbles initially. One activation can request one drop or pick. Picks are resolved among competing agents; the number granted is exactly the available supply, capped by requests. Same-round drops become available in the next round.

```sim
def Storage.FinitePebbles (perAgent : Nat) : Component where
  World := { tokenNodes : Multiset Node, tokenStock : List Nat, tokenBudget : Nat }
  Agent := { tokenSlot : Nat }
  actions := [action token : PebbleAction := .none]
  init := { tokenNodes := [], tokenStock := [], tokenBudget := perAgent }
  init i := { tokenSlot := i }
  beforeMove C :=
    let drops := C.agents.filter (fun a => (decisionOf a).decided ∧
      (decisionOf a).token = .drop ∧
      (if a.tokenSlot < C.world.tokenStock.length
       then C.world.tokenStock.at a.tokenSlot else C.world.tokenBudget) > 0)
    let requests := C.agents.filter (fun a =>
      (decisionOf a).decided ∧ (decisionOf a).token = .pick)
    let granted := choose (subsets requests) such that fun selected =>
      C.nodes.all (fun p => selected.count (fun a => a.pos = p) =
        min (requests.count (fun a => a.pos = p)) (C.world.tokenNodes.count (fun q => q = p)))
    let stock := ofFn C.agents.length fun i =>
      let previous := if i < C.world.tokenStock.length then C.world.tokenStock.at i else C.world.tokenBudget
      previous - drops.count (fun a => a.tokenSlot = i) + granted.count (fun a => a.tokenSlot = i)
    { world := { C.world with tokenStock := stock,
      tokenNodes := (C.world.tokenNodes.diff (granted.map (·.pos))) ++ drops.map (·.pos) } }

sensor carriedPebbles (C : Config) (me : Agent) : Nat :=
  if me.tokenSlot < C.world.tokenStock.length then C.world.tokenStock.at me.tokenSlot else C.world.tokenBudget

sensor finitePebblesHere (C : Config) (me : Agent) : Nat :=
  C.world.tokenNodes.count (fun p => p = me.pos)
```

The code specifies indistinguishable tokens, no pickup-capacity bound, and inaccessible carried tokens after an agent dies. Budget accounting includes that lost stock. Other choices—tokens dropped on crash, private token identity, receiving same-round drops—are different contracts. Do not assume this policy matches every pebble paper without checking it.

### C3. Fixed anonymous marks / homebases

**Use:** Marked homebases in P09; generally useful for landmarks and distinguished safe starting nodes in search models. All marked nodes look alike. The list `marks` is environmental data, not a robot's knowledge of every mark's position.

```sim
def Environment.Marks : Component where
  World := { markedNodes : List Node }
  init := { markedNodes := param marks }

sensor markedHere (C : Config) (me : Agent) : Bool :=
  C.world.markedNodes.contains me.pos
```

A unique mark, a mark at every initial homebase, and a guaranteed safe homebase are separate experiment assumptions. The mark itself does not confer safety or expose absolute node labels.

### C4. Finite node whiteboards with explicit write arbitration

**Use:** General mobile-agent communication primitive, including model comparisons/lower bounds discussed in P01/P10. This is a finite-alphabet register per node, initially 0. A simultaneous conflict chooses one writer nondeterministically per written node. Reads occur before this round's writes. It is not an unbounded whiteboard or a mailbox.

```sim
def Storage.Whiteboards (values : Nat) : Component where
  World := { boards : List Nat, boardValues : Nat }
  actions := [action writeBoard : Option Nat := none]
  init := { boards := [], boardValues := values }
  beforeMove C :=
    let writers := C.agents.filter (fun a => (decisionOf a).decided ∧
      (decisionOf a).writeBoard.isSome ∧ (decisionOf a).writeBoard.getD 0 < C.world.boardValues)
    let winners := choose (subsets writers) such that fun selected =>
      C.nodes.all (fun p => selected.count (fun a => a.pos = p) =
        if writers.any (fun a => a.pos = p) then 1 else 0)
    let boards := ofFn C.size fun i =>
      let chosen := winners.filter (fun a => a.pos = C.nodes.at i)
      if chosen.isEmpty then (if i < C.world.boards.length then C.world.boards.at i else 0)
      else (chosen.map (fun a => (decisionOf a).writeBoard.getD 0)).sum
    { world := { C.world with boards } }

sensor whiteboardHere (C : Config) (me : Agent) : Nat :=
  let indices := (range C.size).filter (fun i => C.nodes.at i = me.pos)
  let i := indices.at 0
  if i < C.world.boards.length then C.world.boards.at i else 0
```

Require `values > 0`. The board list is indexed by global node number: its entries do not automatically move under a symmetry because they are `Nat`, not `Node`. Disable symmetry reduction for this proposal until the representation or symmetry action is addressed. Node-list indexing also encounters a recorded Lean generation limitation. This is lower priority than light/pebble work.

## 5. Faults and hazards

Proposed module: `std/faults.sim`. Additional names should identify changed fault semantics, not a paper. Retain existing policies when they already match. A visible crash flag keeps a body in occupancy observations; it does not mean the algorithm can read the flag unless a sensor exposes it.

### F1. Budgeted crash after Compute, before movement

**Use:** P02/P05/P06 phase-sensitive crash analysis and broader luminous models. The existing budgeted crash acts before Look; the existing fixed-node crash acts before movement without a global budget. This proposal combines a global budget with the latter timing. Light/storage updates from other before-movement hooks see the same pre-crash snapshot and can commit.

```sim
def Faults.CrashBeforeMove (f : Nat) : Component where
  flags := [flag crashed visible, acts never]
  beforeMove C :=
    let selected := choose (subsets (C.agents.filter correct)) such that fun selected =>
      C.agents.count (·.crashed) + selected.length ≤ f
    { raise crashed := selected }
```

### F2. Budgeted crashes restricted to one fixed node

**Use:** P02/P06, and a useful restricted case for fault-model comparisons with P05. Keep separate from F1 and the existing crash components; they own the same flag and are alternatives.

```sim
def Faults.BoundedCrashAtNode (f : Nat) : Component where
  World := { crashNode : Node }
  flags := [flag crashed visible, acts never]
  init := { crashNode := param crashNode }
  beforeMove C :=
    let eligible := C.agents.filter (fun a => correct a ∧ a.pos = C.world.crashNode)
    let selected := choose (subsets eligible) such that fun selected =>
      C.agents.count (·.crashed) + selected.length ≤ f
    { raise crashed := selected }
```

This selects a node in the initial setting, not necessarily a node that the adversary can choose adaptively after observing an execution. Do not conflate the quantifier orders.

### F3. Several static destructive nodes

**Use:** General extension of P01/P10/P12's destructive-node capability; not a claim that those papers solve the multiple-hole problem. Every present agent on a listed node is destroyed after movement.

```sim
def Hazards.MultipleBlackHoles : Component where
  World := { holeNodes : List Node }
  flags := [flag dead hidden, acts never]
  init := { holeNodes := param holes }
  afterMove C :=
    { raise dead := fun a => present a ∧ C.world.holeNodes.contains a.pos }
```

### F4. Selective destruction at one node

**Use:** General gray/selective-hole primitive for future dangerous-network papers. It is deliberately not named a full Byzantine hole: this component cannot erase another component's whiteboard, alter robot state or move agents. Permanent black holes should continue using the existing component.

```sim
def Hazards.SelectiveKiller : Component where
  World := { killerNode : Node }
  flags := [flag dead hidden, acts never]
  init := { killerNode := param killerNode }
  afterMove C :=
    let eligible := C.agents.filter (fun a => present a ∧ a.pos = C.world.killerNode)
    let victims := choose (subsets eligible)
    { raise dead := victims }
```

No fairness forces this adversary to destroy an agent. Keep F3/F4 optional until a concrete admitted paper needs them; they are useful generic contracts, not first-batch blockers.

## 6. History monitors and task data

Proposed module: `std/monitors.sim`. Monitor state is for specifications. Do not give algorithms a sensor reading it unless the paper explicitly supplies the corresponding knowledge. `Monitors.Visited` already handles collective historical coverage.

### M1. Repeated coverage epochs

**Use:** Perpetual exploration in P03/P05. Each epoch collects visited nodes and produces a completion pulse once all nodes have been observed. The next round begins a fresh epoch. Repeated completions express recurring collective coverage of a finite ring without an unbounded counter.

```sim
def Monitors.CoverageEpochs : Component where
  World := { epochSeen : Multiset Node, epochComplete : Bool }
  init := { epochSeen := [], epochComplete := false }
  afterMove C :=
    let previous := if C.world.epochComplete then ([] : Multiset Node) else C.world.epochSeen
    let seen := (previous ++ (C.agents.filter present).map (·.pos)).dedup
    let completed := C.nodes.all (fun p => seen.contains p)
    { world := { C.world with epochSeen := seen, epochComplete := completed } }
```

This component is expressible today; the recurring temporal goal in E1 is not. A cumulative visited set followed by `eventually always success` would only prove one-time coverage. Count only correct robots instead of present robots only when that is the paper's task; after the last crash, the relevant convention must still match the theorem. This monitor samples discrete post-movement states; future transit models need a defined visit-event policy.

### M2. Ring target-pattern specification

**Use:** General discrete formation/pattern comparison, and a ring counterpart for the future P14/P20 work. This is target data for the task, not a promise that robots know the target. The target is a full N-entry count word, compared up to rotation and optionally reflection.

```sim
def Specifications.RingPattern : Component where
  World := { targetPattern : List Nat, patternMayReflect : Bool }
  init := { targetPattern := param targetPattern, patternMayReflect := param patternMayReflect }
```

Validate that the target length is N and its sum matches the intended population. P14's grid and P20's plane need different pattern representations and transformation groups; do not encode their geometry as a ring word.

### M3. Feedback about the robot's last completed activation

**Use:** P09/P10 motivate movement feedback in dynamic rings; the primitive is also general enough for other graph protocols. Save the source node before movement and compare it with the resulting node afterwards. Retain the result through rounds in which that robot is inactive. This records actual displacement rather than assuming a requested move succeeds. Select the sensor only when the model grants this knowledge.

```sim
def Motion.Feedback : Component where
  World := { moveSources : List Node, moveDecided : List Bool,
    moveRequested : List Bool, moveSucceeded : List Bool }
  Agent := { motionSlot : Nat }
  init := { moveSources := [], moveDecided := [], moveRequested := [], moveSucceeded := [] }
  init i := { motionSlot := i }
  beforeMove C :=
    let sources := ofFn C.agents.length fun i =>
      (C.nodes.filter (fun p => C.agents.any (fun a => a.motionSlot = i ∧ a.pos = p))).at 0
    let decided := ofFn C.agents.length fun i =>
      C.agents.any (fun a => a.motionSlot = i ∧ (decisionOf a).decided)
    let requested := ofFn C.agents.length fun i =>
      C.agents.any (fun a => a.motionSlot = i ∧ (decisionOf a).decided ∧ (decisionOf a).move ≠ .stay)
    { world := { C.world with moveSources := sources, moveDecided := decided,
      moveRequested := requested } }
  afterMove C :=
    let succeeded := ofFn C.agents.length fun i =>
      if C.world.moveDecided.at i then
        C.world.moveRequested.at i ∧
        C.agents.any (fun a => a.motionSlot = i ∧ a.pos ≠ C.world.moveSources.at i)
      else if i < C.world.moveSucceeded.length then C.world.moveSucceeded.at i else false
    { world := { C.world with moveSucceeded := succeeded } }

sensor lastMoveSucceeded (C : Config) (me : Agent) : Bool :=
  if me.motionSlot < C.world.moveSucceeded.length then C.world.moveSucceeded.at me.motionSlot else false
```

The value is false before a first activation and after a stay; it reports no global clock or robot ID. This prototype relies on nonempty node types and node-list indexing, with a known Lean generation constraint. It is for today's discrete one-edge movement. It does not model in-transit states, identify why a move failed, or provide P09's persistent port occupancy. Unlike cross detection, this feedback can be built from existing hooks.

## 7. Task variants with precise temporal goals

Proposed module: `std/tasks.sim` or a split `std/goals.sim`. Tasks can inspect global state; algorithms cannot. The survivor tasks below intentionally fail when no correct robot remains, avoiding vacuous success. Existing `Gathering` is retained unchanged.

### T1. Stable gathering of all present robots

**Use:** P02/P06/P08 and standard “gather and remain” specifications. With all crashes at one fixed location, including crashed bodies forces surviving robots to that location; an extra `StandUpGathering` predicate is unnecessary for that particular composition.

```sim
task StableGathering (C : Config) : Verdict :=
  let robots := C.agents.filter present
  if robots.isEmpty then .failure
  else if robots.all (fun a => robots.all (fun b => a.pos = b.pos)) then .success
  else .inProgress

goal StableGathering := eventually always .success
```

This guarantees eventual permanent co-location, not explicit termination or absence of earlier separations. It may permit the gathered group to move together unless the algorithm or a separate claim rules that out.

### T2. Stable gathering of correct robots

**Use:** A general crash/Byzantine-task distinction motivated by P05/P06/P15. Correct robots can gather while faulty bodies remain elsewhere. It is not stand-up indulgent gathering at a crash location, and using it for P15 still requires the missing Byzantine/probabilistic semantics.

```sim
task SurvivorGathering (C : Config) : Verdict :=
  let robots := C.agents.filter correct
  if robots.isEmpty then .failure
  else if robots.all (fun a => robots.all (fun b => a.pos = b.pos)) then .success
  else .inProgress

goal SurvivorGathering := eventually always .success
```

### T3. Near gathering on one node or the ends of one edge

**Use:** P09/P11 dynamics-dependent task variants. The existential common edge matters: on a three-node ring, merely asking every pair of positions to be adjacent would wrongly accept occupation of all three nodes.

```sim
task NearGathering (C : Config) : Verdict :=
  let robots := C.agents.filter present
  if robots.isEmpty then .failure
  else if C.nodes.any (fun p => robots.all (fun a =>
    a.pos = p ∨ a.pos = target p .cw)) then .success
  else .inProgress

goal NearGathering := eventually always .success
```

Adjacency uses the underlying ring, even if that edge is absent this round. Explicit terminal detection, port locations and each paper's exact permanence requirement remain separate audit items.

### T4. Collision freedom

**Use:** General formation/exclusive exploration safety; P14/P19/P20 motivate later space-specific applications. This definition checks node co-location only. It does not detect edge crossings or collisions during continuous movement.

```sim
task CollisionFreedom (C : Config) : Verdict :=
  let robots := C.agents.filter present
  if robots.any (fun a => robots.any (fun b => a ≠ b ∧ a.pos = b.pos))
  then .failure else .success

goal CollisionFreedom := always ¬ .failure
```

Combining this with a liveness task requires E1's goal-composition work or separately checked claims. Do not replace gathering's target by collision freedom: they are different tasks.

### T5. Coverage with reported termination

**Use:** P03 and terminating exploration more generally. Requires `Monitors.Visited` and an algorithm output `done : Bool`. All correct robots eventually report done after coverage. The task does not by itself establish that no rule is enabled or prevent a done robot from moving.

```sim
task ReportedTerminatingExploration (C : Config) : Verdict :=
  let robots := C.agents.filter correct
  if robots.isEmpty then .failure
  else if C.nodes.all (fun p => C.world.visited.contains p) ∧ robots.all (fun a => a.done)
  then .success else .inProgress

goal ReportedTerminatingExploration := eventually always .success
```

The [P03 problem definition, §2.3](https://arxiv.org/html/1805.03965) requires a suffix with no enabled robots. Accordingly, label this as a reported-termination interface until an absorbing-done/disabledness invariant or E2's enabledness semantics establishes the stronger property. Do not count it alone as formalization of that theorem.

### T6. At least one safe black-hole identification

**Use:** P01/P10/P12 motivate a task distinct from the existing “every correct robot identifies” tasks. Requires the hazard's `site` field and outputs `claimDir : Option Move`, `claimSteps : Nat`. Directions are global under common chirality. Wrong reports fail immediately; eventually a surviving robot reports the correct site persistently at the system level.

```sim
task SomeIdentifyBlackHole (C : Config) : Verdict :=
  let robots := C.agents.filter correct
  if robots.isEmpty then .failure
  else if robots.any (fun a => a.claimDir.isSome ∧
    advance a.pos (a.claimDir.getD .stay) a.claimSteps ≠ C.world.site) then .failure
  else if robots.any (fun a => a.claimDir.isSome) then .success
  else .inProgress

goal SomeIdentifyBlackHole := eventually always .success
```

This is for a hole present initially. It does not allow transient incorrect suspicions, require explicit halting, make a report irreversible, or guarantee that one fixed robot is the permanent reporter. Those are separate obligations, particularly for P01's explicit/implicit variants. A report relative to a robot that moves also needs its direction/distance updated consistently.

### T7. Stable ring pattern formation

**Use:** General formation primitive using M2 and V3. The task recognizes the target up to the selected ring symmetries. Robot knowledge of the pattern, exact multiplicity assumptions and admissible initial configurations remain model choices.

```sim
task RingPatternFormation (C : Config) : Verdict :=
  let counts := C.nodes.map (fun p => C.agents.count (fun a => present a ∧ a.pos = p))
  if Views.canonicalRing counts C.world.patternMayReflect =
    Views.canonicalRing C.world.targetPattern C.world.patternMayReflect
  then .success else .inProgress

goal RingPatternFormation := eventually always .success
```

This recognizes a persistent shape, not an individually stationary assignment of robots. If termination or no collisions is required, add and verify those claims separately.

## 8. Current-core compatibility model family

### R1. Multi-sensor robots with explicit memory and frame capabilities

**Use:** P03/P05 need both their own light and a spatial view; P09/P10 can combine incident edges, communication and knowledge. Today's `obliviousRing` accepts one view; `blackHoleRing` adds only the optional size sensor. This earlier executable constructor demonstrates multi-sensor composition against today's core. Phase 0's `robots` supersedes it.

```sim
def ringRobots (views : List Sensor) (components : List Component := [])
    (memory : Memory := .oblivious) (topology : Topology := Ring)
    (frame : FrameModel := Frames.dynamicReflection) (round : Round := .fsync)
    (symmetries : Symmetries := .derived) : Model where
  topology := topology
  sensors := views
  components := components
  memory := memory
  frame := frame
  round := round
  symmetries := symmetries
```

Example composition, once S1/S4 are available:

```sim
def localLuminousRobots : Model :=
  ringRobots [ownLight, radiusColorCounts true]
    (components := [Vision.Radius, Storage.Lights 3])
    (round := .ssync)
```

Do not infer own-light visibility, known population, knowledge of N or private memory from a “luminous” label. Initial colors can use C1; fault components can be selected independently. Existing constructors can remain convenient compatible entry points.

## 9. Interfaces requiring more than a standard-library addition

These are part of the full proposal because several paper families need them. The `sim-design` blocks below are **future public interfaces, not accepted `.sim` code**. A signature without a body denotes a core primitive that cannot be implemented by today's component hooks. Implementing these requires coordinated language/IR, interpreter, explorer where relevant, Lean and conformance work; see [architecture.md](architecture.md) and [ir.md](ir.md).

### E1. Recurrence, conjunction and environment assumptions

**Use:** P03/P05 need repeated visits; P09/P11 need guarantees conditional on topology dynamics. Proposed recurrence task using M1:

```sim-design
task PerpetualExploration (C : Config) : Verdict :=
  if C.world.epochComplete then .success else .inProgress

goal PerpetualExploration := always eventually .success
```

`always eventually` is a new goal form. On a finite ring with the stated visit convention, infinitely many complete epochs imply that every node is visited infinitely often, and conversely. Add a proof of that monitor correspondence. Goal conjunction and admissibility assumptions should then permit recurrence plus safety, rather than silently dropping one obligation. An “eventually recurring edges” assumption must filter admissible executions; a component that merely chooses missing edges does not express it. Avoid inventing an `assume` syntax until its semantic contract is designed.

### E2. Actual terminality / enabledness

**Use:** P03's terminating exploration, P09's explicit termination and formation tasks. Needed interface:

```sim-design
def notEnabled (a : Agent) : Bool
task TerminatingExploration (C : Config) : Verdict :=
  if C.nodes.all (fun p => C.world.visited.contains p) ∧
    (C.agents.filter correct).all (fun a => notEnabled a)
  then .success else .inProgress
goal TerminatingExploration := eventually always .success
```

The sketch's `notEnabled` is a proposed specification-only builtin with implicit configuration context, not an ordinary value helper or algorithm sensor. It requires new evaluator support and a precise meaning: no enabled rule, an explicit halt state and a stationary transition are distinct concepts. A flag with `acts never` is not a safe shortcut for “terminated”: today any raised flag also changes `correct`.

### E3. ASYNC Look–Compute–Move

**Use:** P07/P08/P13/P17/P19. Proposed round primitive and a future composition:

```sim-design
def AsyncLCM : Round

def asynchronousRobots (space : Space) (observe : Observation) (frames : FrameEvolution)
    (views : List Sensor) (components : List Component := []) (movement : Movement) : Model :=
  robots space observe frames views
    (components := components) (movement := movement) (round := AsyncLCM)
```

The primitive must specify independent robot phases, stored snapshots/destinations, light updates, in-transit visibility, finite phase completion and fairness. An existing fair singleton scheduler executes a complete fresh-observation activation, so it is not an implementation of this interface. Different atomicity/transit policies may require parameters after model audits.

### E4. Topologies beyond rings

**Use:** P12/P13 tori, P14 grids, and line papers such as P02. These target space constructors use the common graph API introduced in Phase 0; each finite graph family should be library-authored rather than another kernel case. Infinite graph execution/enumeration remains additional work.

```sim-design
def Line : Space
def RectangularGrid (width : Nat) (height : Nat) : Space
def InfiniteGrid : Space
def Torus (rows : Nat) (columns : Nat) : Space
def DynamicTorus (rows : Nat) (columns : Nat) (missingPerRing : Nat) : Space
```

Specify node coordinates, moves, local observation structure and movement first. `Line` means an unbounded discrete line here; finite paths need a separately named constructor and boundary observations. P12's per-row/per-column dynamic constraints do not follow from a single global missing-edge budget. The `DynamicTorus` convenience constructor must compose its underlying graph with that explicit edge policy. Infinite spaces require a strategy beyond finite enumeration. Models compose through `robots`; ring helpers retain their cycle-specific meaning.

### E5. Exact geometry and geometric views

**Use:** P16/P17/P18/P19/P20. Proposed value-level interfaces, with missing types and arithmetic made explicit:

```sim-design
structure Point2 where
  x : Real
  y : Real

def Geometry.squaredDistance (a : Point2) (b : Point2) : Real :=
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)

def Geometry.collinear (a : Point2) (b : Point2) (c : Point2) : Bool :=
  (b.x - a.x) * (c.y - a.y) = (b.y - a.y) * (c.x - a.x)

def Plane : Space
def Circle : Space
```

`Real` and these spaces are not current types/constructors. Decide exact executable arithmetic or a justified abstraction before implementation; rationals do not cover every circle construction. Add visibility, occlusion and movement policies as separate contracts. The geometric observation correspondence declares whether it preserves distances, orientation, scale or other structure, from which admissible frames follow. Do not place absolute `Point2` coordinates in a sensor for disoriented robots. Phase 0 supplies the generic contracts and graph implementation; executable exact geometry remains a subsequent project.

### E6. Transit events, cross detection and movement history

**Use:** P09 and future dynamic-network/ASYNC papers. Proposed observation interfaces:

```sim-design
sensor crossingDetected (C : Config) (me : Agent) : Bool
```

Cross detection reports another robot crossing in the opposite direction during the relevant movement, available at the paper's specified subsequent observation. A generic component cannot read other components' flags/fields, inspect decisions directly after movement, retain a robot in a port or change the movement engine. A blocked `.cw` request becoming `.stay` does not implement port occupancy. This interface needs explicit movement events and ownership, not a sensor peeking at current-round future choices. M3 already provides the narrower last-displacement feedback with existing hooks. No bounded identity-tracking sensor should be added without the paper granting that capability.

### E7. Probability and full Byzantine behavior

**Use:** P15; general randomized LCM work. Proposed semantic interfaces:

```sim-design
def ProbabilisticLCM : Round
def Faults.Byzantine (budget : Nat) : Component
```

Specify probability distributions, scheduler/adversary information and timing, message equivocation, public/private state changes and movement powers. Algorithmic random choices cannot be represented by ordinary adversarial `choose`. Today's `acts adversary` changes only movement; it is not this Byzantine component. Design a shared API only after one concrete protocol establishes the required messages and adversary observation model.

## 10. Priority and implementation constraints

| Priority | Proposals | Reason |
| --- | --- | --- |
| Phase 0: foundation and existing users | [core-redesign.md](core-redesign.md): core spaces, observations, sensors, movement, library spaces and model families | Rewrites the core, std, Lean and consumers; brings back the starter and both public projects; adds a non-ring witness. Private projects are ported in their own repository. |
| Phase 1: first reusable additions | V1–V5 helpers, C1 (S1/S4 are part of Phase 0) | Immediate reuse in nearby gathering/exploration papers, using the new observation contracts. |
| Next | Generic S2/S3/S5/S6, C2/C3, F1/F2, M3, T1–T3/T5/T6 where not already required by migration | Extend the shared capability inventory after preserving current users. Phase 0 may pull an item forward when an audited existing model requires it. |
| Recurrence track | M1 + E1 | Necessary for claiming perpetual exploration rather than one-time coverage. |
| As needed | C4, F3/F4, M2, T4/T7 | General enough to justify shared definitions, but lower reuse confidence or extra representation/proof work. |
| Later semantic projects | E2/E3, further E4 constructors/infinite-space execution, E5–E7, environment admissibility in E1 | Multi-paper value beyond Phase 0's graph/observation foundation; not implementable by merely adding `.sim` files to std. |

Before promotion:

- Check exact observation information, initialization, phase timing and default values against at least two users, or document the general-purpose rationale.
- Validate positive palette/register sizes, coordinate and view domains, and initial-stock/color lengths in the experiments or a future component-contract mechanism. Do not silently change theorem assumptions to finite examples.
- Keep components' fields/actions disjoint. Crash alternatives, hazard alternatives with the same flag, and the two light stores are not automatically composable. Declaration order cannot make same-hook effects read one another's updates.
- Add bounded equivariance checks before adding `@[equivariant ...]` attributes. This draft deliberately declares none. C4's index-based state needs special treatment; other claims still need validation.
- Follow the existing [Lean limits](architecture.md#lean-guarantees-and-limits). Multiset operations, custom record sensors and node-list indexing are known constraints. Current-language compilation is not Lean compilation or a correctness proof. Do not hide an unsupported translation by replacing the model with a weaker one.
- Keep hand-written builder counterparts consistent, regenerate library Lean from its sources, and run the relevant checks in [development.md](development.md). Update the public library catalog/model-builder output contracts when promoted task outputs or core constructors require it.

## 11. Checks performed on this draft

The earlier 32 current-language code blocks were collected into a temporary source and checked through the current compiler in 18 sample experiment compositions. Each composition initialized and produced successors. Separate temporary behavioral checks covered the value helpers, own/external-light information, competing pebble pickups and stock conservation, simultaneous whiteboard writers, light updates during crashes, recurring versus stopped coverage, feedback retained through inactive rounds, and the three-node near-gathering edge case. These prototypes are retained as semantic references, not implementations of Phase 0.

The 15 existing shared-robot and conformance tests passed before the original draft. These checks establish executable examples for the current-language proposals, not conformance with every paper, Lean compilation, equivariance or correctness proofs. All `sim-design` interfaces, including the new foundation, remain unimplemented and are intentionally excluded from compilation. No standard-library, engine, language or Lean source was changed by writing or revising this proposal.

For the Phase 0 planning revision, 52 existing public regression tests passed across the starter, stand-up gathering, black-hole migration/presets, shared robots and conformance. Strict typechecking and the earlier prototype composition/behavior checks also passed. These establish the current baseline; they do not satisfy the future migration gates. The detailed private inventory was prepared separately, and its implementation checks remain pending.
