import Simulant

/-! Generated from the IR of component `PersistentReflection` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.PersistentReflection
open Simulant

structure Fields (N : Nat) where
  mirrored : Bool
deriving DecidableEq, Repr

/-- The flags declared by `PersistentReflection`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  fields : Lens σ.X (Fields σ.N)

def init_mirrored {N : Nat} [NeZero N]   (i : Nat) : ND (Bool) :=
  (ND.choose "PersistentReflection.mirrored" ([false, true]))

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ Unit where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none⟩
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent (Lens.unit σ.W)

end

end Simulant.Library.PersistentReflection
