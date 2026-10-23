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

structure World (P : Type) where
  pebbles : List (P)
deriving DecidableEq, Repr

/-- The flags declared by `Pebbles`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where

class Actions (A : Type) where
  pebble : A → PebbleAction

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.S.Pos)

def initWorld {S : Space}   : ND (World S.Pos) := do
  let pebbles ← (pure ([] : List (S.Pos)))
  pure { pebbles := pebbles }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

def sensor_pebblesHere (L : Ctx σ)  (Lk : Look σ) : ND (Nat) := do
  (pure (((L.world.get Lk.config.world).pebbles).countP (fun (x0 : σ.S.Pos) => (x0 == (Lk.position Lk.here)))))

/-- The hooks, on the parts of the state the component owns. -/
def hooks  (L : Ctx σ) : Hooks σ (World σ.S.Pos) Unit where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  onCompute := fun ts C ds => (pure (let picks := (((List.finRange σ.k).filter (fun (a : Fin σ.k) => (((ds a).decided) && ((Actions.pebble (ds a).act) == PebbleAction.pick)))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos)); (let drops := (((List.finRange σ.k).filter (fun (a : Fin σ.k) => (((ds a).decided) && ((Actions.pebble (ds a).act) == PebbleAction.drop)))).map (fun (x0 : Fin σ.k) => C.agents[x0].pos)); ({ world := fun world' => { world' with pebbles := ((B.diff ((L.world.get C.world).pebbles) picks) ++ drops) }, raise := fun agent' => FlagSet.none } : OwnEffect σ (World σ.S.Pos) Unit))))
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩
  afterMove := fun ts C => pure ⟨id, fun _ => FlagSet.none, fun _ => id⟩

def component  (L : Ctx σ) : Component σ :=
  (hooks  L).toComponent L.world (Lens.unit σ.X)

end

end Simulant.Library.Pebbles
