/**
 * Code shown in the guide. Complete files are compiled by `test/site.test.ts`;
 * fragments are excerpts of them or of the language reference.
 */

export const firstFile = `/-! Two agents look for a black hole on a cycle. Say here which paper,
algorithm and model this file encodes: the page shows it as the description. -/

import "std/models.sim"

/-- A cautious walk: agent 0 probes its clockwise neighbor and comes back; agent 1
waits, and claims the hole behind its clockwise port if agent 0 does not come back. -/
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
        if otherStates.isEmpty then
          pub := { pub with bh := some Port.cw }
          halt
        move Ring.cw

/-- The hole is present from the start, anywhere but on the agents' node. -/
experiment cautiousPair where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 9).filter (· ≥ 3)
  param site : Pos in ((range N).filter (· ≥ 1)).map pos
  agents := 2
  position i := pos 0
`;

export const models = `-- A hole that may appear at any time, a known size, one crash
blackHoleRobots (Graphs.Cycle N) .mayEmerge .known (extra := [Faults.CrashStop 1])

-- The same family on a dynamic cycle, in semi-synchronous rounds
blackHoleRobots (Graphs.Dynamic (Graphs.Cycle N) 1) .mayEmerge .unknown (round := .ssync)

-- Robots on the infinite line that see a radius-phi window, cannot tell left from
-- right, see which locations are occupied, and may crash on one node
robots Graphs.Line (Observe.radius phi) Frames.isomorphisms [occupied] (components := [Faults.CrashAt])`;

export const ownModel = `/-- The paper's model: name it once, use it in every experiment. -/
def lineModel (luminous : Bool := false) : Model :=
  robots Graphs.Line (Observe.radius (param phi)) Frames.isomorphisms
    (if luminous then [colors] else [occupied])
    (components := (if luminous then [Storage.Lights 2] else []) ++ [Faults.CrashAt])`;

export const pebbles = `/-! One agent marks its start with a pebble and walks until it finds the pebble
again: it then knows the size of the cycle. -/

import "std/models.sim"

algorithm MeasureCycle uses pebblesHere where
  Pub := { size : Option Nat }
  init i := { pub := { size := none } }

  /-- Walks clockwise until the pebble is under the agent. -/
  def walkToPebble :=
    let steps : Nat := 1
    move Ring.cw
    while pebblesHere = 0
      steps := steps + 1
      move Ring.cw
    pub := { pub with size := some steps }

  main :=
    stay with { pebble := .drop }
    walkToPebble
    halt with { pebble := .pick }

experiment measureCycle where
  model := blackHoleRobots (Graphs.Cycle N) .none .unknown (extra := [Storage.Pebbles])   -- no hole
  algorithm := MeasureCycle
  task := Gathering                                                                      -- trivial with one agent
  param N : Nat in (range 7).filter (· ≥ 3)
  param site : Pos in [pos 0]
  agents := 1
  position i := pos 0
`;

export const oblivious = `/-! An oblivious rule: robots keep no memory between rounds, and decide from what
they see now. An illustration of the style, not a correct gathering algorithm. -/

import "std/models.sim"

/-- The neighbors where some robot stands, in the order of the Look. -/
def occupiedNeighbors : List Loc :=
  (neighbors here).filter occupied

algorithm StepTowardsNeighbor uses occupied where
  main :=
    let next := occupiedNeighbors
    if next.isEmpty then
      move Ring.cw
    else
      move (next.at 0)

experiment stepTowardsNeighbor where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.isomorphisms [occupied]
  algorithm := StepTowardsNeighbor
  task := Gathering
  param N : Nat in [4, 5]
  agents := 2
  position i := pos (2 * i)
`;

export const stateMachine = `algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Nat }
  Mem := { pc : PC }
  init i := { pub := { id := i, bh := none }, mem := { pc := if i = 0 then .probe else .wait1 } }
  step mem pub :=
    match mem.pc with
    | .probe => { move := Ring.cw, mem := { pc := .back } }
    | .back => { move := Ring.ccw, mem := { pc := .advance } }
    | .wait1 => { move := here, mem := { pc := .wait2 } }
    ...`;

export const parameters = `param N : Nat in [3, 5, 7]                        -- an exact finite domain
param site : Pos in (range N).map pos             -- may depend on earlier parameters
param phi : Nat where phi ≥ 4                     -- a property only
param k : Nat in (range 10) where k % 2 = 1       -- both: a finite domain, refined
agents := N                                       -- as many agents as vertices
position i := pos (2 * i)                         -- agent i starts on vertex 2i
limits := { depth := 200, states := 100000 }      -- stop exploring beyond these`;

export const custom = `/-! A custom task, sensor and component, next to library pieces. -/

import "std/models.sim"

/-- Whether another robot stands on my node. -/
sensor notAlone (L : Look) : Bool :=
  (L.occupants L.here).any fun b => b ≠ L.me ∧ present b

/-- A robot on \`param trap\` may be caught there, for good. -/
@[equivariant]
def Hazards.Trap : Component where
  World := { trap : Pos }
  flags := [flag caught visible, acts never]
  init := { trap := param trap }
  afterMove C :=
    let S := choose (subsets (C.agents.filter fun a => correct a ∧ a.pos = C.world.trap))
      labels fun S => if S.isEmpty then "nobody caught" else "caught " ++ show S
    { raise caught := S }

/-- Every robot that was not caught is on one node. -/
@[equivariant]
task FreeGathering (C : Config) : Verdict :=
  let free := C.agents.filter correct
  if free.all fun a => free.all fun b => a.pos = b.pos then .success else .inProgress

goal FreeGathering := eventually .success

algorithm Wander uses notAlone where
  main :=
    if notAlone then stay else move Ring.cw

experiment trappedRobots where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [notAlone] (components := [Hazards.Trap])
  algorithm := Wander
  task := FreeGathering
  param N : Nat in [3, 4]
  param trap : Pos in (range N).map pos
  agents := 2
  position i := pos i
`;

export const commands = `npm create @bramas/simulant@latest my-project
cd my-project && npm install
npm run dev                               # the simulator page, reloaded on every save
npx simulant check-all -p my-experiment   # every setting, every execution
npx simulant lean --build                 # the Lean model, compiled with Lake`;

/** Complete files, compiled by the site's tests. */
export const completeFiles = { firstFile, pebbles, oblivious, custom };
