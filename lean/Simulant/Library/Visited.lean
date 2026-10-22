import Simulant

/-! Generated from the IR of component `Visited` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Visited
open Simulant

structure World (P : Type) where
  visited : List (P)
deriving DecidableEq, Repr

/-- The flags declared by `Visited`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.S.Pos)

def initWorld {S : Space}   : ND (World S.Pos) := do
  let visited ← (pure ([] : List (S.Pos)))
  pure { visited := visited }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the parts of the state the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.S.Pos) Unit where
  beforeLook := fun ts C => (pure ({ world := fun x => { x with visited := (((L.world.get C.world).visited) ++ (((List.finRange σ.k).filter (fun (x0 : Fin σ.k) => (FlagSet.present C.agents[x0].flags))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos))).eraseDups }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.S.Pos) Unit))
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  afterMove := fun ts C => (pure ({ world := fun x => { x with visited := (((L.world.get C.world).visited) ++ (((List.finRange σ.k).filter (fun (x0 : Fin σ.k) => (FlagSet.present C.agents[x0].flags))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos))).eraseDups }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.S.Pos) Unit))

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world (Lens.unit σ.X)

end

end Simulant.Library.Visited
