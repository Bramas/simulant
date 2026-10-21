# Phase 0: core and standard-library redesign

Design document · 21 October 2026 · not implemented

Phase 0 replaces the ring-based semantic core with a generic one. The physical space is a graph or a Euclidean space. An agent observes the visible part of it through **opaque locations**, ordered by a hidden reference ordering and a **morphism** chosen by the adversary. Every sensor is a query about a location. Rings, lines, stars, grids and discs become library spaces built on the two core kinds, with helpers in `.sim` (named neighbors), TypeScript (drawing, fast paths) and Lean (closed forms and lemmas).

Simulant is in alpha, so Phase 0 keeps **no legacy definitions**. `Ring`, `DynamicRing`, `Frame`, `Move`, `offset`, `toGlobal`, the frame models and the ring-specific sensors are removed rather than adapted. The work proceeds package by package (section 9). The first milestone is that the starter, black-hole search and stand-up gathering projects run and check again. The [public-paper program](public-projects-roadmap.md) and the [capability catalog](stdlib-additions-proposal.md) build on this foundation.

Blocks tagged `sim-design` show the target language. Their syntax is a proposal, to be settled in step 0 of section 9; today's compiler does not accept them.

## 1. Concepts

| Concept | Meaning |
| --- | --- |
| Space | The physical world: a graph (`Graph`) or a Euclidean space (`Euclidean d`). Its positions have type `Pos`. Configurations, components and tasks use positions. A graph lists the neighbors of each vertex in order; that order is its port numbering. |
| Observation | What one agent sees at one Look: a finite **visible domain** of positions and its structure (the r-hop view, for a graph), plus the **sensors** that give information about it. |
| Location | An opaque handle `Loc` on one visible position, valid for one activation. The agent compares locations, orders them through `neighbors`, and queries sensors and movement with them. It never sees the position behind a location. |
| Morphism | The adversary's choice, among the declared set, of how the visible domain is presented to the agent. It decides the order of locations where the view is symmetric. |
| Frames | The declared morphism set and when it is chosen: at each Look, once per robot, or never (the identity). |
| Movement | Converts the algorithm's destination (a location on a graph, a local point in a Euclidean space) into a physical position, using the morphism of the same activation. |

Three rules carry the design:

1. **An algorithm sees locations, their order and sensor values, nothing else.** Locations cannot be stored: the typechecker forbids `Loc` in memory, public state, outputs and component fields, as it already forbids `Agent`. To remember a neighbor, an agent stores its index in `neighbors here`, which is a port number when the frames keep ports.
2. **Sensors are the only access to the physical snapshot.** A sensor receives the Look and, for per-location sensors, a location. Its result type cannot contain `Pos` or `Agent`, so physical positions and agent references cannot reach an algorithm.
3. **The model author declares only the morphisms.** The ordering that hides physical identities is part of the semantics (section 3), never written in a `.sim` file.

The visible domain decides which locations exist: which ones can be queried and moved to. Sensors decide what is known about them. A black-hole agent, for example, sees its two neighbors (so it can move to them), but its sensors report only about its own node. The size of the visible domain is itself information: a full view of a cycle reveals its size, and the model view says so.

## 2. Spaces

The core provides two kinds of spaces. Everything else is a `.sim` definition.

### Graphs

A graph space gives its vertex type and an ordered neighbor list for each vertex. The vertex type is `Nat`, `Int` or a structure of them. Positions wrap vertices (`pos v`), so a `Pos` is never confused with a number. Vertex sets may be infinite as long as every neighborhood is finite.

```sim-design
/-- The cycle C_n, n ≥ 3. Port 0 points clockwise, port 1 counterclockwise. -/
def Graphs.Cycle (n : Nat) : Space where
  Vertex := Nat
  vertices := range n
  neighbors v := [(v + 1) % n, (v + n - 1) % n]
  automorphisms := Cycle.dihedral n             -- optional fast path (section 7)

/-- The infinite discrete line. Port 0 points towards larger coordinates. -/
def Graphs.Line : Space where
  Vertex := Int
  neighbors v := [v + 1, v - 1]
  automorphisms := .translationsAndReflection   -- required: infinite spaces cannot be enumerated

/-- A star with a center and `k` leaves: the non-ring witness of Phase 0. -/
def Graphs.Star (k : Nat) : Space where
  Vertex := Nat
  vertices := range (k + 1)
  neighbors v := if v = 0 then (range k).map (· + 1) else [0]
```

Grids, tori and paths are defined the same way. A grid with a compass uses the port order N, E, S, W. Requiring n ≥ 3 for `Graphs.Cycle` replaces the old two-node ring; a two-node cycle with two parallel edges would be a separate multigraph space.

**Dynamic graphs** wrap a space with an edge policy. At the start of each round the adversary chooses the missing edges, as today's `DynamicRing k` does, and forgets them afterwards:

```sim-design
def Graphs.Dynamic (base : Space) (missing : Nat) : Space
```

### Euclidean spaces (interfaces only in Phase 0)

```sim-design
def Euclidean.Plane : Space                       -- core: Pos is a point of R²
def R2.UnitDisc : Space := Euclidean.Plane.restrict fun p => p.x * p.x + p.y * p.y ≤ 1
```

Locations are the distinct visible occupied points, plus the observer's own point. Section 6 covers local coordinates, frames and movement. Phase 0 defines these interfaces so that the graph implementation does not close them off. Exact arithmetic, infinite choice domains and exploration of Euclidean models come later.

### Experiment parameters in spaces

A space may depend on experiment parameters: `Graphs.Cycle N`, `Observe.radius phi`. Model definitions are compiled once, and the parameters in them are evaluated per setting, like initial values. In an experiment, `positions` denotes the positions of its space (finite spaces only). `check-all` shares a state graph between settings only when their instantiated models are equal: the space, observation, frames, movement, components with their arguments, and task, after parameters are substituted. Equal spaces are not enough: two settings on the same cycle with different visibility radii have different successors. Parameters that only set initial values (positions, a hole's site, a crash node) do not prevent sharing, because they are part of the state. Today's sharing by ring size is the special case where every other parameter is an initial value.

## 3. Observations, ordering and frames

```sim-design
Observe.full                          -- every position and every edge (finite spaces)
Observe.radius r                      -- the r-hop view: positions at distance ≤ r, and the edges
                                      -- with at least one endpoint at distance < r
```

The structure of the view is itself information, so it is part of what an observation grants. The model view states it next to the sensors. `Observe.radius r` gives what an agent learns by exploring r hops from its position. An edge between two positions at distance exactly r is not part of the view, because reaching it would take one more hop. This is the usual radius-r view of distributed computing, and it is not the induced subgraph. With radius 1, the view is `here` and its neighbors joined only to `here`. A triangle and a longer cycle therefore look the same, and so do any two vertices of the same degree. A black-hole agent learns only that it has two ports, which its movement already assumes. On a cycle with 2r ≥ n, the view closes into the whole cycle and reveals its size, as today's views do.

At each Look, the core computes the visible domain `V` around the observer, with its structure. The agent receives `V` as locations: `here`, `visible`, `neighbors l` and `distance a b` (within `V`). Every list of locations comes in one order. That order is the result of two steps.

**1. The reference ordering (semantics, not declared).** Every class of isomorphic views has one reference ordering of its positions. It is shared by all robots and all Looks. Two robots whose views are isomorphic therefore receive identical presentations. When the frames keep ports, the reference ordering also lists `neighbors here` in port order.

The ordering is attached to the class of the view, not to physical places. A fixed order per physical place would let a robot tell apart two places that look the same, and a single order shared by the whole graph leaks too. Example: the graph below is symmetric under the left–right mirror.

```text
a3 – a2 – x – a – c – b – y – b2 – b3
          |               |
          p               q
```

With radius-3 views, robots at `x` and `y` see views without symmetry, so the only morphism is the identity. Both robots see `c` and its neighbors `a` and `b`. A global order on `c`'s neighbors puts exactly one robot's side first, so the two robots could elect a leader, which the anonymous model must not allow. An ordering that depends only on the class of the view gives both robots the same answer.

**2. The morphism (declared).** Where the view is symmetric, the adversary chooses a morphism from the declared set and applies it after the reference ordering:

| Frames | Morphisms | Choices per Look | Today's equivalent |
| --- | --- | --- | --- |
| `Frames.isomorphisms` | isomorphisms of the visible domain that fix the observer, chosen at each Look | 2 on cycles and lines; k! at a star's center; (k−1)! at a leaf | `Frames.dynamicReflection` |
| `Frames.portPermutations .perLook` | the ports, seen through a permutation chosen at each Look | up to the degree's factorial | — |
| `Frames.portPermutations .perRobot` | the ports, seen through a permutation fixed per robot at initialization | 1 | `Frames.PersistentReflection` |
| `Frames.identity` | the ports as they are | 1 | `Frames.common` (chirality) |

Persistence needs a choice that means the same thing at every Look, whichever view the robot has. A permutation of port numbers has that property; an isomorphism of one particular view does not. So only port permutations can be `.perRobot`. On a cycle, a robot's fixed permutation is its own sense of direction, and `Frames.identity` gives every robot the same one. Port-labelled graphs and grids with a compass use `Frames.identity` as well.

`Frames.portPermutations` takes the set of permutations the adversary chooses from (`among`, all permutations by default):

```sim-design
Frames.portPermutations .perRobot                            -- any permutation of the port numbers
Frames.portPermutations .perRobot (among := .symmetries)     -- grid: each robot's own fixed compass
Frames.portPermutations .perRobot (among := Grid.rotations)  -- grid: own fixed compass, common handedness
Frames.portPermutations .perLook (among := .symmetries)      -- grid: a fresh unknown compass at each Look
```

`.symmetries` is the set of permutations of port numbers induced by automorphisms of the space. It requires consistent ports: every automorphism permutes the port numbers in the same way at every vertex. Cycles, lines, tori and infinite grids with ports N, E, S, W satisfy this, and the checker verifies it on the experiment's settings.

| `among` | Cycle | Grid |
| --- | --- | --- |
| all permutations | 2 | 24, including permutations that no rotation or mirror produces |
| `.symmetries` | 2 | 8: a real compass, possibly mirrored |
| `Grid.rotations` | — | 4: a compass with common handedness |

This differs from `Frames.isomorphisms`. On a grid with radius-1 views, the isomorphisms of a view allow all 24 orders of the four neighbors, because at radius 1 a robot without a compass cannot see the geometry. `Frames.portPermutations .perLook (among := .symmetries)` allows only 8, because the robot has a compass but cannot trust it from one Look to the next.

**Implementation in the simulator.** The interpreter uses the **physical identifier order** as its reference ordering: physical ids, sorted, then permuted by the morphism. This is simple and costs nothing. It satisfies the law on lines, on radius-1 views of cycles and under port-based frames. Elsewhere it can leak: in the example above, and on larger views of a cycle, where the order of a remote vertex's neighbor list reveals where the numbering wraps from n−1 to 0. The library helpers read only `neighbors here` and `distance`, so they do not depend on it. The model view and the CLI check output therefore warn, for models using `Frames.isomorphisms`, that an algorithm must not rely on the order of locations that are not symmetric. Lean takes the reference ordering as a parameter satisfying the law, so a proof holds for every valid ordering, and an algorithm that exploits the simulator's ordering will fail the Lean verification. Two improvements can come later: a space may supply a valid ordering as a fast path, as it can for its automorphisms, and a checker may rerun the explorer with a second valid ordering.

## 4. Sensors

A sensor receives the Look `L`. It can use:

- `L.me`, `L.here` and `L.visible`;
- `L.occupants l`, the agents at the position behind `l`, and `L.visibleAgents`, the agents in the whole visible domain;
- `L.position l`, only inside sensors;
- `L.world`, the world fields of the components;
- `L.edgePresent a b`, in dynamic spaces.

A per-location sensor depends on the location only through its argument, so every sensor works on every space:

```sim-design
/-- Is someone at this location? -/
sensor occupied (L : Look) (l : Loc) : Bool := (L.occupants l).any present

/-- How many agents are at this location (strong multiplicity). -/
sensor count (L : Look) (l : Loc) : Nat := (L.occupants l).count present

/-- Multiplicity detection only where I stand: 0, 1 or 2 (two or more). -/
sensor localMultiplicity (L : Look) (l : Loc) : Nat :=
  min (if l = L.here then 2 else 1) ((L.occupants l).count present)

/-- The colors present at this location, in palette order. Needs `Storage.Lights`. -/
sensor colors (L : Look) (l : Loc) : List Nat :=
  (range L.world.colorCount).filter fun c => (L.occupants l).any fun a => present a ∧ a.light = c

/-- My own light. -/
sensor ownLight (L : Look) : Nat := L.me.light

/-- Public states of the other agents on my node. -/
sensor otherStates (L : Look) : Multiset Pub :=
  ((L.occupants L.here).filter fun b => b ≠ L.me ∧ present b).map (·.pub)

/-- The pebbles on my node. Needs `Storage.Pebbles`. -/
sensor pebblesHere (L : Look) : Nat := L.world.pebbles.count (· = L.position L.here)

/-- Is the edge to this neighbor present this round? Dynamic spaces only. -/
sensor edgeTo (L : Look) (l : Loc) : Bool := L.edgePresent L.here l

/-- Knowledge of the size of a finite space. -/
sensor spaceSize (L : Look) : Nat := L.spaceSize
```

Restricting where a sensor answers is part of the sensor (`localMultiplicity`). Restricting the visible domain is part of the observation (`Observe.radius`).

**One sensor environment per Look.** Freezing the physical snapshot does not freeze a sensor's own choices. The adversary therefore makes those choices once per Look, for the whole view, and every query returns the answer they fix. Two queries of the same sensor at the same location agree. Choices that constrain several locations together, such as a total budget of hidden agents, stay consistent across all the locations queried. A sensor with choices separates a Look-level part, which holds all its choices, from a deterministic per-location part:

```sim-design
/-- The adversary may hide up to `k` agents of the whole view, once per Look. -/
sensor lossyOccupied (k : Nat) (L : Look) where
  hidden := choose (subsetsUpTo k (L.visibleAgents.filter present))
  at l := (L.occupants l).any fun a => present a ∧ !hidden.contains a
```

The engine evaluates the Look-level part at the first query and memoizes per-location answers. Both are optimizations of this semantics. `otherStatesLossy` becomes a sensor with only a Look-level part.

`ringPresence`, `ringCount`, `lineView` and `colorView` disappear: an algorithm obtains the same lists by mapping a sensor over locations (section 5).

## 5. Algorithms

An algorithm reads:

- `here : Loc`;
- `visible : List Loc`;
- `neighbors l : List Loc` (for any visible `l`);
- `distance a b : Nat`;
- its sensors, applied to locations (`occupied l`).

All lists come in the order of section 3. On a graph, `move l` goes to a visible location `l`. The movement model decides which destinations are allowed: `here` or one of its neighbors for `.alongEdges`. A missing dynamic edge leaves the agent in place. `stay`, `halt`, `wait`, `with { ... }`, structured procedures and the lowering to a state machine are unchanged.

A generic algorithm that runs on the star, a cycle or a grid:

```sim-design
/-- Dispersion on any graph: leave a crowded node for an empty neighbor. -/
algorithm Disperse uses count where
  main :=
    let free := (neighbors here).filter fun l => count l = 0
    if count here > 1 ∧ !free.isEmpty then move (free.at 0) else stay
```

At a star's center, the leaves are symmetric, so `free.at 0` is whichever empty leaf the adversary's morphism put first. Co-located robots can all be given the same choice, so under FSYNC three robots at the center can move to the same leaf, return together and repeat forever. Section 8 uses this as an expected counterexample.

**Named neighbors and ports** are one-line helpers over `neighbors here`, not part of any space:

```sim-design
def Ring.cw : Loc := (neighbors here).at 0      -- under Frames.isomorphisms: whichever side the morphism put first
def Ring.ccw : Loc := (neighbors here).at 1
def port (i : Nat) : Loc := (neighbors here).at i   -- under Frames.identity: the space's port i
```

Structural helpers use `distance` and `neighbors`, never a numbering convention. For example, `Line.window phi : List Loc` returns the visible locations ordered from one end to the other: the location at offset `k` is the one at distance `|k|` on the side of `(neighbors here).at 0` (for `k > 0`) or of `(neighbors here).at 1` (for `k < 0`).

The starter's cautious pair, on a cycle with chirality. The stored claim is a port index:

```sim-design
algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Nat }
  output claim := pub.bh
  init i := { pub := { id := i, bh := none } }

  main :=
    if pub.id = 0 then
      repeat
        move Ring.cw
        move Ring.ccw
        move Ring.cw
    else
      repeat
        stay
        stay
        if !(otherStates.length > 0) then
          pub := { pub with bh := some 0 }      -- port 0: clockwise
          halt
        move Ring.cw
```

Stand-up gathering keeps its rules, applied to the same lists as today, now built from locations:

```sim-design
algorithm TwoColors uses colors where
  main :=
    let v := paperView ((Line.window phi).map colors)
    let vm := mirrored v
    if colorXIn v then
      move Ring.cw
    else if colorXIn vm then
      move Ring.ccw
    ...
```

## 6. Movement, local coordinates and continuous spaces

The round keeps the morphism chosen at the Look for the whole activation. After Compute, the movement model receives that morphism, the decision's destination and its own adversary choices, and it returns the new position.

| Movement | Space | Destination | Adversary |
| --- | --- | --- | --- |
| `.alongEdges` | graphs | `here` or a neighbor | nothing; a missing dynamic edge leaves the agent in place |
| `.rigid` | Euclidean | a local point | nothing |
| `.nonRigid delta` | Euclidean | a local point | stops the agent anywhere after at least `delta` along the segment |

In Euclidean spaces, the sensor `localPosition (L) (l) : Point` gives a location's coordinates in the agent's frame. `move p` accepts any local point, and the movement model maps it back through the frame. The frames are transformation groups:

- **Disoriented robots:** rotations and reflections.
- **Chirality:** rotations only.
- **No common unit:** scaling as well.

Each group can be chosen at each Look, fixed per robot, or shared. The order of locations follows their local coordinates. Under ASYNC, the movement model will also receive the destination stored between phases; no other interface changes.

```sim-design
/-- Move to the center of gravity of the observed robots, in local coordinates. -/
algorithm ToCenter uses localPosition where
  main :=
    move (Geometry.centroid (visible.map localPosition))
```

Euclidean frames and non-rigid stops have infinite choice domains. Choice sites will therefore declare their domain:

- the simulator samples infinite domains;
- the explorer refuses an exhaustive check unless the domain is finite, for example through a canonical frame that leaves only the configuration's finite stabilizer to the adversary;
- Lean statements quantify over the whole domain.

None of this is needed for the graph milestone; the IR leaves room for it.

## 7. Components, tasks and global symmetry

**Components** own world fields, agent fields, flags and actions, as today. Two things change:

- **Fields can have type `Pos`.** Positions transform under global symmetries, so whiteboards, pebbles and marks no longer need node indices.
- **Hooks can update the component's own agent fields.** Lights become an agent field instead of a world list indexed by internal slots.

```sim-design
/-- Lights with a palette of `colors` colors, initially 0. `setLight := some c` requests c. -/
def Storage.Lights (colors : Nat) : Component where
  World := { colorCount : Nat }
  Agent := { light : Nat }
  actions := [action setLight : Option Nat := none]
  init := { colorCount := colors }
  init i := { light := 0 }
  beforeMove C :=
    { agents := fun a =>
        let c := (decisionOf a).setLight
        { light := if (decisionOf a).decided ∧ c.isSome ∧ c.getD 0 < colors then c.getD 0 else a.light } }

/-- A black hole at `param site`. -/
def Hazards.BlackHole (policy : HolePolicy) : Component where
  World := { site : Pos, active : Bool }
  flags := [flag dead hidden, acts never]
  init := { site := param site, active := policy = .initiallyPresent }
  afterMove C := ...                       -- unchanged

/-- Robots at `param crashNode` may crash after Compute, before moving. -/
def Faults.CrashAt : Component where
  World := { crashNode : Pos }
  ...
```

**Tasks** see the physical configuration: `a.pos`, `C.positions`, `C.world` and the algorithm's outputs. Most tasks need nothing else. A task that checks an answer given in the agent's own terms interprets it with the agent's kept frame. Two functions do this, under `Frames.identity` and `Frames.portPermutations .perRobot`:

- `C.resolve a i`: the neighbor of `a.pos` at the agent's port `i`;
- `C.follow a i k`: the position reached from `a.pos` by taking the agent's port `i` `k` times. On a cycle, this is `k` steps in one direction.

Both are errors under per-Look frames, where a local port has no lasting meaning.

```sim-design
task IdentifyBlackHole (C : Config) : Verdict :=
  let alive := C.agents.filter correct
  if alive.isEmpty then .failure
  else if alive.all fun a => a.claim.isSome ∧ C.resolve a (a.claim.getD 0) = C.world.site then .success
  else .inProgress

task IdentifyEmergingBlackHoleAt (C : Config) : Verdict :=
  let alive := C.agents.filter correct
  if alive.isEmpty then .failure
  else if !C.world.active then .success
  else if alive.all fun a => a.claimPort.isSome ∧ C.follow a (a.claimPort.getD 0) a.claimSteps = C.world.site then .success
  else .inProgress
```

**Global symmetry reduction** merges configurations related by an automorphism of the space. It is derived from the model, not declared separately. An automorphism is kept only if it preserves the whole semantics:

- its action maps the admissible frame choices, and their evolution, onto themselves;
- components and the task are equivariant under it, as their `@[equivariant]` claims state.

An automorphism `g` induces a permutation `ρ` of port numbers on spaces with consistent ports. A robot's kept permutation `p` becomes `p` composed with `ρ`, which must still be allowed:

| Frames | Kept automorphisms |
| --- | --- |
| `Frames.isomorphisms` | all automorphisms of the space |
| `Frames.identity` | those that preserve the ports (rotations only, on a chiral cycle) |
| `Frames.portPermutations (among := S)` | those whose `ρ` belongs to `S`. With all permutations or `.symmetries`, every automorphism. With `Grid.rotations`, only translations and rotations: a reflection would turn a robot's rotated compass into a mirrored one, outside the permitted set. |

In the simulator, the physical-id reference ordering is not invariant under automorphisms. Reduction is therefore exact only for algorithms that do not rely on the order of non-symmetric locations, which is the condition of the warning in section 3. The conformance suite's comparison of reduced and unreduced explorations detects violations on its fixtures.

The automorphism acts on every `Pos` value in the state and on the robots' kept permutations. The core computes the group of a finite graph. A space can give a fast path (`Cycle.dihedral`); tests check it against the computed group on small sizes. Infinite spaces must give their group: translations and reflection on the line. On the infinite line, quotienting by translations is what keeps the reachable state space finite when agents stay within a bounded spread. Components and tasks still declare equivariance (`@[equivariant]`, now meaning "under the space's automorphisms"). Bounded tests check those claims, and the conformance suite compares reduced and unreduced explorations. `symmetries := .none` remains available.

## 8. Model families and experiments

```sim-design
/-- The base of every model family: no capability is granted implicitly. -/
def robots (space : Space) (observe : Observation) (frames : Frames)
    (views : List Sensor) (components : List Component := [])
    (memory : Memory := .oblivious) (movement : Movement := .alongEdges)
    (round : Round := .fsync) (symmetries : Symmetries := .derived) : Model where
  space := space
  observation := observe
  frames := frames
  sensors := views
  components := components
  memory := memory
  movement := movement
  round := round
  symmetries := symmetries

/-- Black-hole search: agents with chirality that see co-located agents' states. -/
def blackHoleRobots (space : Space) (policy : HolePolicy) (size : SizeKnowledge)
    (extra : List Component := []) (round : Round := .fsync) : Model :=
  robots space (Observe.radius 1) Frames.identity
    ([otherStates] ++ (if size = .known then [spaceSize] else []))
    (components := [Hazards.BlackHole policy] ++ extra) (memory := .persistent) (round := round)
```

The starter:

```sim-design
experiment cautiousPair where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 9).filter (· ≥ 3)
  param site : Pos in positions.filter (· ≠ pos 0)
  agents := 2
  position i := pos 0
```

Stand-up gathering on the actual infinite line, without the padded-ring encoding:

```sim-design
def lineModel (luminous : Bool := false) : Model :=
  robots Graphs.Line (Observe.radius phi) Frames.isomorphisms
    (if luminous then [colors] else [occupied])
    (components := (if luminous then [Storage.Lights 2] else []) ++ [Faults.CrashAt])

experiment twoColors where
  model := lineModel true
  algorithm := TwoColors
  task := Gathering
  param positions : List Int where admissiblePositions positions false
  param phi : Nat where phi ≥ requiredVisibility positions 0
  param crashNode : Pos
  agents := positions.length
  position i := pos (positions.at i)
  limits := { depth := 100, states := 20000 }
```

The non-ring witnesses on the star. The first must succeed:

```sim-design
/-- Robots on leaves move to the center; robots at the center stay. -/
algorithm ToHub uses occupied where
  main :=
    if (neighbors here).length = 1 then move ((neighbors here).at 0) else stay

experiment starGathering where
  model := robots (Graphs.Star k) (Observe.radius 1) Frames.isomorphisms [occupied]
  algorithm := ToHub
  task := Gathering
  param k : Nat in [2, 3, 4]
  param start : List Nat where start.length = 3 ∧ start.all (· ≤ k)
  agents := 3
  position i := pos (start.at i)
```

The second is an expected counterexample, with a new `Dispersion` task (eventually at most one robot per node, forever). The check must find the lasso described in section 5, which shows that each robot's morphism is chosen independently at a branching vertex:

```sim-design
experiment starDispersion where
  model := robots (Graphs.Star k) (Observe.radius 1) Frames.isomorphisms [count]
  algorithm := Disperse
  task := Dispersion
  param k : Nat in [2, 3, 4]
  agents := 3
  position i := pos 0
```

Other compositions:

- **Dynamic black-hole search:** `blackHoleRobots (Graphs.Dynamic (Graphs.Cycle N) 1) ...`, with `edgeTo` when the paper grants it.
- **Full-view ring gathering:** `robots (Graphs.Cycle N) Observe.full Frames.isomorphisms [occupied]`.
- **Strong multiplicity:** replace `occupied` with `count`.
- **A persistent orientation per robot:** `Frames.portPermutations .perRobot` on a cycle; `Frames.portPermutations .perRobot (among := .symmetries)` on a grid.

## 9. Steps

Each step ends with its package's tests passing. The legacy code is deleted as each package is rewritten, so step 0 records what the rewritten projects must reproduce.

| Step | Work | Done when |
| --- | --- | --- |
| 0. Baselines and target sources | Export normalized baselines from the current code: verdicts per setting, counterexample lengths, reachable configuration counts up to symmetry, and the stand-up rules' decisions on exhaustive small views. Write the target `.sim` sources (stdlib; starter; black-hole `algo0`–`algo6`; the three stand-up simulations; the two star witnesses) and review them against sections 2–8. Settle the open syntax. Inventory the private projects in their own repository. | Baselines are committed as fixtures; the target sources and this document agree; the open questions below have answers. |
| 1. Language (`packages/lang`) | Parser, elaboration, typechecker and IR for spaces, observations, frames, movement, `Loc`, `Pos`, Look sensors, per-location sensors, agent-field updates and parameters in model arguments. Remove the ring constructs. Bump the IR version; rewrite `docs/ir.md`, `docs/sim-language.md` and the builder in `packages/lang/src/builder.ts`. | The step 0 target sources typecheck. Typechecker tests cover `Loc` being round-local and sensor results excluding `Pos` and `Agent`. |
| 2. Engine (`packages/engine`) | Generic graph spaces (finite, infinite, dynamic); Look snapshots, with the identity reference ordering and the declared morphisms; movement; the round; global symmetry (computed for finite graphs; cycle and translation fast paths with differential tests). New conformance fixtures with independent builder counterparts in `packages/stdlib/test/helpers/`. | Conformance passes on cycle, line, star and dynamic-cycle fixtures, including the expected star counterexample. Reduced and unreduced graphs agree. Fast paths agree with the computed groups on bounded instances. |
| 3. Standard library (`packages/stdlib/sim`) | Spaces, helpers, sensors, components, tasks and model families from sections 2–8. | Library tests pass. |
| 4. Projects and CLI | Port the starter, black-hole search and stand-up gathering to the target sources. Update `packages/cli`: discovery, `check-all`, graph sharing by space, and the warning of section 3. Compare with the step 0 baselines. Re-record black-hole presets and saved executions in the new format; saved links from earlier versions are not kept. | **Milestone: the projects check again.** Verdicts and counterexample lengths match the baselines for every setting. Configuration counts match for the cycle models. Stand-up decisions match on every recorded view. Any difference on the line (now without padding) is explained and recorded. |
| 5. Simulator UI (`packages/simulator-ui`) | Snapshot types; renderers (cycle, line, generic graph); algorithm explanations showing locations and sensor values; the model view's facts (space, observation, frames, movement) and its warning. | **Milestone: the project pages run.** Page builds and browser acceptance pass. |
| 6. Lean (`lean/Simulant`, `packages/lean-gen`) | Generic core: `Space` (positions with decidable equality, neighbor lists, finite visible domains); the reference ordering as a parameter satisfying the law; morphisms as an `ND` choice; the round and executions. Library spaces with closed forms and automorphism lemmas (`Cycle`, `Line`). Generator, regenerated library and example models, differential tests with the identity ordering, and the existing proofs ported (cautious-pair invariant, rotation equivariance). No Mathlib. | Lean-backed tests pass, and the proof checks accept the ported proofs. |
| 7. Remaining consumers and documentation | Language service and editor extension; public site (library reference, builder, guide); `create-simulant` template; `docs/architecture.md` and `docs/development.md`; release notes for a breaking release. Port the private projects in their repository. | The full verification in `docs/development.md` passes. Private compatibility is recorded in the private repository. |

Lean export is unavailable between steps 1 and 6. Record this under "Known issues" in `docs/development.md` for that period.

### Open questions for step 0

Proposed answers, written with the target sources in [`docs/phase0-target/`](phase0-target/README.md) and the baselines in [`tests/fixtures/phase0-baselines/`](../tests/fixtures/phase0-baselines/README.md). The inventory of the private projects remains to be done in their own repository.

**Syntax of spaces and of helpers that read `here`.** Spaces are `def … : Space where` declarations, like components and models. Their fields are `Vertex`, `vertices` (omitted for an infinite vertex set), `neighbors` and an optional `automorphisms` fast path, required when `vertices` is omitted ([`spaces.sim-design`](phase0-target/stdlib/spaces.sim-design)). A separate `space` keyword would add a declaration form without adding anything a typed `def` cannot say. Helpers stay plain `def`s. A definition that reads `here`, `visible`, `neighbors`, `distance` or a sensor is *algorithm-local*:

- it is evaluated in the calling agent's Look;
- it can be called only from algorithms and other algorithm-local definitions;
- every sensor it reads must be one that the calling algorithm `uses`, checked transitively at the call;
- it may return `Loc` values, which the caller cannot store.

The typechecker infers this from the body, so `def Ring.cw : Loc := port 0` and `def lineView : List Nat := Line.window.map fun l => if occupied l then 1 else 0` need no keyword ([`helpers.sim-design`](phase0-target/stdlib/helpers.sim-design)). Sensors can be passed where a function is expected (`Line.window.map colors`), as `visible.map localPosition` does in section 6. A per-location sensor with choices is written

```sim-design
sensor lossyOccupied (k : Nat) (L : Look) where
  hidden := choose …              -- Look-level part, once per Look
  at (l : Loc) : Bool := …        -- per location, deterministic
```

A sensor without a location is already evaluated once per Look, so `otherStatesLossy` keeps the ordinary `:=` form ([`sensors.sim-design`](phase0-target/stdlib/sensors.sim-design)). Model-level definitions read experiment parameters as `param phi`, as components already do (`Observe.radius (param phi)` in `lineModel`); experiment bodies name them directly (`Graphs.Cycle N`).

**The reference-ordering law in Lean.** "Identical presentations" must mean identical *presented structure*, not identical lists of positions: a view with a nontrivial automorphism g would otherwise force the list to equal its image under g. A presentation of the view of `o` is a list `ord o` enumerating its visible domain `V(o)` without repetition; its index structure `present ord o` transports the view onto indices: the observer's index, the edges of the r-hop view, and the port list at `here` when the frames keep ports. The law is:

```lean
structure Lawful (ord : (o : S.Pos) → List S.Pos) : Prop where
  enumerates : ∀ o, (ord o).Perm (S.visible r o)
  canonical  : ∀ o o', S.ViewIso keepPorts o o' → present ord o = present ord o'
```

Here `ViewIso keepPorts` is an isomorphism of the r-hop views that maps observer to observer and, when the frames keep ports, preserves the port numbering at the observer. A lawful ordering is a canonical labelling of views, and the morphism then permutes indices by an automorphism of the presented structure. The generator makes `ord` a parameter of the round. `Statement` quantifies over every `ord` with `Lawful ord`. Differential tests instantiate it with the simulator's physical-id ordering, `(S.visible r o).mergeSort` on a `LinearOrder` that the space supplies for its vertices, and only evaluate it: the round never uses `Lawful`, so the comparison needs no proof that the instance is lawful, which it is not in general. Lemmas that this ordering is lawful on lines, on radius-1 views of cycles and under port-based frames let proofs about those models reuse it.

**Do `C.resolve` and `C.follow` cover the black-hole tasks?** Yes. `IdentifyBlackHole` and `IdentifyEmergingBlackHole` interpret `claim : Option Nat` with `C.resolve`; `IdentifyEmergingBlackHoleAt` interprets `claimPort` and `claimSteps` with `C.follow`. That covers `algo0`, `algo4` (port and distance), `algo5` (always the clockwise port, at a distance computed from its own node count) and the 2-node cycle ([`tasks.sim-design`](phase0-target/stdlib/tasks.sim-design)). `C.resolve a i` is `C.follow a i 1`, kept as the readable form. `C.follow` takes the agent's port i at every vertex it passes, which means "keep going" only on spaces with consistent ports; the documentation should say so. Out of range, both return the last position reached, as a missing port leaves an agent in place. `IdentifyEmergingBlackHole` (claims next to the node), absent from section 7, is ported too. The private projects must be checked against this in their inventory.

**Normalization of the baselines.** The baselines store no configurations, only verdicts, counterexample lengths, counts and decisions, so multiset order never enters them. Counts are over canonical keys: sorted anonymous agents under FSYNC, agent identities kept under SSYNC (`algo6Async`), as the target must also do. Settings keep today's coordinates: node i of `Ring N` is vertex i of `Graphs.Cycle N`, and `.cw` is port 0 under `Frames.identity`. The derived groups agree (rotations for common chirality and for `Frames.identity`), so cycle counts must match exactly. The stand-up models also record their reachable configurations up to translations and the reflection of the line, with lights read per agent rather than per internal slot (`reachableLineOrbits`). That is what the target stores on `Graphs.Line`, and step 4 compares against it. A `failure` counterexample is a shortest path and must match in length. A lasso's reported length depends on how the explorer numbers states, so the baselines add a canonical `minStem`: the smallest depth of a state on a bad strongly connected component. Step 4 compares the verdict, the kind and `minStem`. Stand-up decisions are recorded relative to the view (towards larger or smaller indices of the window), which does not depend on the morphism. The details are in the baselines' README.

**Changes to sections 2–8 found while writing the target sources.**

1. *Two-node cycles are needed.* `algo0` is the paper's small-ring algorithm and checks N = 2, and `algo5Sync` checks that the n-agent algorithm fails on N = 2. Section 2's n ≥ 3 would drop these settings. Proposal: neighbor lists may repeat a vertex (multigraph ports), and `Graphs.Cycle n` accepts n ≥ 2, its two ports leading to the same vertex when n = 2. Consequences:
   - `neighbors l` may list a location twice;
   - r-hop views keep parallel edges;
   - an automorphism acts on ports as well as vertices (the reflection of C₂ fixes both vertices and swaps the ports), so ρ is part of the automorphism rather than derived from the vertex map.

   The alternative, a separate multigraph space for this one size, would duplicate the cycle's helpers and fast paths.
2. *Algorithms cannot read parameters,* since parameters reach only the model and the initial values, and graph sharing relies on that. `Line.window phi` (section 5) therefore becomes `Line.window`, whose radius is read from the view itself: (|visible| − 1) / 2 on `Graphs.Line`.
3. *Indexing a list of locations needs a default.* `(neighbors here).at i` beyond the degree, as in `port 1` at a star's leaf, returns `here`. A move to a missing port then stays, as a move through a missing dynamic edge does. Lean uses the same default (`getD here`), so the interpreter and the generated model agree.
4. *`@[equivariant]` is relative to the frames.* A task that reads a claimed port through `C.resolve` is not equivariant under a reflection of the cycle when the claim is not transformed with it. It is equivariant under every automorphism the frames keep, since the automorphism also acts on the robots' kept permutations. `@[equivariant]` should therefore mean "under the automorphisms that the model's frames keep" (section 7 says "under the space's automorphisms"). Today's `@[equivariant rotations]` on the black-hole tasks becomes `@[equivariant]`.
5. *`Pos` is opaque outside experiments and spaces.* Sensors, components and tasks compare, store and pass positions, but cannot unwrap them, or a sensor could leak a vertex number in a `Nat`. Everything they compute is then equivariant by construction, and claims remain only for code that a later phase lets unwrap positions. Phase 0 keeps the claims on components and tasks, as section 7 says. In settings, saved links and `checkSettings`, a `Pos` parameter is written as its vertex (`site: 3`).
6. *`blackHoleRobots` keeps a `view` argument* (default `otherStates`), as `blackHoleRing` has today, so that a lossy view that implements `otherStates` can replace it.
7. *Names.* The library sensor `occupied` takes the name of a stand-up helper, renamed `occupiedAt`. The light action is `setLight`, because `light` is the agent field. Outputs giving a port are `claim` and `claimPort`, and `ringSize` becomes `spaceSize`. `Port.cw`, `Port.ccw` and `Port.opposite` name stored port numbers, and `Ring.cw`/`Ring.ccw` name locations. On the line, `Ring.cw` reads oddly; a `Line.forward` alias would read better.
8. *Stand-up experiments lose `N`, `fitsLine` and `LineDomain`.* Graph sharing then groups settings with equal `phi` only, because `Observe.radius phi` is part of the instantiated model. The renderer centers the line on the robots instead of reading the initial positions from the world.
9. *The star witness's domain is finite.* `starGathering` lists every triple of vertices as its domain of `start`, so `check-all` enumerates it without project settings.
