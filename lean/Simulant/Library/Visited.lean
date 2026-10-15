import Simulant

/-! Generated from the IR of component `Visited` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Visited
open Simulant

structure World (N : Nat) where
  visited : List (Fin N)
deriving DecidableEq, Repr

/-- The flags declared by `Visited`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)

def initWorld {N : Nat} [NeZero N]   : ND (World N) := do
  let visited ← (pure ([] : List (Fin N)))
  pure { visited := visited }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => (pure ({ world := fun x => { x with visited := (((L.world.get C.world).visited) ++ (((List.finRange σ.k).filter (fun (x0 : Fin σ.k) => (FlagSet.present C.agents[x0].flags))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos))).eraseDups }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.N)))
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none⟩
  afterMove := fun ts C => (pure ({ world := fun x => { x with visited := (((L.world.get C.world).visited) ++ (((List.finRange σ.k).filter (fun (x0 : Fin σ.k) => (FlagSet.present C.agents[x0].flags))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos))).eraseDups }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.N)))

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world

end

end Simulant.Library.Visited
