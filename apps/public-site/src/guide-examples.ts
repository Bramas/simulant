/**
 * Code shown in the guide. Complete files are compiled by `test/site.test.ts`;
 * fragments are excerpts of them or of the language reference.
 */

export const firstFile = `/-! Two agents look for a black hole on a ring. Say here which paper,
algorithm and model this file encodes: the page shows it as the description. -/

import "std/models.sim"
import "std/tasks.sim"

/-- A cautious walk: agent 0 probes the next node and comes back; agent 1
waits, and declares the hole clockwise if agent 0 does not come back. -/
algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Move }
  init i := { pub := { id := i, bh := none } }

  main :=
    if pub.id = 0 then
      repeat
        move .cw
        move .ccw
        move .cw
    else
      repeat
        stay
        stay
        if otherStates.isEmpty then
          pub := { pub with bh := some .cw }
          halt
        move .cw

/-- The hole is present from the start, anywhere but on the agents' node. -/
experiment cautiousPair where
  model := blackHoleRing .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 9).filter (· ≥ 3)
  param site : Node in ((range N).filter (· ≥ 1)).map node
  agents := 2
  position i := node 0
`;

export const models = `-- A hole that may appear at any time, a known ring size, one crash
blackHoleRing .mayEmerge .known (extra := [Faults.CrashStop 1])

-- The same family on a dynamic ring, in semi-synchronous rounds
blackHoleRing .mayEmerge .unknown (topology := DynamicRing 1) (round := .ssync)

-- Oblivious robots that see a radius-phi window and may crash on one node
obliviousRing (view := lineView) (components := [Vision.Radius, Faults.CrashAtNode])`;

export const ownModel = `/-- The paper's model: name it once, use it in every experiment. -/
def lineModel (luminous : Bool := false) : Model :=
  obliviousRing
    (view := if luminous then colorView else lineView)
    (components := [Vision.Radius] ++ (if luminous then [Storage.Lights 2] else []))`;

export const pebbles = `/-! One agent marks its start with a pebble and walks until it finds the pebble
again: it then knows the ring size. -/

import "std/models.sim"
import "std/tasks.sim"

algorithm MeasureRing uses pebblesHere where
  Pub := { size : Option Nat }
  init i := { pub := { size := none } }

  /-- Walks clockwise until the pebble is under the agent. -/
  def walkToPebble :=
    let steps : Nat := 1
    move .cw
    while pebblesHere = 0
      steps := steps + 1
      move .cw
    pub := { pub with size := some steps }

  main :=
    stay with { pebble := .drop }
    walkToPebble
    halt with { pebble := .pick }

experiment measureRing where
  model := blackHoleRing .none .unknown (extra := [Storage.Pebbles])   -- no hole: a plain ring
  algorithm := MeasureRing
  task := Gathering                                                      -- trivial with one agent
  param N : Nat in (range 7).filter (· ≥ 3)
  param site : Node in [node 0]
  agents := 1
  position i := node 0
`;

export const oblivious = `/-! An oblivious rule: robots keep no memory between rounds, and decide from what
they see now. An illustration of the style, not a correct gathering algorithm. -/

import "std/models.sim"
import "std/tasks.sim"

/-- Some robot is \`d\` nodes ahead, in the observed orientation. -/
def occupiedAt (v : List Bool) (d : Nat) : Bool :=
  d < v.length ∧ v.at d

algorithm StepTowardsNeighbor uses ringPresence where
  main :=
    let v := ringPresence
    if occupiedAt v 1 then
      move .cw
    else if occupiedAt v (v.length - 1) then
      stay
    else
      move .cw

experiment stepTowardsNeighbor where
  model := obliviousRing
  algorithm := StepTowardsNeighbor
  task := Gathering
  param N : Nat in [4, 5]
  agents := 2
  position i := node (2 * i)
`;

export const stateMachine = `algorithm CautiousPair uses otherStates where
  Pub := { id : Nat, bh : Option Move }
  Mem := { pc : PC }
  init i := { pub := { id := i, bh := none }, mem := { pc := if i = 0 then .probe else .wait1 } }
  step mem pub view :=
    match mem.pc with
    | .probe => { move := .cw, mem := { pc := .back } }
    | .back => { move := .ccw, mem := { pc := .advance } }
    ...`;

export const parameters = `param N : Nat in [3, 5, 7]                        -- an exact finite domain
param site : Node in (range N).map node           -- may depend on earlier parameters
param phi : Nat where phi ≥ 4                     -- a property only
param k : Nat in (range 10) where k % 2 = 1       -- both: a finite domain, refined
agents := param N                                 -- as many agents as nodes
position i := node (2 * i)                        -- agent i starts on node 2i
limits := { depth := 200, states := 100000 }      -- stop exploring beyond these`;

export const custom = `/-! A custom task, sensor and component, next to library pieces. -/

import "std/models.sim"
import "std/tasks.sim"

/-- Whether another robot stands on my node. -/
@[equivariant rotations reflections]
sensor notAlone (C : Config) (me : Agent) : Bool :=
  C.agents.any fun b => b ≠ me ∧ present b ∧ b.pos = me.pos

/-- A robot on \`param trap\` may be caught there, for good. -/
@[equivariant rotations reflections]
def Hazards.Trap : Component where
  World := { trap : Node }
  flags := [flag caught visible, acts never]
  init := { trap := param trap }
  afterMove C :=
    let S := choose (subsets (C.agents.filter fun a => correct a ∧ a.pos = C.world.trap))
      labels fun S => if S.isEmpty then "nobody caught" else "caught " ++ show S
    { raise caught := S }

/-- Every robot that was not caught is on one node. -/
@[equivariant rotations reflections]
task FreeGathering (C : Config) : Verdict :=
  let free := C.agents.filter correct
  if free.all fun a => free.all fun b => a.pos = b.pos then .success else .inProgress

goal FreeGathering := eventually .success

algorithm Wander uses notAlone where
  main :=
    if notAlone then stay else move .cw

experiment trappedRobots where
  model := obliviousRing (view := notAlone) (components := [Hazards.Trap])
  algorithm := Wander
  task := FreeGathering
  param N : Nat in [3, 4]
  param trap : Node in (range N).map node
  agents := 2
  position i := node i
`;

export const commands = `npm create @bramas/simulant@latest my-project
cd my-project && npm install
npm run dev                               # the simulator page, reloaded on every save
npx simulant check-all -p my-experiment   # every setting, every execution
npx simulant lean --build                 # the Lean model, compiled with Lake`;

/** Complete files, compiled by the site's tests. */
export const completeFiles = { firstFile, pebbles, oblivious, custom };
