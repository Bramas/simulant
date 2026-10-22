import Simulant
import Simulant.Library.BlackHole

/-! Generated from the IR of experiment `algo1` by packages/lean-gen. Do not edit:
regenerate it. Proofs go in a separate file. -/

set_option linter.unusedVariables false

namespace Examples.Algo1
open Simulant

inductive FourAgentEBSPC where
  | start
  | move1
  | move2
  | move3
  | stay1
  | move4
  | stay2
  | move5
  | stay3
  | move6
  | stay4
  | move7
  | move8
  | move9
  | move10
  | halt1
  | halt2
deriving DecidableEq, Repr, Inhabited

structure Pub where
  id : Nat
  bh : Option (Nat)
deriving DecidableEq, Repr

structure Mem where
  pc : FourAgentEBSPC
deriving DecidableEq, Repr

structure Rec0 where
  move : Nat
  pub : Pub
  mem : Mem
deriving DecidableEq, Repr

abbrev space (N : Nat) [NeZero N] : Space := Spaces.cycle N

structure Flags where
  dead : Bool
deriving DecidableEq, Repr

instance : FlagSet Flags where
  none := { dead := false }
  merge f g := { dead := f.dead || g.dead }
  correct f := !(f.dead)
  present f := !(f.dead)
  acts f := if f.dead then .never else if false then .adversary else .algorithm

instance : LawfulFlagSet Flags where
  acts_merge_never f g := by
    obtain ⟨a0⟩ := f
    obtain ⟨b0⟩ := g
    cases a0 <;> cases b0 <;> decide

instance : Simulant.Library.BlackHole.Flags Flags where
  dead f := f.dead
  raise_dead := { (FlagSet.none : Flags) with dead := true }
  dead_raise := rfl
  dead_merge _ _ := rfl
  dead_none := rfl

structure Actions where
deriving DecidableEq, Repr

def act0 : Actions := {  }

instance : Simulant.Library.BlackHole.Actions Actions where

structure World (P : Type) where
  BlackHole : Simulant.Library.BlackHole.World P
deriving DecidableEq, Repr

structure Fields (P : Type) where

deriving DecidableEq, Repr

/-- What the algorithm's sensors return in one Look. -/
structure Env where
  otherStates : List (Pub)

abbrev sig (N : Nat) [NeZero N] (nAgents : Nat) : Sig :=
  { S := (space N), k := nAgents, F := Flags, X := Fields (space N).Pos, P := Pub, M := Mem, A := Actions,
    W := World (space N).Pos, E := Env }

def ctx_BlackHole (N : Nat) [NeZero N] (nAgents : Nat) : Simulant.Library.BlackHole.Ctx (sig N nAgents) where
  world := ⟨fun w => w.BlackHole, fun w x => { w with BlackHole := x }⟩

def «Port.cw»  : Nat :=
  0

def port (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) (i : Nat) : Nat :=
  ((L.neighbors L.here)[i]!)

def «Ring.cw» (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) : Nat :=
  (port N nAgents L E 0)

def «Ring.ccw» (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) : Nat :=
  (port N nAgents L E 1)

def «Port.opposite» (p : Nat) : Nat :=
  (1 - p)

def sensor_otherStates (N : Nat) [NeZero N] (nAgents : Nat) (Lk : Look (sig N nAgents)) : ND (List (Pub)) := do
  (pure (((Lk.occupants Lk.here).filter (fun (b : Fin nAgents) => ((b != Lk.me) && (FlagSet.present Lk.config.agents[b].flags)))).map (fun (x0 : Fin nAgents) => Lk.config.agents[x0].pub)))

def env (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) : ND Env := do
  let otherStates ← sensor_otherStates N nAgents L
  pure { otherStates := otherStates }

def step (N : Nat) [NeZero N] (nAgents : Nat) (mem : Mem) (pub : Pub) (L : Look (sig N nAgents)) (E : Env) : Out (sig N nAgents) :=
  let d := (match mem.pc with
    | FourAgentEBSPC.start => (if ((pub.id == 0) || (pub.id == 1)) then ({ move := («Ring.cw» N nAgents L E), pub := pub, mem := ({ pc := FourAgentEBSPC.move1 } : Mem) } : Rec0) else ({ move := («Ring.ccw» N nAgents L E), pub := pub, mem := ({ pc := FourAgentEBSPC.move2 } : Mem) } : Rec0))
    | FourAgentEBSPC.move1 => (if (pub.id == 0) then ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move3 } : Mem) } : Rec0) else ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay1 } : Mem) } : Rec0))
    | FourAgentEBSPC.move2 => (if (pub.id == 2) then ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move4 } : Mem) } : Rec0) else ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay2 } : Mem) } : Rec0))
    | FourAgentEBSPC.move3 => ({ move := (port N nAgents L E («Port.opposite» («Port.cw» ))), pub := pub, mem := ({ pc := FourAgentEBSPC.move5 } : Mem) } : Rec0)
    | FourAgentEBSPC.stay1 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay3 } : Mem) } : Rec0)
    | FourAgentEBSPC.move4 => ({ move := (port N nAgents L E («Port.opposite» («Port.cw» ))), pub := pub, mem := ({ pc := FourAgentEBSPC.move6 } : Mem) } : Rec0)
    | FourAgentEBSPC.stay2 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay4 } : Mem) } : Rec0)
    | FourAgentEBSPC.move5 => ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move7 } : Mem) } : Rec0)
    | FourAgentEBSPC.stay3 => (if (!(E.otherStates.any (fun (x0 : Pub) => (x0.id == 0)))) then (let pub_v0 := { pub with bh := (some («Port.cw» )) }; ({ move := L.here, pub := pub_v0, mem := ({ pc := FourAgentEBSPC.halt1 } : Mem) } : Rec0)) else ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move8 } : Mem) } : Rec0))
    | FourAgentEBSPC.move6 => ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move9 } : Mem) } : Rec0)
    | FourAgentEBSPC.stay4 => (if (!(E.otherStates.any (fun (x0 : Pub) => (x0.id == 2)))) then (let pub_v1 := { pub with bh := (some («Port.cw» )) }; ({ move := L.here, pub := pub_v1, mem := ({ pc := FourAgentEBSPC.halt2 } : Mem) } : Rec0)) else ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move10 } : Mem) } : Rec0))
    | FourAgentEBSPC.move7 => ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move3 } : Mem) } : Rec0)
    | FourAgentEBSPC.move8 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay1 } : Mem) } : Rec0)
    | FourAgentEBSPC.move9 => ({ move := (port N nAgents L E («Port.cw» )), pub := pub, mem := ({ pc := FourAgentEBSPC.move4 } : Mem) } : Rec0)
    | FourAgentEBSPC.move10 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.stay2 } : Mem) } : Rec0)
    | FourAgentEBSPC.halt1 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.halt1 } : Mem) } : Rec0)
    | FourAgentEBSPC.halt2 => ({ move := L.here, pub := pub, mem := ({ pc := FourAgentEBSPC.halt2 } : Mem) } : Rec0))
  { move := d.move, pub := d.pub, mem := d.mem, act := {  } }

def model (N : Nat) [NeZero N] (nAgents : Nat) : Model (sig N nAgents) where
  tstates := [[]]
  components := [Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N nAgents)]
  radius := 1
  frames := .perLook [List.range (space N).maxDegree]
  round := .fsync
  env := env N nAgents
  step := step N nAgents

def verdict (N : Nat) [NeZero N] (nAgents : Nat) (C : Config (sig N nAgents)) : Verdict :=
  (let alive := ((List.finRange nAgents).filter (fun (x0 : Fin nAgents) => (FlagSet.correct C.agents[x0].flags))); (if alive.isEmpty then Verdict.failure else (if (!C.world.BlackHole.active) then Verdict.success else (if (alive.all (fun (a : Fin nAgents) => ((((C.agents[a].pub).bh).isSome) && ((Space.follow (space N) C.agents[a].pos (C.agents[a].port (((C.agents[a].pub).bh).getD 0)) 1) == C.world.BlackHole.site)))) then Verdict.success else Verdict.inProgress))))

def line (mem : Mem) : Nat :=
  (match mem.pc with
    | FourAgentEBSPC.start => 31
    | FourAgentEBSPC.move1 => 32
    | FourAgentEBSPC.move2 => 35
    | FourAgentEBSPC.move3 => 18
    | FourAgentEBSPC.stay1 => 23
    | FourAgentEBSPC.move4 => 18
    | FourAgentEBSPC.stay2 => 23
    | FourAgentEBSPC.move5 => 19
    | FourAgentEBSPC.stay3 => 24
    | FourAgentEBSPC.move6 => 19
    | FourAgentEBSPC.stay4 => 24
    | FourAgentEBSPC.move7 => 20
    | FourAgentEBSPC.move8 => 28
    | FourAgentEBSPC.move9 => 20
    | FourAgentEBSPC.move10 => 28
    | FourAgentEBSPC.halt1 => 27
    | FourAgentEBSPC.halt2 => 27)

def goal : Goal := .eventuallyAlways

instance (N : Nat) [NeZero N] (nAgents : Nat) : LawfulLens (ctx_BlackHole N nAgents).world := ⟨fun _ _ => rfl⟩

/-- The other components of the model preserve the part of the world that `BlackHole` owns. -/
theorem others_preserve_BlackHole (N : Nat) [NeZero N] (nAgents : Nat) :
    ∀ c ∈ (model N nAgents).components, c = Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N nAgents) ∨ c.Preserves (ctx_BlackHole N nAgents).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl
  · exact Or.inl rfl

def domain_N  : List (Nat) :=
  ((List.range 13).filter (fun (x0 : Nat) => (decide (x0 ≥ 5))))

def domain_site (N : Nat) [NeZero N] : List ((space N).Pos) :=
  ((space N).vertices.getD [])

def count (N : Nat) [NeZero N] (site : (space N).Pos) : Nat := 4

def init (N : Nat) [NeZero N] (site : (space N).Pos) : ND (Config (sig N (count N site))) := do
  let w_BlackHole ← Simulant.Library.BlackHole.initWorld (S := (space N)) Simulant.Library.BlackHole.HolePolicy.mayEmerge site
  pure {
    agents := Vector.ofFn fun j =>
      let i := j.val
      { pos := (Spaces.cyclePos N 0), frame := [], flags := FlagSet.none, fields := {  }, pub := ({ id := i, bh := (none : Option (Nat)) } : Pub), mem := ({ pc := FourAgentEBSPC.start } : Mem) },
    world := { BlackHole := w_BlackHole } }

/-- Every admissible execution, for every value of the parameters, satisfies the task. -/
def Statement : Prop :=
  ∀ (N : Nat) [NeZero N], N ∈ domain_N  →
  ∀ (site : (space N).Pos), site ∈ domain_site N →
    (model N (count N site)).Correct act0 (init N site) (verdict N (count N site)) goal

/-- Non-vacuity: an initial configuration exists, every reachable configuration has a successor,
and an admissible execution exists. -/
def NonVacuity : Prop :=
  ∀ (N : Nat) [NeZero N], N ∈ domain_N  →
  ∀ (site : (space N).Pos), site ∈ domain_site N →
    (model N (count N site)).HasInitial (init N site) ∧ (model N (count N site)).Total act0 (init N site) ∧ (model N (count N site)).HasExecution act0 (init N site)

end Examples.Algo1
