import Simulant

/-! Generated from the IR of component `Pebbles` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.Pebbles
open Simulant

inductive PebbleAction where
  | none
  | drop
  | pick
deriving DecidableEq, Repr, Inhabited

structure World (N : Nat) where
  pebbles : List (Fin N)
deriving DecidableEq, Repr

/-- The flags declared by `Pebbles`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where
  pebble : A → PebbleAction

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)

def initWorld {N : Nat} [NeZero N]   : ND (World N) := do
  let pebbles ← (pure ([] : List (Fin N)))
  pure { pebbles := pebbles }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

def sensor_pebblesHere (L : Ctx σ)  (ts : TState) (C : Config σ) (me : Fin σ.k) (frame : Bool) : ND (Nat) :=
  (pure (((L.world.get C.world).pebbles).countP (fun (x0 : Fin σ.N) => (x0 == (C.agents[me].pos)))))

/-- The hooks, on the part of the world the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => (pure (let picks := (((List.finRange σ.k).filter (fun (a : Fin σ.k) => (((ds a).decided) && ((Actions.pebble (ds a).act) == PebbleAction.pick)))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos)); (let drops := (((List.finRange σ.k).filter (fun (a : Fin σ.k) => (((ds a).decided) && ((Actions.pebble (ds a).act) == PebbleAction.drop)))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos)); ({ world := fun x => { x with pebbles := ((B.diff ((L.world.get C.world).pebbles) picks) ++ drops) }, raise := fun a => FlagSet.none } : OwnEffect σ (World σ.N)))))
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world

end

end Simulant.Library.Pebbles
