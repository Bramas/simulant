import Simulant.ND
import Simulant.Ring

/-!
# The standard round (plan, Section 3.7)

Everything is generic over a signature `Sig`: the ring size, the number of
agents, and the composed types of flags, component agent fields, public
state, memory, actions, world and view. A generated model file instantiates
it.

The round follows the interpreter step by step, so that the interpreter's
witnesses are witnesses here (see `docs/ir.md`).
-/

namespace Simulant

structure Sig where
  N : Nat
  k : Nat
  /-- Flags. -/
  F : Type
  /-- Component agent fields. -/
  X : Type
  /-- Public state of the algorithm. -/
  P : Type
  /-- Memory of the algorithm. -/
  M : Type
  /-- Actions other than moves. -/
  A : Type
  /-- World fields. -/
  W : Type
  /-- What the algorithm sees: one field per sensor it uses. -/
  V : Type

inductive Acts where
  | never | adversary | algorithm
deriving DecidableEq, Repr

/-- The flags of a composition, generated as a structure of `Bool`s. -/
class FlagSet (F : Type) where
  none : F
  merge : F → F → F
  correct : F → Bool
  present : F → Bool
  acts : F → Acts

/-- Flags are only ever raised: an agent that never acts never acts again. -/
class LawfulFlagSet (F : Type) [FlagSet F] : Prop where
  acts_merge_never : ∀ f g : F, FlagSet.acts f = .never → FlagSet.acts (FlagSet.merge f g) = .never

variable {σ : Sig}

structure Agent (σ : Sig) where
  pos : Fin σ.N
  flags : σ.F
  fields : σ.X
  pub : σ.P
  mem : σ.M

structure Config (σ : Sig) where
  agents : Vector (Agent σ) σ.k
  world : σ.W

/-- A lens on the part of a state owned by one component. -/
structure Lens (S T : Type) where
  get : S → T
  set : S → T → S

/-- What a hook does: update its component's world fields, and raise flags. -/
structure Effect (σ : Sig) where
  world : σ.W → σ.W
  raise : Fin σ.k → σ.F

def Effect.none [FlagSet σ.F] : Effect σ := ⟨id, fun _ => FlagSet.none⟩

/-- Merging the effects of two hooks run on the same snapshot. -/
def Effect.combine [FlagSet σ.F] (e f : Effect σ) : Effect σ :=
  ⟨f.world ∘ e.world, fun a => FlagSet.merge (e.raise a) (f.raise a)⟩

def Config.apply [FlagSet σ.F] (C : Config σ) (e : Effect σ) : Config σ :=
  { agents := Vector.ofFn fun i => { C.agents[i] with flags := FlagSet.merge C.agents[i].flags (e.raise i) },
    world := e.world C.world }

structure Decision (σ : Sig) where
  decided : Bool
  move : Move
  pub : σ.P
  mem : σ.M
  act : σ.A

/-- What the algorithm returns; the move is local. -/
structure Out (σ : Sig) where
  move : Move
  pub : σ.P
  mem : σ.M
  act : σ.A

structure Component (σ : Sig) where
  beforeLook : TState → Config σ → ND (Effect σ)
  beforeMove : TState → Config σ → (Fin σ.k → Decision σ) → ND (Effect σ)
  afterMove : TState → Config σ → ND (Effect σ)

/-! ## Components that own part of the state

A component's hooks return an effect on its own part of the world only;
the composition lifts it through the component's lens. So no component
can write another's fields, by construction, and the lemma that says so
(`Hooks.toComponent_preserves`) is proved once for all components. -/

/-- An effect on the part of the world a component owns. -/
structure OwnEffect (σ : Sig) (Wc : Type) where
  world : Wc → Wc
  raise : Fin σ.k → σ.F

def OwnEffect.lift (L : Lens σ.W Wc) (e : OwnEffect σ Wc) : Effect σ :=
  ⟨fun w => L.set w (e.world (L.get w)), e.raise⟩

/-- The hooks of a component that owns world part `Wc`. -/
structure Hooks (σ : Sig) (Wc : Type) where
  beforeLook : TState → Config σ → ND (OwnEffect σ Wc)
  beforeMove : TState → Config σ → (Fin σ.k → Decision σ) → ND (OwnEffect σ Wc)
  afterMove : TState → Config σ → ND (OwnEffect σ Wc)

def Hooks.toComponent (h : Hooks σ Wc) (L : Lens σ.W Wc) : Component σ where
  beforeLook ts C := do let e ← h.beforeLook ts C; pure (e.lift L)
  beforeMove ts C ds := do let e ← h.beforeMove ts C ds; pure (e.lift L)
  afterMove ts C := do let e ← h.afterMove ts C; pure (e.lift L)

/-- The lens of a component that owns no world field. -/
def Lens.unit (S : Type) : Lens S Unit := ⟨fun _ => (), fun s _ => s⟩

/-- A lens whose `get` reads back what `set` wrote. -/
class LawfulLens (L : Lens S T) : Prop where
  get_set : ∀ s t, L.get (L.set s t) = t

inductive FrameModel (σ : Sig) where
  | common
  | dynamic
  | persistent (get : σ.X → Bool)

inductive RoundKind where
  | fsync | ssync | sequential
deriving DecidableEq, Repr

structure Model (σ : Sig) where
  tstates : List TState
  components : List (Component σ)
  frame : FrameModel σ
  round : RoundKind
  /-- The sensors of an activation: configuration, agent, frame. -/
  view : TState → Config σ → Fin σ.k → Bool → ND σ.V
  step : σ.M → σ.P → σ.V → Out σ

/-- All hooks of a hook point read the same snapshot; their effects are merged. -/
def parallel [FlagSet σ.F] : List (Config σ → ND (Effect σ)) → Config σ → ND (Effect σ)
  | [], _ => pure Effect.none
  | h :: hs, C => do
    let e ← h C
    let r ← parallel hs C
    pure (e.combine r)

/-- The decision of an agent that does not decide: stay, keep its state. -/
def Decision.idle (a : Agent σ) (act : σ.A) : Decision σ :=
  { decided := false, move := .stay, pub := a.pub, mem := a.mem, act }

/-- Rigid movement along the edges present; only agents that still act apply their decision. -/
def moveAll [FlagSet σ.F] (ts : TState) (C : Config σ) (ds : Fin σ.k → Decision σ) : Config σ :=
  { C with agents := Vector.ofFn fun i =>
      let a := C.agents[i]
      let d := ds i
      if d.decided && FlagSet.acts a.flags != .never then
        { a with
          pos := if d.move != .stay && Ring.canMove ts a.pos d.move then Ring.target a.pos d.move else a.pos,
          pub := d.pub, mem := d.mem }
      else a }

/-- Sub-lists of `l` with `n` elements, in lexicographic order of positions. -/
def combos : Nat → List α → List (List α)
  | 0, _ => [[]]
  | _ + 1, [] => []
  | n + 1, x :: xs => (combos n xs).map (x :: ·) ++ combos (n + 1) xs

/-- Nonempty sub-lists, smallest first. -/
def nonemptySubsets (l : List α) : List (List α) :=
  (List.range l.length).flatMap fun s => combos (s + 1) l

def agentName (i : Fin k) : String := "a" ++ toString i.val

/-- A single option is no choice: it leaves no witness. -/
def chooseIfMany (site : String) : List α → ND α
  | [x] => pure x
  | xs => ND.choose site xs

namespace Model

variable [FlagSet σ.F] (m : Model σ)

/-- FSYNC: all eligible agents; SSYNC: a nonempty subset; sequential: a singleton. -/
def activate (C : Config σ) : ND (List (Fin σ.k)) :=
  let eligible := (List.finRange σ.k).filter fun i => FlagSet.acts C.agents[i].flags != .never
  match m.round with
  | .fsync => pure eligible
  | .ssync => if eligible.isEmpty then pure eligible else ND.choose "activation" (nonemptySubsets eligible)
  | .sequential => if eligible.isEmpty then pure eligible else ND.choose "activation" (eligible.map ([·]))

def frames (a : Agent σ) : List Bool :=
  match m.frame with
  | .common => [false]
  | .dynamic => [false, true]
  | .persistent get => [get a.fields]

/-- The decisions one agent may take. -/
def options (act0 : σ.A) (ts : TState) (C : Config σ) (i : Fin σ.k) : ND (Decision σ) :=
  let a := C.agents[i]
  match FlagSet.acts a.flags with
  | .adversary => do
    let mv ← ND.choose ("adversary " ++ agentName i) [Move.stay, .cw, .ccw]
    pure { Decision.idle a act0 with decided := true, move := mv }
  | _ => do
    let f ← chooseIfMany ("frame " ++ agentName i) (m.frames a)
    let v ← m.view ts C i f
    let o := m.step a.mem a.pub v
    pure { decided := true, move := toGlobal f o.move, pub := o.pub, mem := o.mem, act := o.act }

/-- The product, over the activated agents, of their decisions. -/
def decideAll (act0 : σ.A) (ts : TState) (C : Config σ) (active : List (Fin σ.k)) : ND (Fin σ.k → Decision σ) :=
  active.foldlM (fun ds i => do
      let d ← m.options act0 ts C i
      pure fun j => if j = i then d else ds j)
    (fun j => Decision.idle C.agents[j] act0)

/-- One round, with the activated agents. `act0` is the default value of the actions. -/
def roundA (act0 : σ.A) (C : Config σ) : ND (List (Fin σ.k) × Config σ) := do
  let ts ← chooseIfMany "topology" m.tstates
  let e ← parallel (m.components.map fun c => c.beforeLook ts) C
  let C := C.apply e
  let active ← m.activate C
  let ds ← m.decideAll act0 ts C active
  let e ← parallel (m.components.map fun c D => c.beforeMove ts D ds) C
  let C := moveAll ts (C.apply e) ds
  let e ← parallel (m.components.map fun c => c.afterMove ts) C
  pure (active, C.apply e)

/-- The step relation, with witnesses. -/
def Step (act0 : σ.A) (C : Config σ) (w : Witness) (C' : Config σ) : Prop :=
  ∃ active, (w, (active, C')) ∈ m.roundA act0 C

end Model
end Simulant
