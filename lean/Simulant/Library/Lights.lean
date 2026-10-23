import Simulant

/-! Generated from the IR of component `Lights` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Lights
open Simulant

structure World (P : Type) where
  colorCount : Nat
deriving DecidableEq, Repr

structure Fields (P : Type) where
  light : Nat
deriving DecidableEq, Repr

/-- The flags declared by `Lights`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where
  setLight : A → Option (Nat)

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.S.Pos)
  fields : Lens σ.X (Fields σ.S.Pos)

def initWorld {S : Space} (colors : Nat)  : ND (World S.Pos) := do
  let colorCount ← (pure colors)
  pure { colorCount := colorCount }

def init_light {S : Space} (colors : Nat)  (i : Nat) : ND (Nat) :=
  (pure 0)

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the parts of the state the component owns. -/
def hooks (colors : Nat) (L : Ctx σ) : Hooks σ (World σ.S.Pos) (Fields σ.S.Pos) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  onCompute := fun ts C ds => (pure ({ world := id, raise := fun agent' => FlagSet.none, fields := fun agent' _ => (fun (a : Fin σ.k) => (let c := (Actions.setLight (ds a).act); ({ light := (if (((ds a).decided) && c.isSome && (decide ((c.getD 0) < colors))) then (c.getD 0) else (L.fields.get C.agents[a].fields).light) } : Fields σ.S.Pos))) agent' } : OwnEffect σ (World σ.S.Pos) (Fields σ.S.Pos)))
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩

def component (colors : Nat) (L : Ctx σ) : Component σ :=
  (hooks colors L).toComponent L.world L.fields

end

end Simulant.Library.Lights
