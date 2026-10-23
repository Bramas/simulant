import Simulant
import Simulant.Library.BlackHole
import Simulant.Library.CrashStop
import Simulant.Library.Pebbles
import Simulant.Library.FSync

/-! Generated from the IR of experiment `cautiousPairCrash` by packages/lean-gen. Do not edit:
regenerate it. Proofs go in a separate file. -/

set_option linter.unusedVariables false

namespace Examples.CautiousPairCrash
open Simulant

inductive PC where
  | probe
  | back
  | advance
  | wait1
  | wait2
  | check
  | halted
deriving DecidableEq, Repr, Inhabited

structure Pub where
  id : Nat
  bh : Option (Nat)
deriving DecidableEq, Repr

structure Mem where
  pc : PC
deriving DecidableEq, Repr

structure Rec0 where
  move : Nat
  mem : Mem
  pub : Pub
deriving DecidableEq, Repr

abbrev space (N : Nat) [NeZero N] : Space := Spaces.cycle N

structure Flags where
  dead : Bool
  crashed : Bool
deriving DecidableEq, Repr

instance : FlagSet Flags where
  none := { dead := false, crashed := false }
  merge f g := { dead := f.dead || g.dead, crashed := f.crashed || g.crashed }
  correct f := !(f.dead || f.crashed)
  present f := !(f.dead)
  acts f := if f.dead || f.crashed then .never else if false then .adversary else .algorithm

instance : LawfulFlagSet Flags where
  acts_merge_never f g := by
    obtain ⟨a0, a1⟩ := f
    obtain ⟨b0, b1⟩ := g
    cases a0 <;> cases a1 <;> cases b0 <;> cases b1 <;> decide

instance : Simulant.Library.BlackHole.Flags Flags where
  dead f := f.dead
  raise_dead := { (FlagSet.none : Flags) with dead := true }
  dead_raise := rfl
  dead_merge _ _ := rfl
  dead_none := rfl

instance : Simulant.Library.CrashStop.Flags Flags where
  crashed f := f.crashed
  raise_crashed := { (FlagSet.none : Flags) with crashed := true }
  crashed_raise := rfl
  crashed_merge _ _ := rfl
  crashed_none := rfl

instance : Simulant.Library.Pebbles.Flags Flags where

instance : Simulant.Library.FSync.Flags Flags where

structure Actions where
  pebble : Simulant.Library.Pebbles.PebbleAction
deriving DecidableEq, Repr

def act0 : Actions := { pebble := Simulant.Library.Pebbles.PebbleAction.none }

instance : Simulant.Library.BlackHole.Actions Actions where

instance : Simulant.Library.CrashStop.Actions Actions where

instance : Simulant.Library.Pebbles.Actions Actions where
  pebble a := a.pebble

instance : Simulant.Library.FSync.Actions Actions where

structure World (P : Type) where
  BlackHole : Simulant.Library.BlackHole.World P
  Pebbles : Simulant.Library.Pebbles.World P
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

def ctx_CrashStop (N : Nat) [NeZero N] (nAgents : Nat) : Simulant.Library.CrashStop.Ctx (sig N nAgents) where


def ctx_Pebbles (N : Nat) [NeZero N] (nAgents : Nat) : Simulant.Library.Pebbles.Ctx (sig N nAgents) where
  world := ⟨fun w => w.Pebbles, fun w x => { w with Pebbles := x }⟩

def ctx_FSync (N : Nat) [NeZero N] (nAgents : Nat) : Simulant.Library.FSync.Ctx (sig N nAgents) where


def port (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) (i : Nat) : Nat :=
  ((L.neighbors L.here)[i]!)

def «Ring.cw» (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) : Nat :=
  (port N nAgents L E 0)

def «Ring.ccw» (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) (E : Env) : Nat :=
  (port N nAgents L E 1)

def «Port.cw»  : Nat :=
  0

def sensor_otherStates (N : Nat) [NeZero N] (nAgents : Nat) (Lk : Look (sig N nAgents)) : ND (List (Pub)) := do
  (pure (((Lk.occupants Lk.here).filter (fun (b : Fin nAgents) => ((b != Lk.me) && (FlagSet.present Lk.config.agents[b].flags)))).map (fun (x0 : Fin nAgents) => Lk.config.agents[x0].pub)))

def env (N : Nat) [NeZero N] (nAgents : Nat) (L : Look (sig N nAgents)) : ND Env := do
  let otherStates ← sensor_otherStates N nAgents L
  pure { otherStates := otherStates }

def step (N : Nat) [NeZero N] (nAgents : Nat) (mem : Mem) (pub : Pub) (L : Look (sig N nAgents)) (E : Env) : Out (sig N nAgents) :=
  let d := (match mem.pc with
    | PC.probe => ({ move := («Ring.cw» N nAgents L E), mem := ({ pc := PC.back } : Mem), pub := pub } : Rec0)
    | PC.back => ({ move := («Ring.ccw» N nAgents L E), mem := ({ pc := PC.advance } : Mem), pub := pub } : Rec0)
    | PC.advance => ({ move := («Ring.cw» N nAgents L E), mem := ({ pc := PC.probe } : Mem), pub := pub } : Rec0)
    | PC.wait1 => ({ move := L.here, mem := ({ pc := PC.wait2 } : Mem), pub := pub } : Rec0)
    | PC.wait2 => ({ move := L.here, mem := ({ pc := PC.check } : Mem), pub := pub } : Rec0)
    | PC.check => (if (E.otherStates.any (fun (x0 : Pub) => (x0.id == 0))) then ({ move := («Ring.cw» N nAgents L E), mem := ({ pc := PC.wait1 } : Mem), pub := pub } : Rec0) else ({ move := L.here, pub := { pub with bh := (some («Port.cw» )) }, mem := ({ pc := PC.halted } : Mem) } : Rec0))
    | PC.halted => ({ move := L.here, pub := pub, mem := mem } : Rec0))
  { move := d.move, pub := d.pub, mem := d.mem, act := { pebble := Simulant.Library.Pebbles.PebbleAction.none } }

def model (N : Nat) [NeZero N] (nAgents : Nat) : Model (sig N nAgents) where
  tstates := [[]]
  components := [Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N nAgents),
    Simulant.Library.CrashStop.component 1 (ctx_CrashStop N nAgents),
    Simulant.Library.Pebbles.component  (ctx_Pebbles N nAgents)]
  radius := 1
  frames := .perLook [List.range (space N).maxDegree]
  scheduler := Simulant.Library.FSync.scheduler [[Instant.look, Instant.compute, Instant.move]] (ctx_FSync N nAgents)
  env := env N nAgents
  step := step N nAgents

def verdict (N : Nat) [NeZero N] (nAgents : Nat) (C : Config (sig N nAgents)) : Verdict :=
  (let alive := ((List.finRange nAgents).filter (fun (x0 : Fin nAgents) => (FlagSet.correct C.agents[x0].flags))); (if alive.isEmpty then Verdict.failure else (if (alive.all (fun (a : Fin nAgents) => ((((C.agents[a].pub).bh).isSome) && ((Space.follow (space N) C.agents[a].pos (C.agents[a].port (((C.agents[a].pub).bh).getD 0)) 1) == C.world.BlackHole.site)))) then Verdict.success else Verdict.inProgress)))

def line (mem : Mem) : Nat :=
  (match mem.pc with
    | PC.probe => 3
    | PC.back => 4
    | PC.advance => 5
    | PC.wait1 => 8
    | PC.wait2 => 9
    | PC.check => 10
    | PC.halted => 12)

def goal : Goal := .eventuallyAlways

instance (N : Nat) [NeZero N] (nAgents : Nat) : LawfulLens (ctx_BlackHole N nAgents).world := ⟨fun _ _ => rfl⟩

/-- The other components of the model preserve the part of the world that `BlackHole` owns. -/
theorem others_preserve_BlackHole (N : Nat) [NeZero N] (nAgents : Nat) :
    ∀ c ∈ (model N nAgents).components, c = Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N nAgents) ∨ c.Preserves (ctx_BlackHole N nAgents).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl | rfl | rfl
  · exact Or.inl rfl
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ _ fun _ _ => rfl)
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ _ fun _ _ => rfl)

/-- The scheduler preserves the part of the world that `BlackHole` owns. -/
theorem scheduler_preserves_BlackHole (N : Nat) [NeZero N] (nAgents : Nat) :
    (model N nAgents).scheduler.Preserves (ctx_BlackHole N nAgents).world.get :=
  SchedulerHooks.toScheduler_preserves _ _ _ _ _ _ fun _ _ => rfl

instance (N : Nat) [NeZero N] (nAgents : Nat) : LawfulLens (ctx_Pebbles N nAgents).world := ⟨fun _ _ => rfl⟩

/-- The other components of the model preserve the part of the world that `Pebbles` owns. -/
theorem others_preserve_Pebbles (N : Nat) [NeZero N] (nAgents : Nat) :
    ∀ c ∈ (model N nAgents).components, c = Simulant.Library.Pebbles.component  (ctx_Pebbles N nAgents) ∨ c.Preserves (ctx_Pebbles N nAgents).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl | rfl | rfl
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ _ fun _ _ => rfl)
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ _ fun _ _ => rfl)
  · exact Or.inl rfl

/-- The scheduler preserves the part of the world that `Pebbles` owns. -/
theorem scheduler_preserves_Pebbles (N : Nat) [NeZero N] (nAgents : Nat) :
    (model N nAgents).scheduler.Preserves (ctx_Pebbles N nAgents).world.get :=
  SchedulerHooks.toScheduler_preserves _ _ _ _ _ _ fun _ _ => rfl

def domain_N  : List (Nat) :=
  ((List.range 7).filter (fun (x0 : Nat) => (decide (x0 ≥ 3))))

def domain_site (N : Nat) [NeZero N] : List ((space N).Pos) :=
  (((List.range N).filter (fun (x0 : Nat) => (decide (x0 ≥ 1)))).map (fun (x0 : Nat) => (Spaces.cyclePos N x0)))

def count (N : Nat) [NeZero N] (site : (space N).Pos) : Nat := 2

def init (N : Nat) [NeZero N] (site : (space N).Pos) : ND (Config (sig N (count N site))) := do
  let w_BlackHole ← Simulant.Library.BlackHole.initWorld (S := (space N)) Simulant.Library.BlackHole.HolePolicy.mayEmerge site
  let w_Pebbles ← Simulant.Library.Pebbles.initWorld (S := (space N)) 
  pure {
    agents := Vector.ofFn fun j =>
      let i := j.val
      { pos := (Spaces.cyclePos N 0), frame := [], flags := FlagSet.none, fields := {  }, pub := ({ id := i, bh := (none : Option (Nat)) } : Pub), mem := ({ pc := (if (i == 0) then PC.probe else PC.wait1) } : Mem) },
    world := { BlackHole := w_BlackHole, Pebbles := w_Pebbles } }

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

end Examples.CautiousPairCrash
