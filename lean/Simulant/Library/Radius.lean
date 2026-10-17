import Simulant

/-! Generated from the IR of component `Radius` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Radius
open Simulant

structure World (N : Nat) where
  phi : Nat
deriving DecidableEq, Repr

/-- The flags declared by `Radius`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)

def initWorld {N : Nat} [NeZero N]  (phi : Nat) : ND (World N) := do
  let phi ← (pure phi)
  pure { phi := phi }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none⟩
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world

end

end Simulant.Library.Radius
