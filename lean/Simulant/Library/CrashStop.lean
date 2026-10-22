import Simulant

/-! Generated from the IR of component `CrashStop` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.CrashStop
open Simulant

/-- The flags declared by `CrashStop`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where
  crashed : F → Bool
  raise_crashed : F
  crashed_raise : crashed raise_crashed = true
  crashed_merge : ∀ a b : F, crashed (FlagSet.merge a b) = (crashed a || crashed b)
  crashed_none : crashed (FlagSet.none : F) = false

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where


section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the parts of the state the component owns. -/
def hooks (f : Nat) (L : Ctx σ) : Hooks σ Unit Unit where
  beforeLook := fun ts C => (do let S ← (ND.chooseSuch "CrashStop.S" (B.subsets ((List.finRange σ.k).filter (fun (x0 : Fin σ.k) => (FlagSet.correct C.agents[x0].flags)))) (fun (S : List (Fin σ.k)) => (decide ((((List.finRange σ.k).countP (fun (x1 : Fin σ.k) => (Flags.crashed C.agents[x1].flags))) + S.length) ≤ f)))); (pure ({ world := id, raise := fun a => (if (S).contains a then (Flags.raise_crashed : σ.F) else FlagSet.none) } : OwnEffect σ Unit Unit)))
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩

def component (f : Nat) (L : Ctx σ) : Component σ :=
  (hooks f L).toComponent (Lens.unit σ.W) (Lens.unit σ.X)

end

end Simulant.Library.CrashStop
