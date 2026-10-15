import Simulant

/-! Generated from the IR of component `BlackHole` by packages/lean-gen. Do not edit. -/

set_option linter.unusedVariables false

namespace Simulant.Library.BlackHole
open Simulant

inductive HolePolicy where
  | none
  | initiallyPresent
  | mayEmerge
deriving DecidableEq, Repr, Inhabited

structure World (N : Nat) where
  site : Fin N
  active : Bool
deriving DecidableEq, Repr

/-- The flags declared by `BlackHole`, with the laws of a composition's flags. -/
class Flags (F : Type) [FlagSet F] where
  dead : F → Bool
  raise_dead : F
  dead_raise : dead raise_dead = true
  dead_merge : ∀ a b : F, dead (FlagSet.merge a b) = (dead a || dead b)
  dead_none : dead (FlagSet.none : F) = false

class Actions (A : Type) where

/-- What the composition gives the component: lenses on the state it owns. -/
structure Ctx (σ : Sig) where
  world : Lens σ.W (World σ.N)

def initWorld {N : Nat} [NeZero N] (policy : HolePolicy) (site : Fin N) : ND (World N) := do
  let site ← (pure site)
  let active ← (pure (policy == HolePolicy.initiallyPresent))
  pure { site := site, active := active }

section
variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- The hooks, on the part of the world the component owns. -/
def hooks (policy : HolePolicy) (L : Ctx σ) : Hooks σ (World σ.N) where
  beforeLook := fun ts C => pure ⟨id, fun _ => FlagSet.none⟩
  beforeMove := fun ts C ds => pure ⟨id, fun _ => FlagSet.none⟩
  afterMove := fun ts C => (do let active ← (if ((policy == HolePolicy.mayEmerge) && (!((L.world.get C.world).active))) then (ND.choose "BlackHole.active" ([false, true] : List (Bool))) else (pure ((L.world.get C.world).active))); (pure ({ world := fun x => { x with active := active }, raise := fun a => (if (fun (a : Fin σ.k) => ((FlagSet.present C.agents[a].flags) && active && ((C.agents[a].pos) == ((L.world.get C.world).site)))) a then (Flags.raise_dead : σ.F) else FlagSet.none) } : OwnEffect σ (World σ.N))))

def component (policy : HolePolicy) (L : Ctx σ) : Component σ :=
  (hooks policy L).toComponent L.world

end

end Simulant.Library.BlackHole
