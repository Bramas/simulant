/-
Common Lean translation target for the syntax proposals in `docs/syntax/`.

This file is what a generator would emit for the running example
(emerging black hole on a ring, FSYNC, crash-stop faults, collocated public
state), written by hand and checked with plain Lean 4 (no Mathlib):

    lean docs/syntax/lean/Target.lean

It follows the component design of Option A: every component adds state and
raises flags at two hook points of the round, `beforeLook` and `afterMove`.

Simplifications with respect to the real generator:
* `Choice α` is a set, written `α → Prop`. The interpreter enumerates it.
* Collections of perceived states are `List`s. The generator would use
  Mathlib's `Multiset`, so that no ordering of anonymous agents is visible.
* Components are written directly over the composed configuration. The
  frontend checks that each one writes only the fields it owns.
-/

/-! ## Nondeterminism -/

def Choice (α : Type) : Type := α → Prop

namespace Choice
def pure' (a : α) : Choice α := fun b => b = a
def bind' (c : Choice α) (f : α → Choice β) : Choice β := fun b => ∃ a, c a ∧ f a b
/-- Adversary choice of any value satisfying `p`. -/
def such (p : α → Prop) : Choice α := p
instance : Monad Choice where
  pure := pure'
  bind := bind'

theorem pure_bind (a : α) (f : α → Choice β) : (pure a >>= f) = f a :=
  funext fun _ => propext ⟨fun ⟨_, hx, h⟩ => hx ▸ h, fun h => ⟨a, rfl, h⟩⟩
end Choice

/-! ## Topology: oriented ring -/

structure Ring where
  N : Nat
  three_le : 3 ≤ N

abbrev Node (R : Ring) := Fin R.N

def Ring.succ (R : Ring) (n : Node R) : Node R :=
  ⟨(n.val + 1) % R.N, Nat.mod_lt _ (by have := R.three_le; omega)⟩

def Ring.pred (R : Ring) (n : Node R) : Node R :=
  ⟨(n.val + R.N - 1) % R.N, Nat.mod_lt _ (by have := R.three_le; omega)⟩

inductive Move where
  | stay | cw | ccw

def Ring.target (R : Ring) (p : Node R) : Move → Node R
  | .stay => p
  | .cw   => R.succ p
  | .ccw  => R.pred p

/-! ## Flags

Generated from `flag crashed visible, acts never` and
`flag dead hidden, acts never`. Flags are only ever raised, so merging is `||`. -/

structure Flags where
  crashed : Bool := false
  dead    : Bool := false

def Flags.merge (f g : Flags) : Flags :=
  { crashed := f.crashed || g.crashed, dead := f.dead || g.dead }

/-! ## Configurations -/

structure AgentRec (R : Ring) (Pub Mem : Type) where
  pos   : Node R
  pub   : Pub
  mem   : Mem
  flags : Flags

namespace AgentRec
variable {R : Ring} {Pub Mem : Type}
/-- No flag is raised. -/
def correct (r : AgentRec R Pub Mem) : Bool := !r.flags.crashed && !r.flags.dead
/-- No hidden flag is raised. -/
def present (r : AgentRec R Pub Mem) : Bool := !r.flags.dead
end AgentRec

/-- World fields of all components. Here, only `BlackHole` owns fields. -/
structure World (R : Ring) where
  site   : Node R   -- hidden, fixed for the execution
  active : Bool     -- hidden

structure Config (R : Ring) (k : Nat) (Pub Mem : Type) where
  agents : Fin k → AgentRec R Pub Mem
  world  : World R

variable {R : Ring} {k : Nat} {Pub Mem : Type}

/-! ## Sensors

A sensor is an ordinary function. Its specification is a theorem about its
definition, so the "view property" comes for free. -/

def otherStates (C : Config R k Pub Mem) (a : Fin k) : List Pub :=
  (List.finRange k).filterMap fun b =>
    if b ≠ a ∧ (C.agents b).present = true ∧ (C.agents b).pos = (C.agents a).pos
    then some (C.agents b).pub else none

theorem mem_otherStates (C : Config R k Pub Mem) (a : Fin k) (s : Pub) :
    s ∈ otherStates C a ↔
      ∃ b, b ≠ a ∧ (C.agents b).present = true ∧
           (C.agents b).pos = (C.agents a).pos ∧ (C.agents b).pub = s := by
  simp [otherStates, List.mem_filterMap, and_assoc]

/-- What an unknown-size algorithm receives. -/
structure Sensors (Pub : Type) where
  otherStates : List Pub

/-- What a known-size algorithm receives. -/
structure SensorsN (Pub : Type) extends Sensors Pub where
  ringSize : Nat

structure Decision (Pub Mem : Type) where
  mem  : Mem
  pub  : Pub
  move : Move

abbrev Algorithm (S Pub Mem : Type) := Mem → S → Decision Pub Mem

/-- Forgetting the ring size: an unknown-size algorithm runs unchanged in the
known-size model. -/
def Algorithm.forgetSize (alg : Algorithm (Sensors Pub) Pub Mem) :
    Algorithm (SensorsN Pub) Pub Mem :=
  fun m s => alg m s.toSensors

/-! ## Effects and components -/

/-- What a hook may do: raise flags on agents, and update the world fields
its component owns. -/
structure Effect (R : Ring) (k : Nat) where
  raise : Fin k → Flags
  world : World R → World R

def Effect.nothing : Effect R k := { raise := fun _ => {}, world := id }

/-- Merging the effects of two hooks run on the same snapshot. -/
def Effect.combine (e f : Effect R k) : Effect R k :=
  { raise := fun a => (e.raise a).merge (f.raise a), world := f.world ∘ e.world }

def Config.apply (C : Config R k Pub Mem) (e : Effect R k) : Config R k Pub Mem :=
  { agents := fun a => { C.agents a with flags := (C.agents a).flags.merge (e.raise a) },
    world  := e.world C.world }

abbrev Hook (R : Ring) (k : Nat) (Pub Mem : Type) := Config R k Pub Mem → Choice (Effect R k)

def Hook.nothing : Hook R k Pub Mem := fun _ => pure Effect.nothing

structure Component (R : Ring) (k : Nat) (Pub Mem : Type) where
  beforeLook : Hook R k Pub Mem := Hook.nothing
  afterMove  : Hook R k Pub Mem := Hook.nothing

/-- All hooks of one hook point read the same snapshot; their effects are merged. -/
def parallel (C : Config R k Pub Mem) : List (Hook R k Pub Mem) → Choice (Effect R k)
  | []      => pure Effect.nothing
  | h :: hs => do
      let e ← h C
      let r ← parallel C hs
      pure (e.combine r)

/-! ## Components of the running example -/

inductive HolePolicy where
  | none | initiallyPresent | mayEmerge

/-- Persistent activation: once active, the hole stays active. -/
def nextActive : HolePolicy → Bool → Choice Bool
  | .mayEmerge, false => Choice.such fun _ => True
  | _, b             => pure b

def BlackHole (policy : HolePolicy) : Component R k Pub Mem where
  afterMove C := do
    let active ← nextActive policy C.world.active
    pure { raise := fun a =>
             { dead := (C.agents a).present && active && (C.agents a).pos == C.world.site },
           world := fun w => { w with active } }

def crashedCount (C : Config R k Pub Mem) : Nat :=
  ((List.finRange k).filter fun a => (C.agents a).flags.crashed).length

def CrashStop (f : Nat) : Component R k Pub Mem where
  beforeLook C := do
    let S ← Choice.such fun (S : Fin k → Bool) =>
      (∀ a, S a = true → (C.agents a).correct = true) ∧
      crashedCount C + ((List.finRange k).filter S).length ≤ f
    pure { raise := fun a => { crashed := S a }, world := id }

/-! ## The round (FSYNC, rigid ring movement) -/

def Round.fsync (cs : List (Component R k Pub Mem))
    (alg : Algorithm (Sensors Pub) Pub Mem)
    (C : Config R k Pub Mem) : Choice (Config R k Pub Mem) := do
  -- hook point 1
  let e ← parallel C (cs.map (·.beforeLook))
  let C := C.apply e
  -- look and compute: every correct agent
  let dec := fun a => alg (C.agents a).mem { otherStates := otherStates C a }
  -- move
  let C : Config R k Pub Mem :=
    { C with agents := fun a =>
        if (C.agents a).correct then
          { C.agents a with pos := R.target (C.agents a).pos (dec a).move,
                            pub := (dec a).pub, mem := (dec a).mem }
        else C.agents a }
  -- hook point 2
  let e ← parallel C (cs.map (·.afterMove))
  pure (C.apply e)

/-- The family: no faults is the empty list of fault components. -/
def blackHoleRing (policy : HolePolicy) (faults : List (Component R k Pub Mem)) :
    List (Component R k Pub Mem) :=
  BlackHole policy :: faults

/-! ## Basic facts about effects -/

@[simp] theorem Flags.merge_empty (f : Flags) : f.merge {} = f := by
  cases f; simp [Flags.merge]

@[simp] theorem Config.apply_nothing (C : Config R k Pub Mem) :
    C.apply Effect.nothing = C := by
  simp [Config.apply, Effect.nothing]

@[simp] theorem Effect.combine_nothing (e : Effect R k) : e.combine Effect.nothing = e := by
  cases e; simp [Effect.combine, Effect.nothing]

/-- Merging is order-independent when the world updates commute, which
field ownership guarantees. -/
theorem Effect.combine_comm (e f : Effect R k) (h : e.world ∘ f.world = f.world ∘ e.world) :
    e.combine f = f.combine e := by
  simp only [Effect.combine, Flags.merge, h, Bool.or_comm]

theorem parallel_nothing (C : Config R k Pub Mem) (hs : List (Hook R k Pub Mem))
    (h : ∀ g ∈ hs, g = Hook.nothing) : parallel C hs = pure Effect.nothing := by
  induction hs with
  | nil => rfl
  | cons g hs ih =>
    simp only [List.mem_cons, forall_eq_or_imp] at h
    obtain ⟨rfl, h⟩ := h
    simp only [parallel, Hook.nothing, Choice.pure_bind, ih h, Effect.combine_nothing]

/-- A list of hooks that may all do nothing may, together, do nothing. Appending
such hooks keeps every effect of the others. -/
theorem parallel_append (C : Config R k Pub Mem) (hs gs : List (Hook R k Pub Mem))
    (hg : ∀ g ∈ gs, g C Effect.nothing) (e : Effect R k) (he : parallel C hs e) :
    parallel C (hs ++ gs) e := by
  induction hs generalizing e with
  | nil =>
    cases he
    induction gs with
    | nil => rfl
    | cons g gs ih =>
      simp only [List.mem_cons, forall_eq_or_imp] at hg
      exact ⟨Effect.nothing, hg.1, Effect.nothing, ih hg.2, rfl⟩
  | cons h hs ih =>
    obtain ⟨e1, h1, r, hr, rfl⟩ := he
    exact ⟨e1, h1, r, ih r hr, rfl⟩

/-! ## Update properties are theorems about the round -/

/-- Crash property, for any list of components: hooks cannot move agents, and
movement is guarded by `correct`. -/
theorem crashed_stays {cs alg} {C t : Config R k Pub Mem}
    (h : Round.fsync cs alg C t) (a : Fin k) (hc : (C.agents a).flags.crashed = true) :
    (t.agents a).pos = (C.agents a).pos := by
  simp only [Round.fsync, bind, Choice.bind', pure, Choice.pure'] at h
  obtain ⟨e, -, e', -, rfl⟩ := h
  simp [Config.apply, AgentRec.correct, Flags.merge, hc]

/-- Lethality, for the black hole composed with fault components that do not
use the `afterMove` hook. -/
theorem lethal {policy faults alg} {C t : Config R k Pub Mem}
    (hf : ∀ c ∈ faults, c.afterMove = Hook.nothing)
    (h : Round.fsync (blackHoleRing policy faults) alg C t) (a : Fin k)
    (hpos : (t.agents a).pos = t.world.site) (hact : t.world.active = true) :
    (t.agents a).flags.dead = true := by
  have hn : ∀ g ∈ faults.map (·.afterMove), g = Hook.nothing := by
    simpa using hf
  simp only [Round.fsync, blackHoleRing, List.map_cons, parallel, parallel_nothing _ _ hn,
    BlackHole, bind, Choice.bind', pure, Choice.pure'] at h
  obtain ⟨e, -, e2, ⟨e1, ⟨act, -, rfl⟩, r, rfl, rfl⟩, rfl⟩ := h
  simp_all [Config.apply, Flags.merge, AgentRec.present, Effect.combine, Effect.nothing]

/-- Generalization by adding components: if every added component may do
nothing, every step of the smaller model is a step of the larger one. -/
theorem fsync_le_append {cs extra alg} {C t : Config R k Pub Mem}
    (hb : ∀ c ∈ extra, c.beforeLook C Effect.nothing)
    (ha : ∀ c ∈ extra, ∀ D, c.afterMove D Effect.nothing)
    (h : Round.fsync cs alg C t) : Round.fsync (cs ++ extra) alg C t := by
  simp only [Round.fsync, bind, Choice.bind', pure, Choice.pure', List.map_append] at h ⊢
  obtain ⟨e, he, e', he', rfl⟩ := h
  refine ⟨e, parallel_append _ _ _ (by simpa using hb) e he, e',
    parallel_append _ _ _ (by simpa using fun c hc => ha c hc _) e' he', rfl⟩

/-- Refinement edge: the fault-free model is included in the crash-stop model,
as long as no agent has crashed so far. -/
theorem none_le_crashStop {policy alg} (f : Nat) {C t : Config R k Pub Mem}
    (hC : ∀ a, (C.agents a).flags.crashed = false)
    (h : Round.fsync (blackHoleRing policy []) alg C t) :
    Round.fsync (blackHoleRing policy [CrashStop f]) alg C t := by
  have hb : (CrashStop f : Component R k Pub Mem).beforeLook C Effect.nothing := by
    have hz : ∀ l : List (Fin k), (l.filter fun _ => false).length = 0 := by
      intro l; induction l with
      | nil => rfl
      | cons x xs ih => simp [List.filter, ih]
    refine ⟨fun _ => false, ⟨by simp, ?_⟩, rfl⟩
    simp [crashedCount, hC, hz]
  exact fsync_le_append (cs := blackHoleRing policy []) (extra := [CrashStop f])
    (by simpa using hb) (by simp [CrashStop, Hook.nothing, pure, Choice.pure']) h

/-! ## A third hook point is a conservative extension

A more general family can add a hook point, here `afterLook` (between the
decision and the move). Every two-hook component is a three-hook component that
does nothing there, and the two rounds then coincide: models written for the
two-hook round are untouched, and inclusions proved for them carry over. -/

structure Component3 (R : Ring) (k : Nat) (Pub Mem : Type)
    extends Component R k Pub Mem where
  afterLook : Hook R k Pub Mem := Hook.nothing

def Component.lift (c : Component R k Pub Mem) : Component3 R k Pub Mem :=
  { c with }

def Round.fsync3 (cs : List (Component3 R k Pub Mem))
    (alg : Algorithm (Sensors Pub) Pub Mem)
    (C : Config R k Pub Mem) : Choice (Config R k Pub Mem) := do
  let e ← parallel C (cs.map (·.beforeLook))
  let C := C.apply e
  let dec := fun a => alg (C.agents a).mem { otherStates := otherStates C a }
  -- hook point 3: may raise flags after the decision, before the move
  let e ← parallel C (cs.map (·.afterLook))
  let C := C.apply e
  let C : Config R k Pub Mem :=
    { C with agents := fun a =>
        if (C.agents a).correct then
          { C.agents a with pos := R.target (C.agents a).pos (dec a).move,
                            pub := (dec a).pub, mem := (dec a).mem }
        else C.agents a }
  let e ← parallel C (cs.map (·.afterMove))
  pure (C.apply e)

theorem fsync3_lift (cs : List (Component R k Pub Mem))
    (alg : Algorithm (Sensors Pub) Pub Mem) (C : Config R k Pub Mem) :
    Round.fsync3 (cs.map Component.lift) alg C = Round.fsync cs alg C := by
  have hn : ∀ D, parallel D (cs.map ((·.afterLook) ∘ Component.lift)) = pure Effect.nothing :=
    fun D => parallel_nothing D _ (by simp [Component.lift])
  simp only [Round.fsync3, Round.fsync, List.map_map]
  simp only [hn, Choice.pure_bind, Config.apply_nothing]
  rfl

/-! ## Frames: the adversary's choice of each agent's local orientation

A frame is chosen once per activation and shared by every sensor of that
activation and by the agent's move, so that what the agent sees and where it
goes are consistent. On a ring, a frame is whether the local view is mirrored.
The algorithm's `cw` is its *local* clockwise. -/

def Move.reflect (mirror : Bool) (m : Move) : Move :=
  if mirror then (match m with | .stay => .stay | .cw => .ccw | .ccw => .cw) else m

@[simp] theorem Move.reflect_false (m : Move) : Move.reflect false m = m := by
  simp [Move.reflect]

/-- The node an agent at `p` sees at local offset `i`. -/
def Ring.offset (R : Ring) (p : Node R) (mirror : Bool) (i : Fin R.N) : Node R :=
  if mirror then ⟨(p.val + R.N - i.val) % R.N, Nat.mod_lt _ (by have := R.three_le; omega)⟩
  else ⟨(p.val + i.val) % R.N, Nat.mod_lt _ (by have := R.three_le; omega)⟩

/-- View/move consistency: the node seen at local offset 1 is the node reached
by moving `cw` in the same frame. -/
theorem target_reflect_cw (p : Node R) (mirror : Bool) :
    R.target p (Move.reflect mirror .cw) = R.offset p mirror ⟨1, by have := R.three_le; omega⟩ := by
  cases mirror <;> simp [Move.reflect, Ring.target, Ring.offset, Ring.succ, Ring.pred]

/-- Full-ring presence sensor: which local offsets are occupied (states not visible). -/
def ringPresence (C : Config R k Pub Mem) (a : Fin k) (mirror : Bool) : Fin R.N → Bool :=
  fun i => (List.finRange k).any fun b =>
    (C.agents b).present && (C.agents b).pos == R.offset (C.agents a).pos mirror i

theorem ringPresence_spec (C : Config R k Pub Mem) (a : Fin k) (mirror : Bool) (i : Fin R.N) :
    ringPresence C a mirror i = true ↔
      ∃ b, (C.agents b).present = true ∧ (C.agents b).pos = R.offset (C.agents a).pos mirror i := by
  simp [ringPresence]

/-- How the adversary may choose frames: one per model, like movement. -/
abbrev FrameModel (R : Ring) (k : Nat) (Pub Mem : Type) := Config R k Pub Mem → Fin k → Choice Bool

/-- Common chirality: every frame is the identity. -/
def Frames.common : FrameModel R k Pub Mem := fun _ _ => pure false
/-- No chirality: the adversary may mirror any view at any activation. -/
def Frames.dynamicReflection : FrameModel R k Pub Mem := fun _ _ => Choice.such fun _ => True

/-- The round with a frame step. `sense` builds the algorithm's input from the
configuration, the agent and its frame. -/
def Round.fsyncF {S : Type} (cs : List (Component R k Pub Mem)) (frame : FrameModel R k Pub Mem)
    (sense : Config R k Pub Mem → Fin k → Bool → S) (alg : Algorithm S Pub Mem)
    (C : Config R k Pub Mem) : Choice (Config R k Pub Mem) := do
  let e ← parallel C (cs.map (·.beforeLook))
  let C := C.apply e
  -- frames: chosen once per activation
  let φ ← Choice.such fun φ : Fin k → Bool => ∀ a, frame C a (φ a)
  let dec := fun a => alg (C.agents a).mem (sense C a (φ a))
  let C : Config R k Pub Mem :=
    { C with agents := fun a =>
        if (C.agents a).correct then
          { C.agents a with pos := R.target (C.agents a).pos (Move.reflect (φ a) (dec a).move),
                            pub := (dec a).pub, mem := (dec a).mem }
        else C.agents a }
  let e ← parallel C (cs.map (·.afterMove))
  pure (C.apply e)

theorem common_frames :
    (Choice.such fun φ : Fin k → Bool => ∀ a, (Frames.common : FrameModel R k Pub Mem) C a (φ a)) =
      pure fun _ => false :=
  funext fun _ => propext ⟨fun h => funext h, fun h _ => h ▸ rfl⟩

/-- Adding the frame step is conservative: with common chirality, the round
with frames is the round of the previous sections, so their theorems carry over. -/
theorem fsyncF_common (cs : List (Component R k Pub Mem))
    (alg : Algorithm (Sensors Pub) Pub Mem) (C : Config R k Pub Mem) :
    Round.fsyncF cs Frames.common (fun C a _ => { otherStates := otherStates C a }) alg C =
      Round.fsync cs alg C := by
  simp only [Round.fsyncF, Round.fsync, common_frames, Choice.pure_bind, Move.reflect_false]

/-- More frames for the adversary gives a more general model. -/
theorem fsyncF_mono {S : Type} {cs : List (Component R k Pub Mem)} {f g : FrameModel R k Pub Mem}
    {sense : Config R k Pub Mem → Fin k → Bool → S} {alg : Algorithm S Pub Mem}
    {C t : Config R k Pub Mem}
    (hfg : ∀ D a x, f D a x → g D a x) (h : Round.fsyncF cs f sense alg C t) :
    Round.fsyncF cs g sense alg C t := by
  simp only [Round.fsyncF, bind, Choice.bind', pure, Choice.pure'] at h ⊢
  obtain ⟨e, he, φ, hφ, rest⟩ := h
  exact ⟨e, he, φ, fun a => hfg _ a _ (hφ a), rest⟩

/-- Common chirality is a special case of dynamic reflection. -/
theorem common_le_dynamic {S : Type} {cs : List (Component R k Pub Mem)}
    {sense : Config R k Pub Mem → Fin k → Bool → S} {alg : Algorithm S Pub Mem}
    {C t : Config R k Pub Mem}
    (h : Round.fsyncF cs Frames.common sense alg C t) :
    Round.fsyncF cs Frames.dynamicReflection sense alg C t :=
  fsyncF_mono (fun _ _ _ _ => trivial) h

/-! ## Option C: one phase generated from rules

`rule rigidMove: ∀ a, correct a ⇒ a.pos' = target(a.pos, a.decision.move)`
with `agent pos : Node default unchanged`. In Option C the decision computed
in the look phase is stored on the agent until the move phase. -/

structure PhaseAgent (R : Ring) where
  agent    : AgentRec R Pub Mem
  decision : Move

def movePhase (agents : Fin k → PhaseAgent (Pub := Pub) (Mem := Mem) R) :
    Fin k → PhaseAgent (Pub := Pub) (Mem := Mem) R :=
  fun a =>
    if (agents a).agent.correct then
      { agents a with agent := { (agents a).agent with
          pos := R.target (agents a).agent.pos (agents a).decision } }
    else agents a

/-- The rule, as a theorem about the generated phase. -/
theorem rigidMove (agents : Fin k → PhaseAgent (Pub := Pub) (Mem := Mem) R) (a : Fin k)
    (h : (agents a).agent.correct = true) :
    (movePhase agents a).agent.pos = R.target (agents a).agent.pos (agents a).decision := by
  simp [movePhase, h]

/-- Not written by the author: a consequence of `default unchanged`. -/
theorem crashedStays (agents : Fin k → PhaseAgent (Pub := Pub) (Mem := Mem) R) (a : Fin k)
    (h : (agents a).agent.flags.crashed = true) :
    (movePhase agents a).agent.pos = (agents a).agent.pos := by
  simp [movePhase, AgentRec.correct, h]
