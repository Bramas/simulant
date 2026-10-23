import Simulant

/-! Generated from the IR of scheduler `Permutation` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Permutation
open Simulant

structure Fields (P : Type) where
  done : Bool
deriving DecidableEq, Repr

/-- The flags declared by `Permutation`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  fields : Lens σ.X (Fields σ.S.Pos)

def init_done {S : Space}   (i : Nat) : ND (Bool) :=
  (pure false)

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The agents that take their next event, and the scheduler's effect on the parts of the state it owns. -/
def hooks  (L : Ctx σ) : SchedulerHooks σ Unit (Fields σ.S.Pos) where
  schedule := fun ts C => (let left := ((Config.eligible C).filter (fun (a : Fin σ.k) => (!((L.fields.get C.agents[a].fields).done)))); (do let a ← (ND.choose "Permutation.a" (if left.isEmpty then (Config.eligible C) else left)); (pure ((fun agent' => (fun (b : Fin σ.k) => (b == a)) agent', ({ world := id, raise := fun agent' => FlagSet.none, fields := fun agent' _ => (fun (b : Fin σ.k) => ({ done := ((b == a) || ((!left.isEmpty) && ((L.fields.get C.agents[b].fields).done))) } : Fields σ.S.Pos)) agent' } : OwnEffect σ Unit (Fields σ.S.Pos))) : (Fin σ.k → Bool) × OwnEffect σ Unit (Fields σ.S.Pos)))))

/-- The scheduler, with the cut of the cycle into events. -/
def scheduler  (events : List (List Instant)) (L : Ctx σ) : Scheduler σ :=
  (hooks  L).toScheduler events .none (Lens.unit σ.W) L.fields

end

end Simulant.Library.Permutation
