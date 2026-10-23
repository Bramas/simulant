import Simulant.ND
import Simulant.Space

/-!
# A step (docs/ir.md, "A step"; docs/scheduler-design.md)

Everything is generic over a signature `Sig`: the space, the number of agents, and the composed
types of flags, component agent fields, public state, memory, actions, world and sensor
environment. A generated model file instantiates it.

The step follows the interpreter stage by stage, so that the interpreter's witnesses are
witnesses here: the space state, `beforeLook`, the scheduler's choice of the agents that take
their next event, for each of them whose event includes Look its Look (a presentation of its
view under one morphism), its sensors and its decision, `onCompute` and the new states, `beforeMove`
and movement along edges, `afterMove`, and the agents' advance in their cycles. An agent between
two events of its cycle keeps its pending decision (`Agent.pending`).
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

structure Decision (σ : Sig) where
  decided : Bool
  /-- The position the agent moves to (its own to stay). -/
  target : σ.S.Pos
  pub : σ.P
  mem : σ.M
  act : σ.A

/-- An instant of an agent's Look-Compute-Move cycle. -/
inductive Instant where
  | look | compute | move
deriving DecidableEq, Repr

/-- Which executions are admissible: those in which every agent that acts forever takes events
infinitely often (`activation`), or all of them (`none`). -/
inductive Fairness where
  | activation | none
deriving DecidableEq, Repr

structure Agent (σ : Sig) where
  pos : σ.S.Pos
  /-- The agent's kept port permutation (`Frames.portPermutations .perRobot`); empty otherwise. -/
  frame : List Nat
  flags : σ.F
  fields : σ.X
  pub : σ.P
  mem : σ.M
  /-- The number of events of its current cycle the agent has taken (0 between cycles). -/
  phase : Nat := 0
  /-- Meanwhile, the decision of its last Look, not yet applied. -/
  pending : Option (Decision σ) := none

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
  /-- At Compute, with the decisions taking effect. -/
  onCompute : TState σ.S → Config σ → (Fin σ.k → Decision σ) → ND (Effect σ)
  /-- Before Move, with the moves about to happen. -/
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
  onCompute : TState σ.S → Config σ → (Fin σ.k → Decision σ) → ND (OwnEffect σ Wc Xc)
  beforeMove : TState σ.S → Config σ → (Fin σ.k → Decision σ) → ND (OwnEffect σ Wc Xc)
  afterMove : TState σ.S → Config σ → ND (OwnEffect σ Wc Xc)

def Hooks.toComponent (h : Hooks σ Wc Xc) (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) : Component σ where
  beforeLook ts C := do let e ← h.beforeLook ts C; pure (e.lift L Lx)
  onCompute ts C ds := do let e ← h.onCompute ts C ds; pure (e.lift L Lx)
  beforeMove ts C ds := do let e ← h.beforeMove ts C ds; pure (e.lift L Lx)
  afterMove ts C := do let e ← h.afterMove ts C; pure (e.lift L Lx)

/-! ## Schedulers -/

/-- What a scheduler's `schedule` returns: the agents that take their next event, and its effect
on the parts of the state it owns. -/
structure Scheduled (σ : Sig) where
  activate : Fin σ.k → Bool
  effect : Effect σ

structure Scheduler (σ : Sig) where
  /-- The cut of the cycle: its events, in order, each a list of instants. -/
  events : List (List Instant)
  fairness : Fairness
  schedule : TState σ.S → Config σ → ND (Scheduled σ)

/-- The `schedule` hook of a scheduler that owns world part `Wc` and agent-field part `Xc`. -/
structure SchedulerHooks (σ : Sig) (Wc Xc : Type) where
  schedule : TState σ.S → Config σ → ND ((Fin σ.k → Bool) × OwnEffect σ Wc Xc)

def SchedulerHooks.toScheduler (h : SchedulerHooks σ Wc Xc) (events : List (List Instant)) (fairness : Fairness)
    (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) : Scheduler σ where
  events := events
  fairness := fairness
  schedule ts C := do let s ← h.schedule ts C; pure ⟨s.1, s.2.lift L Lx⟩

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

structure Model (σ : Sig) where
  tstates : List (TState σ.S)
  components : List (Component σ)
  /-- The radius of the view (the number of positions, for the full view of a finite space). -/
  radius : Nat
  frames : Frames σ.S
  scheduler : Scheduler σ
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

/-- Compute: agents whose decision takes effect and that still act take its public state and memory. -/
def computeAll [FlagSet σ.F] (C : Config σ) (ds : Fin σ.k → Decision σ) : Config σ :=
  { C with agents := Vector.ofFn fun i =>
      let a := C.agents[i]
      let d := ds i
      if d.decided && FlagSet.acts a.flags != .never then { a with pub := d.pub, mem := d.mem } else a }

/-- Movement along edges: agents that decided and still act move to their target when it is a
neighbor through an edge present this step. -/
def moveAll [FlagSet σ.F] (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) : Config σ :=
  { C with agents := Vector.ofFn fun i =>
      let a := C.agents[i]
      let d := ds i
      if d.decided && FlagSet.acts a.flags != .never then
        { a with
          pos := if d.target != a.pos && (σ.S.neighbors a.pos).contains d.target && σ.S.edgePresent ts a.pos d.target
            then d.target else a.pos }
      else a }

/-- The agents able to act. -/
def Config.eligible [FlagSet σ.F] (C : Config σ) : List (Fin σ.k) :=
  (List.finRange σ.k).filter fun i => FlagSet.acts C.agents[i].flags != .never

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

/-- The agents that take their next event, among the eligible ones, and the scheduler's effect.
With no eligible agent, the step idles without asking the scheduler. -/
def schedule (ts : TState σ.S) (C : Config σ) : ND (List (Fin σ.k) × Effect σ) :=
  if C.eligible.isEmpty then pure ([], Effect.none) else do
    let s ← m.scheduler.schedule ts C
    pure (C.eligible.filter s.activate, s.effect)

/-- The instants of the next event of agent `i`. -/
def event (C : Config σ) (i : Fin σ.k) : List Instant := m.scheduler.events.getD C.agents[i].phase []

/-- The scheduled agents whose event includes Look. -/
def lookers (C : Config σ) (active : List (Fin σ.k)) : List (Fin σ.k) :=
  active.filter fun i => (m.event C i).contains .look

/-- Each agent's decision: from its Look in this step, or pending from an earlier one. -/
def decisions (C : Config σ) (looked : Fin σ.k → Decision σ) : Fin σ.k → Decision σ :=
  fun j => if (m.event C j).contains .look then looked j else C.agents[j].pending.getD (looked j)

/-- The decisions taking effect at instant `x`: those of the scheduled agents whose event includes it. -/
def taking (act0 : σ.A) (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) (x : Instant) :
    Fin σ.k → Decision σ :=
  fun j => if active.contains j && (m.event C j).contains x then ds j else Decision.idle C.agents[j] act0

/-- The scheduled agents take their event: the next one of their cycle, keeping their decision
until its last. -/
def advance (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) : Config σ :=
  { C with agents := Vector.ofFn fun i =>
      let a := C.agents[i]
      if active.contains i then
        let p := (a.phase + 1) % m.scheduler.events.length
        { a with phase := p, pending := if p = 0 then none else some (ds i) }
      else a }

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

/-- The product, over the agents that look, of their decisions. -/
def decideAll (act0 : σ.A) (ts : TState σ.S) (C : Config σ) (active : List (Fin σ.k)) : ND (Fin σ.k → Decision σ) :=
  active.foldlM (fun ds i => do
      let d ← m.options act0 ts C i
      pure fun j => if j = i then d else ds j)
    (fun j => Decision.idle C.agents[j] act0)

/-- One step, with the agents that take an event. `act0` is the default value of the actions. -/
def roundA (act0 : σ.A) (C : Config σ) : ND (List (Fin σ.k) × Config σ) := do
  let ts ← chooseIfMany "edges" m.tstates
  let e1 ← parallel (m.components.map fun c => c.beforeLook ts) C
  let s ← m.schedule ts (C.apply e1)
  let C2 := (C.apply e1).apply s.2
  let looked ← m.decideAll act0 ts C2 (m.lookers C2 s.1)
  let ds := m.decisions C2 looked
  let dc := m.taking act0 C2 s.1 ds .compute
  let dm := m.taking act0 C2 s.1 ds .move
  let e2 ← parallel (m.components.map fun c D => c.onCompute ts D dc) C2
  let C3 := computeAll (C2.apply e2) dc
  let e3 ← parallel (m.components.map fun c D => c.beforeMove ts D dm) C3
  let C4 := moveAll ts (C3.apply e3) dm
  let e4 ← parallel (m.components.map fun c => c.afterMove ts) C4
  pure (s.1, m.advance (C4.apply e4) s.1 ds)

/-- The step relation, with witnesses. -/
def Step (act0 : σ.A) (C : Config σ) (w : Witness) (C' : Config σ) : Prop :=
  ∃ active, (w, (active, C')) ∈ m.roundA act0 C

end Model
end Simulant
