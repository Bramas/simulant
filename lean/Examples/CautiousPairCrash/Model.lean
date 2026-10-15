import Simulant
import Simulant.Library.BlackHole
import Simulant.Library.CrashStop
import Simulant.Library.Pebbles

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
  bh : Option (Move)
deriving DecidableEq, Repr

structure Mem where
  pc : PC
deriving DecidableEq, Repr

structure View where
  otherStates : List (Pub)
deriving DecidableEq, Repr

structure Rec0 where
  move : Move
  mem : Mem
  pub : Pub
deriving DecidableEq, Repr

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

structure Actions where
  pebble : Simulant.Library.Pebbles.PebbleAction
deriving DecidableEq, Repr

def act0 : Actions := { pebble := Simulant.Library.Pebbles.PebbleAction.none }

instance : Simulant.Library.BlackHole.Actions Actions where

instance : Simulant.Library.CrashStop.Actions Actions where

instance : Simulant.Library.Pebbles.Actions Actions where
  pebble a := a.pebble

structure World (N : Nat) where
  BlackHole : Simulant.Library.BlackHole.World N
  Pebbles : Simulant.Library.Pebbles.World N
deriving DecidableEq, Repr

structure Fields (N : Nat) where

deriving DecidableEq, Repr

abbrev sig (N k : Nat) : Sig :=
  { N := N, k := k, F := Flags, X := Fields N, P := Pub, M := Mem, A := Actions, W := World N, V := View }

def ctx_BlackHole (N k : Nat) : Simulant.Library.BlackHole.Ctx (sig N k) where
  world := ⟨fun w => w.BlackHole, fun w x => { w with BlackHole := x }⟩

def ctx_CrashStop (N k : Nat) : Simulant.Library.CrashStop.Ctx (sig N k) where


def ctx_Pebbles (N k : Nat) : Simulant.Library.Pebbles.Ctx (sig N k) where
  world := ⟨fun w => w.Pebbles, fun w x => { w with Pebbles := x }⟩

section
variable (N k : Nat)

def sensor_otherStates (ts : TState) (C : Config (sig N k)) (me : Fin k) (frame : Bool) : ND (List (Pub)) :=
  (pure (((List.finRange k).filter (fun (b : Fin k) => ((b != me) && (FlagSet.present C.agents[b].flags) && ((C.agents[b].pos) == (C.agents[me].pos))))).map (fun (x0 : Fin k) => C.agents[x0].pub)))

def view (ts : TState) (C : Config (sig N k)) (me : Fin k) (frame : Bool) : ND View := do
  let otherStates ← sensor_otherStates N k ts C me frame
  pure { otherStates := otherStates }

def step (mem : Mem) (pub : Pub) (view : View) : Out (sig N k) :=
  let d := (match mem.pc with
    | PC.probe => ({ move := Move.cw, mem := ({ pc := PC.back } : Mem), pub := pub } : Rec0)
    | PC.back => ({ move := Move.ccw, mem := ({ pc := PC.advance } : Mem), pub := pub } : Rec0)
    | PC.advance => ({ move := Move.cw, mem := ({ pc := PC.probe } : Mem), pub := pub } : Rec0)
    | PC.wait1 => ({ move := Move.stay, mem := ({ pc := PC.wait2 } : Mem), pub := pub } : Rec0)
    | PC.wait2 => ({ move := Move.stay, mem := ({ pc := PC.check } : Mem), pub := pub } : Rec0)
    | PC.check => (if (view.otherStates.any (fun (x0 : Pub) => (x0.id == 0))) then ({ move := Move.cw, mem := ({ pc := PC.wait1 } : Mem), pub := pub } : Rec0) else ({ move := Move.stay, pub := { pub with bh := (some Move.cw) }, mem := ({ pc := PC.halted } : Mem) } : Rec0))
    | PC.halted => ({ move := Move.stay, pub := pub, mem := mem } : Rec0))
  { move := d.move, pub := d.pub, mem := d.mem, act := { pebble := Simulant.Library.Pebbles.PebbleAction.none } }

def model : Model (sig N k) where
  tstates := Ring.staticStates
  components := [Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N k),
    Simulant.Library.CrashStop.component 1 (ctx_CrashStop N k),
    Simulant.Library.Pebbles.component  (ctx_Pebbles N k)]
  frame := .common
  round := .fsync
  view := view N k
  step := step N k

def verdict (C : Config (sig N k)) : Verdict :=
  (let alive := ((List.finRange k).filter (fun (x0 : Fin k) => (FlagSet.correct C.agents[x0].flags))); (if alive.isEmpty then Verdict.failure else (if (alive.all (fun (a : Fin k) => ((((C.agents[a].pub).bh).isSome) && ((Ring.target (C.agents[a].pos) (((C.agents[a].pub).bh).getD Move.stay)) == C.world.BlackHole.site)))) then Verdict.success else Verdict.inProgress)))

def line (mem : Mem) : Nat :=
  (match mem.pc with
    | PC.probe => 3
    | PC.back => 4
    | PC.advance => 5
    | PC.wait1 => 8
    | PC.wait2 => 9
    | PC.check => 10
    | PC.halted => 12)

end

def goal : Goal := .eventuallyAlways

instance (N k : Nat) : LawfulLens (ctx_BlackHole N k).world := ⟨fun _ _ => rfl⟩

/-- The other components of the model preserve the part of the world that `BlackHole` owns. -/
theorem others_preserve_BlackHole (N k : Nat) :
    ∀ c ∈ (model N k).components, c = Simulant.Library.BlackHole.component Simulant.Library.BlackHole.HolePolicy.mayEmerge (ctx_BlackHole N k) ∨ c.Preserves (ctx_BlackHole N k).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl | rfl | rfl
  · exact Or.inl rfl
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ fun _ _ => rfl)
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ fun _ _ => rfl)

instance (N k : Nat) : LawfulLens (ctx_Pebbles N k).world := ⟨fun _ _ => rfl⟩

/-- The other components of the model preserve the part of the world that `Pebbles` owns. -/
theorem others_preserve_Pebbles (N k : Nat) :
    ∀ c ∈ (model N k).components, c = Simulant.Library.Pebbles.component  (ctx_Pebbles N k) ∨ c.Preserves (ctx_Pebbles N k).world.get := by
  intro c hc
  simp only [model, List.mem_cons, List.not_mem_nil, or_false] at hc
  rcases hc with rfl | rfl | rfl
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ fun _ _ => rfl)
  · exact Or.inr (Hooks.toComponent_preserves _ _ _ fun _ _ => rfl)
  · exact Or.inl rfl

def domain_N  : List (Nat) :=
  ((List.range 7).filter (fun (x0 : Nat) => (decide (x0 ≥ 3))))

def domain_site (N : Nat) [NeZero N] : List (Fin N) :=
  (((List.range N).filter (fun (x0 : Nat) => (decide (x0 ≥ 1)))).map (fun (x0 : Nat) => (Fin.ofNat N x0)))

def count (N : Nat) [NeZero N] (site : Fin N) : Nat := 2

def init (N : Nat) [NeZero N] (site : Fin N) : ND (Config (sig N (count N site))) := do
  let w_BlackHole ← Simulant.Library.BlackHole.initWorld (N := N) Simulant.Library.BlackHole.HolePolicy.mayEmerge site
  let w_Pebbles ← Simulant.Library.Pebbles.initWorld (N := N) 
  pure {
    agents := Vector.ofFn fun j =>
      let i := j.val
      { pos := (Fin.ofNat N 0), flags := FlagSet.none, fields := {  }, pub := ({ id := i, bh := (none : Option (Move)) } : Pub), mem := ({ pc := (if (i == 0) then PC.probe else PC.wait1) } : Mem) },
    world := { BlackHole := w_BlackHole, Pebbles := w_Pebbles } }

/-- Every admissible execution, for every value of the parameters, satisfies the task. -/
def Statement : Prop :=
  ∀ (N : Nat) [NeZero N], N ∈ domain_N  →
  ∀ (site : Fin N), site ∈ domain_site N →
    (model N (count N site)).Correct act0 (init N site) (verdict N (count N site)) goal

/-- Non-vacuity: an initial configuration exists, every reachable configuration has a successor,
and an admissible execution exists. -/
def NonVacuity : Prop :=
  ∀ (N : Nat) [NeZero N], N ∈ domain_N  →
  ∀ (site : Fin N), site ∈ domain_site N →
    (model N (count N site)).HasInitial (init N site) ∧ (model N (count N site)).Total act0 (init N site) ∧ (model N (count N site)).HasExecution act0 (init N site)

end Examples.CautiousPairCrash
