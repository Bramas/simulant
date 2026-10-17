import Simulant

/-! Generated from the IR of component `Lights` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Lights
open Simulant

structure World (N : Nat) where
  colorCount : Nat
  lights : List (Nat)
deriving DecidableEq, Repr

structure Fields (N : Nat) where
  slot : Nat
deriving DecidableEq, Repr

/-- The flags declared by `Lights`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where
  light : A → Option (Nat)

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)
  fields : Lens σ.X (Fields σ.N)

def initWorld {N : Nat} [NeZero N] (colors : Nat)  : ND (World N) := do
  let colorCount ← (pure colors)
  let lights ← (pure ([] : List (Nat)))
  pure { colorCount := colorCount, lights := lights }

def init_slot {N : Nat} [NeZero N] (colors : Nat)  (i : Nat) : ND (Nat) :=
  (pure i)

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks (colors : Nat) (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => (pure (let lights := (B.ofFn ((List.finRange σ.k).length) (fun (i : Nat) => (let previous := (if (decide (i < (((L.world.get C.world).lights).length))) then (((L.world.get C.world).lights)[i]!) else 0); (let updates := ((List.finRange σ.k).filter (fun (a : Fin σ.k) => ((((L.fields.get C.agents[a].fields).slot) == i) && ((ds a).decided) && ((Actions.light (ds a).act).isSome) && (decide (((Actions.light (ds a).act).getD 0) < ((L.world.get C.world).colorCount)))))); (if updates.isEmpty then previous else (updates.map (fun (a : Fin σ.k) => ((Actions.light (ds a).act).getD 0))).sum))))); ({ world := fun x => { x with lights := lights }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.N))))
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩

def component (colors : Nat) (L : Ctx σ) : Component σ :=
  (hooks colors L).toComponent L.world

end

end Simulant.Library.Lights
