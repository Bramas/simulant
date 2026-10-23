import Simulant

/-! Generated from the IR of scheduler `Sequential` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Sequential
open Simulant

/-- The flags declared by `Sequential`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where


section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The agents that take their next event, and the scheduler's effect on the parts of the state it owns. -/
def hooks  (L : Ctx σ) : SchedulerHooks σ Unit Unit where
  schedule := fun ts C => (do let a ← (ND.choose "Sequential.a" (Config.eligible C)); (pure ((fun agent' => (fun (b : Fin σ.k) => (b == a)) agent', ({ world := id, raise := fun agent' => FlagSet.none } : OwnEffect σ Unit Unit)) : (Fin σ.k → Bool) × OwnEffect σ Unit Unit)))

/-- The scheduler, with the cut of the cycle into events. -/
def scheduler  (events : List (List Instant)) (L : Ctx σ) : Scheduler σ :=
  (hooks  L).toScheduler events .activation (Lens.unit σ.W) (Lens.unit σ.X)

end

end Simulant.Library.Sequential
