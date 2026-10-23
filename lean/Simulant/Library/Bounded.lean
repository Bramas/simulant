import Simulant

/-! Generated from the IR of scheduler `Bounded` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Bounded
open Simulant

structure Fields (P : Type) where
  waited : Nat
deriving DecidableEq, Repr

/-- The flags declared by `Bounded`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  fields : Lens σ.X (Fields σ.S.Pos)

def init_waited {S : Space} (k : Nat)  (i : Nat) : ND (Nat) :=
  (pure 0)

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The agents that take their next event, and the scheduler's effect on the parts of the state it owns. -/
def hooks (k : Nat) (L : Ctx σ) : SchedulerHooks σ Unit (Fields σ.S.Pos) where
  schedule := fun ts C => (do let S ← (ND.choose "Bounded.S" ((nonemptySubsets (Config.eligible C)).filter (fun (S : List (Fin σ.k)) => ((Config.eligible C).all (fun (a : Fin σ.k) => ((decide ((((L.fields.get C.agents[a].fields).waited) + 1) < k)) || (S.contains a))))))); (pure ((fun agent' => (S).contains agent', ({ world := id, raise := fun agent' => FlagSet.none, fields := fun agent' _ => (fun (a : Fin σ.k) => ({ waited := (if ((S.contains a) || (!((Config.eligible C).contains a))) then 0 else (((L.fields.get C.agents[a].fields).waited) + 1)) } : Fields σ.S.Pos)) agent' } : OwnEffect σ Unit (Fields σ.S.Pos))) : (Fin σ.k → Bool) × OwnEffect σ Unit (Fields σ.S.Pos))))

/-- The scheduler, with the cut of the cycle into events. -/
def scheduler (k : Nat) (events : List (List Instant)) (L : Ctx σ) : Scheduler σ :=
  (hooks k L).toScheduler events .none (Lens.unit σ.W) L.fields

end

end Simulant.Library.Bounded
