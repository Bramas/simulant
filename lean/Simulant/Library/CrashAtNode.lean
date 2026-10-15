import Simulant

/-! Generated from the IR of component `CrashAtNode` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.CrashAtNode
open Simulant

structure World (N : Nat) where
  crashNode : Fin N
deriving DecidableEq, Repr

/-- The flags declared by `CrashAtNode`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where
  crashed : F → Bool
  raise_crashed : F
  crashed_raise : crashed raise_crashed = true
  crashed_merge : ∀ a b : F, crashed (FlagSet.merge a b) = (crashed a || crashed b)
  crashed_none : crashed (FlagSet.none : F) = false

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)

def initWorld {N : Nat} [NeZero N]  (crashNode : Fin N) : ND (World N) := do
  let crashNode ← (pure crashNode)
  pure { crashNode := crashNode }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => (do let S ← (ND.choose "CrashAtNode.S" (B.subsets ((List.finRange σ.k).filter (fun (a : Fin σ.k) => ((FlagSet.correct C.agents[a].flags) && ((C.agents[a].pos) == ((L.world.get C.world).crashNode))))))); (pure ({ world := id, raise := fun a => (if (S).contains a then (Flags.raise_crashed : σ.F) else FlagSet.none) } : OwnEffect σ (World σ.N))))
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world

end

end Simulant.Library.CrashAtNode
