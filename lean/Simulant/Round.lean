import Simulant.ND
import Simulant.Space

/-!
# The standard round (docs/ir.md, "The standard round")

Everything is generic over a signature `Sig`: the space, the number of agents, and the composed
types of flags, component agent fields, public state, memory, actions, world and sensor
environment. A generated model file instantiates it.

The round follows the interpreter step by step, so that the interpreter's witnesses are
witnesses here: the space state, `beforeLook`, activation, for each activated agent its Look
(a presentation of its view under one morphism) and its sensors, the decisions, `beforeMove`,
movement along edges, and `afterMove`.
-/

namespace Simulant

structure Sig where
  S : Space
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
  /-- The sensor environment of a Look: one field per sensor the algorithm uses. -/
  E : Type

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

/-- The per-round state of the space: the edges missing this round. -/
abbrev TState (S : Space) := List S.Edge

variable {σ : Sig}

structure Agent (σ : Sig) where
  pos : σ.S.Pos
  /-- The agent's kept port permutation (`Frames.portPermutations .perRobot`); empty otherwise. -/
  frame : List Nat
  flags : σ.F
  fields : σ.X
  pub : σ.P
  mem : σ.M

/-- The space's port behind the agent's local port `i`: through its kept permutation, if any. -/
def Agent.port (a : Agent σ) (i : Nat) : Nat := if a.frame.isEmpty then i else a.frame.getD i i

structure Config (σ : Sig) where
  agents : Vector (Agent σ) σ.k
  world : σ.W

/-- A lens on the part of a state owned by one component. -/
structure Lens (S T : Type) where
  get : S → T
  set : S → T → S

/-- What a hook does: update its component's world fields, raise flags, and update its
component's agent fields. -/
structure Effect (σ : Sig) where
  world : σ.W → σ.W
  raise : Fin σ.k → σ.F
  fields : Fin σ.k → σ.X → σ.X

def Effect.none [FlagSet σ.F] : Effect σ := ⟨id, fun _ => FlagSet.none, fun _ => id⟩

/-- Merging the effects of two hooks run on the same snapshot. -/
def Effect.combine [FlagSet σ.F] (e f : Effect σ) : Effect σ :=
  ⟨f.world ∘ e.world, fun a => FlagSet.merge (e.raise a) (f.raise a), fun a => f.fields a ∘ e.fields a⟩

def Config.apply [FlagSet σ.F] (C : Config σ) (e : Effect σ) : Config σ :=
  { agents := Vector.ofFn fun i =>
      { C.agents[i] with flags := FlagSet.merge C.agents[i].flags (e.raise i), fields := e.fields i C.agents[i].fields },
    world := e.world C.world }

structure Decision (σ : Sig) where
  decided : Bool
  /-- The position the agent moves to (its own to stay). -/
  target : σ.S.Pos
  pub : σ.P
  mem : σ.M
  act : σ.A

/-- What the algorithm returns: the move is a location of its Look. -/
structure Out (σ : Sig) where
  move : Nat
  pub : σ.P
  mem : σ.M
  act : σ.A

/-! ## The Look -/

/-- What an activated agent observes: its view, presented as locations `0 .. size - 1`. The
positions behind the locations are for sensors only. -/
structure Look (σ : Sig) where
  me : Fin σ.k
  config : Config σ
  ts : TState σ.S
  /-- The position behind each location. -/
  order : List σ.S.Pos
  here : Nat
  /-- The neighbors of each location, as locations. -/
  nbrs : List (List Nat)

namespace Look

variable (L : Look σ)

def size : Nat := L.order.length

/-- The position behind a location (the observer's own, out of range). -/
def position (l : Nat) : σ.S.Pos := L.order.getD l L.config.agents[L.me].pos

def neighbors (l : Nat) : List Nat := L.nbrs.getD l []

/-- Breadth-first distances from `a` within the visible domain. -/
def distances (a : Nat) : List Nat :=
  let rec go : Nat → List Nat → List (Option Nat) → List (Option Nat)
    | 0, _, d => d
    | fuel + 1, queue, d =>
      match queue with
      | [] => d
      | q :: rest =>
        let dq := (d.getD q none).getD 0
        let (rest, d) := (L.neighbors q).foldl (fun (acc : List Nat × List (Option Nat)) w =>
          if (acc.2.getD w none).isSome then acc else (acc.1 ++ [w], acc.2.set w (some (dq + 1)))) (rest, d)
        go fuel rest d
  (go (L.size + 1) [a] (((List.replicate L.size none).set a (some 0)))).map (·.getD L.size)

/-- The distance between two locations within the visible domain. -/
def distance (a b : Nat) : Nat := (L.distances a).getD b L.size

/-- The agents at the position behind a location. -/
def occupants (l : Nat) : List (Fin σ.k) :=
  (List.finRange σ.k).filter fun i => L.config.agents[i].pos == L.position l

/-- The agents at a visible position. -/
def visibleAgents : List (Fin σ.k) :=
  (List.finRange σ.k).filter fun i => L.order.contains L.config.agents[i].pos

/-- Whether an edge between the positions behind two locations is present this round. -/
def edgePresent (a b : Nat) : Bool := σ.S.edgePresent L.ts (L.position a) (L.position b)

end Look

/-! ## Components -/

structure Component (σ : Sig) where
  beforeLook : TState σ.S → Config σ → ND (Effect σ)
  beforeMove : TState σ.S → Config σ → (Fin σ.k → Decision σ) → ND (Effect σ)
  afterMove : TState σ.S → Config σ → ND (Effect σ)

/-! A component's hooks return an effect on its own part of the world and of the agents'
fields only; the composition lifts it through the component's lenses. So no component can
write another's fields, by construction, and the lemma that says so
(`Hooks.toComponent_preserves`) is proved once for all components. -/

/-- An effect on the parts a component owns. -/
structure OwnEffect (σ : Sig) (Wc Xc : Type) where
  world : Wc → Wc
  raise : Fin σ.k → σ.F
  fields : Fin σ.k → Xc → Xc := fun _ => id

def OwnEffect.lift (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) (e : OwnEffect σ Wc Xc) : Effect σ :=
  ⟨fun w => L.set w (e.world (L.get w)), e.raise, fun a x => Lx.set x (e.fields a (Lx.get x))⟩

/-- The hooks of a component that owns world part `Wc` and agent-field part `Xc`. -/
structure Hooks (σ : Sig) (Wc Xc : Type) where
  beforeLook : TState σ.S → Config σ → ND (OwnEffect σ Wc Xc)
  beforeMove : TState σ.S → Config σ → (Fin σ.k → Decision σ) → ND (OwnEffect σ Wc Xc)
  afterMove : TState σ.S → Config σ → ND (OwnEffect σ Wc Xc)

def Hooks.toComponent (h : Hooks σ Wc Xc) (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) : Component σ where
  beforeLook ts C := do let e ← h.beforeLook ts C; pure (e.lift L Lx)
  beforeMove ts C ds := do let e ← h.beforeMove ts C ds; pure (e.lift L Lx)
  afterMove ts C := do let e ← h.afterMove ts C; pure (e.lift L Lx)

/-- The lens of a component that owns no part of `S`. -/
def Lens.unit (S : Type) : Lens S Unit := ⟨fun _ => (), fun s _ => s⟩

/-- A lens whose `get` reads back what `set` wrote. -/
class LawfulLens (L : Lens S T) : Prop where
  get_set : ∀ s t, L.get (L.set s t) = t

/-! ## Models -/

/-- The morphisms through which agents see their view. `Frames.identity` is `perLook` with the
identity permutation alone. -/
inductive Frames (S : Space) where
  /-- The reference ordering, then a rooted isomorphism of the view, chosen at each Look. -/
  | isomorphisms (ord : RefOrder S)
  /-- The ports, through a permutation chosen at each Look among these. -/
  | perLook (perms : List (List Nat))
  /-- The ports, through the agent's kept permutation (`Agent.frame`). -/
  | perRobot

inductive RoundKind where
  | fsync | ssync | sequential
deriving DecidableEq, Repr

structure Model (σ : Sig) where
  tstates : List (TState σ.S)
  components : List (Component σ)
  /-- The radius of the view (the number of positions, for the full view of a finite space). -/
  radius : Nat
  frames : Frames σ.S
  round : RoundKind
  /-- The sensors of a Look, with their Look-level choices. -/
  env : Look σ → ND σ.E
  step : σ.M → σ.P → Look σ → σ.E → Out σ

/-- All hooks of a hook point read the same snapshot; their effects are merged. -/
def parallel [FlagSet σ.F] : List (Config σ → ND (Effect σ)) → Config σ → ND (Effect σ)
  | [], _ => pure Effect.none
  | h :: hs, C => do
    let e ← h C
    let r ← parallel hs C
    pure (e.combine r)

/-- The decision of an agent that does not decide: stay, keep its state. -/
def Decision.idle (a : Agent σ) (act : σ.A) : Decision σ :=
  { decided := false, target := a.pos, pub := a.pub, mem := a.mem, act }

/-- Movement along edges: agents that decided and still act move to their target when it is a
neighbor through an edge present this round, and take their new state. -/
def moveAll [FlagSet σ.F] (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) : Config σ :=
  { C with agents := Vector.ofFn fun i =>
      let a := C.agents[i]
      let d := ds i
      if d.decided && FlagSet.acts a.flags != .never then
        { a with
          pos := if d.target != a.pos && (σ.S.neighbors a.pos).contains d.target && σ.S.edgePresent ts a.pos d.target
            then d.target else a.pos,
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

/-- The presentations of an agent's view, one per morphism its frames allow. -/
def presentations (a : Agent σ) : List Space.Presentation :=
  let V := σ.S.view m.radius a.pos
  match m.frames with
  | .isomorphisms ord => (σ.S.rootedAutomorphisms V).map (σ.S.isoPresentation V a.pos (ord a.pos))
  | .perLook perms => perms.map (σ.S.portPresentation V)
  | .perRobot => [σ.S.portPresentation V a.frame]

/-- The Look of agent `i` under a presentation of its view. -/
def look (ts : TState σ.S) (C : Config σ) (i : Fin σ.k) (p : Space.Presentation) : Look σ :=
  let V := σ.S.view m.radius C.agents[i].pos
  { me := i, config := C, ts := ts,
    order := p.order.map fun v => V.vertices.getD v C.agents[i].pos,
    here := Space.indexIn p.order 0, nbrs := p.nbrs }

/-- The decisions one agent may take: per morphism and sensor outcome. -/
def options (act0 : σ.A) (ts : TState σ.S) (C : Config σ) (i : Fin σ.k) : ND (Decision σ) :=
  let a := C.agents[i]
  match FlagSet.acts a.flags with
  | .adversary => do
    let t ← ND.choose ("adversary " ++ agentName i) (a.pos :: σ.S.neighbors a.pos).eraseDups
    pure { Decision.idle a act0 with decided := true, target := t }
  | _ => do
    let p ← chooseIfMany ("frame " ++ agentName i) (m.presentations a)
    let L := m.look ts C i p
    let e ← m.env L
    let o := m.step a.mem a.pub L e
    pure { decided := true, target := L.position o.move, pub := o.pub, mem := o.mem, act := o.act }

/-- The product, over the activated agents, of their decisions. -/
def decideAll (act0 : σ.A) (ts : TState σ.S) (C : Config σ) (active : List (Fin σ.k)) : ND (Fin σ.k → Decision σ) :=
  active.foldlM (fun ds i => do
      let d ← m.options act0 ts C i
      pure fun j => if j = i then d else ds j)
    (fun j => Decision.idle C.agents[j] act0)

/-- One round, with the activated agents. `act0` is the default value of the actions. -/
def roundA (act0 : σ.A) (C : Config σ) : ND (List (Fin σ.k) × Config σ) := do
  let ts ← chooseIfMany "edges" m.tstates
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
