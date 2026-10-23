import Simulant.Lemmas
import Simulant.Views

/-!
# A round built from equivariant pieces is equivariant (docs/core-redesign.md, section 7)

A configuration map `g` moves every agent's position and transforms the world (an automorphism
of the space moves positions and the positions stored in the world). If the agents' decisions
on the mapped configuration are the mapped decisions, the components' hooks do not see `g`, the
world updates of effects commute with `g`, and `g` is an automorphism of the space whose edges
stay present, then `g` maps steps to steps with the same witness.

`options_app` gives the first hypothesis for port-based frames, from the space: an automorphism
maps each view onto the view of the image, so the presentations are the same and only the
positions behind the locations move.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

structure CfgMap (σ : Sig) where
  pos : σ.S.Pos → σ.S.Pos
  world : σ.W → σ.W

/-- A decision, with its target moved by `g`. -/
def CfgMap.dec (g : CfgMap σ) (d : Decision σ) : Decision σ := { d with target := g.pos d.target }

/-- Positions move, and so do the targets of pending decisions. -/
def CfgMap.app (g : CfgMap σ) (C : Config σ) : Config σ :=
  { agents := C.agents.map fun a => { a with pos := g.pos a.pos, pending := a.pending.map g.dec }, world := g.world C.world }

omit [FlagSet σ.F] in
@[simp] theorem CfgMap.app_agent (g : CfgMap σ) (C : Config σ) (i : Fin σ.k) :
    (g.app C).agents[i] = { C.agents[i] with pos := g.pos C.agents[i].pos, pending := C.agents[i].pending.map g.dec } := by
  simp [CfgMap.app]

omit [FlagSet σ.F] in
@[simp] theorem CfgMap.app_agent' (g : CfgMap σ) (C : Config σ) (i : Nat) (h : i < σ.k) :
    (g.app C).agents[i] = { C.agents[i] with pos := g.pos C.agents[i].pos, pending := C.agents[i].pending.map g.dec } := by
  simp [CfgMap.app]

omit [FlagSet σ.F] in
@[simp] theorem CfgMap.app_world (g : CfgMap σ) (C : Config σ) : (g.app C).world = g.world C.world := rfl

/-- The world updates of `e` commute with `g`. -/
def CfgMap.Commutes (g : CfgMap σ) (e : Effect σ) : Prop := ∀ w, e.world (g.world w) = g.world (e.world w)

theorem CfgMap.apply_app (g : CfgMap σ) (C : Config σ) (e : Effect σ) (h : g.Commutes e) :
    (g.app C).apply e = g.app (C.apply e) := by
  cases C
  simp only [Config.apply, CfgMap.app, Config.mk.injEq]
  refine ⟨?_, h _⟩
  apply Vector.ext
  intro i hi
  simp

theorem parallel_app (g : CfgMap σ) (C : Config σ) :
    ∀ (hooks : List (Config σ → ND (Effect σ))), (∀ hk ∈ hooks, hk (g.app C) = hk C) →
      parallel hooks (g.app C) = parallel hooks C
  | [], _ => rfl
  | hk :: hs, h => by
    simp only [parallel]
    rw [h hk List.mem_cons_self, parallel_app g C hs (fun hk' hm => h hk' (List.mem_cons_of_mem _ hm))]

/-- Hooks that do not see `g`, possibly with different arguments, merge to the same effects. -/
theorem parallel_map_app (g : CfgMap σ) (C : Config σ) (f f' : Component σ → Config σ → ND (Effect σ)) :
    ∀ (cs : List (Component σ)), (∀ c ∈ cs, f' c (g.app C) = f c C) →
      parallel (cs.map f') (g.app C) = parallel (cs.map f) C
  | [], _ => rfl
  | c :: cs, h => by
    simp only [List.map_cons, parallel]
    rw [h c List.mem_cons_self, parallel_map_app g C f f' cs (fun c' hm => h c' (List.mem_cons_of_mem _ hm))]

theorem parallel_commutes (g : CfgMap σ) (C : Config σ) :
    ∀ (hooks : List (Config σ → ND (Effect σ))), (∀ hk ∈ hooks, ∀ e, ND.Can (hk C) e → g.Commutes e) →
      ∀ e, ND.Can (parallel hooks C) e → g.Commutes e
  | [], _, e, he => by
    rw [ND.can_pure.1 he]
    intro w; rfl
  | hk :: hs, h, e, he => by
    simp only [parallel, ND.can_bind, ND.can_pure] at he
    obtain ⟨e1, h1, r, hr, rfl⟩ := he
    have c1 := h hk List.mem_cons_self e1 h1
    have cr := parallel_commutes g C hs (fun hk' hm => h hk' (List.mem_cons_of_mem _ hm)) r hr
    intro w
    show r.world (e1.world (g.world w)) = g.world (r.world (e1.world w))
    rw [c1, cr]

namespace Model

variable (m : Model σ) (act0 : σ.A)

/-- If each agent's decisions on the mapped configuration include the mapped decisions, so do
their products. -/
theorem decideAll_app (g : CfgMap σ) (ts : TState σ.S) (C : Config σ)
    (hopt : ∀ i w d, (w, d) ∈ m.options act0 ts C i → (w, g.dec d) ∈ m.options act0 ts (g.app C) i) :
    ∀ (active : List (Fin σ.k)) (init : Fin σ.k → Decision σ) w ds,
      (w, ds) ∈ active.foldlM (fun ds i => do
          let d ← m.options act0 ts C i
          pure fun j => if j = i then d else ds j) init →
      (w, fun j => g.dec (ds j)) ∈ active.foldlM (fun ds i => do
          let d ← m.options act0 ts (g.app C) i
          pure fun j => if j = i then d else ds j) (fun j => g.dec (init j))
  | [], init, w, ds, h => by
    rw [List.foldlM_nil, ND.mem_pure] at h ⊢
    obtain ⟨rfl, rfl⟩ := h
    exact ⟨rfl, rfl⟩
  | i :: rest, init, w, ds, h => by
    rw [List.foldlM_cons, ND.mem_bind] at h ⊢
    obtain ⟨w₁, acc, w₂, hacc, hrest, rfl⟩ := h
    rw [ND.mem_bind] at hacc
    obtain ⟨w₃, d, w₄, hd, hp, rfl⟩ := hacc
    rw [ND.mem_pure] at hp
    obtain ⟨rfl, rfl⟩ := hp
    refine ⟨w₃ ++ [], fun j => g.dec (if j = i then d else init j), w₂, ?_, ?_, rfl⟩
    · rw [ND.mem_bind]
      exact ⟨w₃, g.dec d, [], hopt i w₃ d hd, by rw [ND.mem_pure]; exact ⟨rfl, funext fun j => by split <;> rfl⟩, rfl⟩
    · exact decideAll_app g ts C hopt rest _ w₂ ds hrest

omit [FlagSet σ.F] in
theorem dec_idle (g : CfgMap σ) (C : Config σ) (j : Fin σ.k) :
    g.dec (Decision.idle C.agents[j] act0) = Decision.idle (g.app C).agents[j] act0 := by
  simp [CfgMap.dec, Decision.idle]

theorem moveAll_app (g : CfgMap σ) (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ)
    (hinj : ∀ p q, g.pos p = g.pos q → p = q)
    (hnbr : ∀ p, σ.S.neighbors (g.pos p) = (σ.S.neighbors p).map g.pos)
    (hedge : ∀ p q, σ.S.edgePresent ts (g.pos p) (g.pos q) = σ.S.edgePresent ts p q) :
    moveAll ts (g.app C) (fun j => g.dec (ds j)) = g.app (moveAll ts C ds) := by
  have heq : ∀ p q, (g.pos p == g.pos q) = (p == q) := fun p q => by
    by_cases h : p = q
    · subst h; simp
    · have : g.pos p ≠ g.pos q := fun e => h (hinj _ _ e)
      rw [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]
  have hcon : ∀ p q, (σ.S.neighbors (g.pos p)).contains (g.pos q) = (σ.S.neighbors p).contains q := fun p q => by
    rw [hnbr]
    induction σ.S.neighbors p with
    | nil => rfl
    | cons x xs ih => simp only [List.map_cons, List.contains_cons, ih, heq]
  have hmove : ∀ (a : Agent σ) (d : Decision σ),
      ((g.dec d).target != g.pos a.pos && (σ.S.neighbors (g.pos a.pos)).contains (g.dec d).target &&
        σ.S.edgePresent ts (g.pos a.pos) (g.dec d).target) =
      (d.target != a.pos && (σ.S.neighbors a.pos).contains d.target && σ.S.edgePresent ts a.pos d.target) := by
    intro a d
    simp only [CfgMap.dec, bne, heq, hcon, hedge]
  obtain ⟨agents, world⟩ := C
  unfold moveAll CfgMap.app
  congr 1
  apply Vector.ext
  intro i hi
  simp only [Vector.getElem_ofFn, Vector.getElem_map, Fin.getElem_fin]
  rw [hmove]
  by_cases h1 : ((ds ⟨i, hi⟩).decided && FlagSet.acts agents[i].flags != Acts.never) = true
  · have h1' : ((g.dec (ds ⟨i, hi⟩)).decided && FlagSet.acts agents[i].flags != Acts.never) = true := h1
    simp only [h1, h1', ite_true]
    split <;> rfl
  · have h1' : ¬((g.dec (ds ⟨i, hi⟩)).decided && FlagSet.acts agents[i].flags != Acts.never) = true := h1
    simp only [h1, h1', ite_false, Bool.false_eq_true]

omit [FlagSet σ.F] in
theorem dec_eq (g : CfgMap σ) (d : Decision σ) : (g.dec d).decided = d.decided ∧ (g.dec d).pub = d.pub ∧ (g.dec d).mem = d.mem :=
  ⟨rfl, rfl, rfl⟩

theorem eligible_app (g : CfgMap σ) (C : Config σ) : (g.app C).eligible = C.eligible := by
  simp [Config.eligible]

omit [FlagSet σ.F] in
theorem event_app (g : CfgMap σ) (C : Config σ) (i : Fin σ.k) : m.event (g.app C) i = m.event C i := by
  simp [Model.event]

omit [FlagSet σ.F] in
theorem lookers_app (g : CfgMap σ) (C : Config σ) (active : List (Fin σ.k)) :
    m.lookers (g.app C) active = m.lookers C active := by
  simp only [Model.lookers, event_app]

omit [FlagSet σ.F] in
theorem decisions_app (g : CfgMap σ) (C : Config σ) (looked : Fin σ.k → Decision σ) :
    m.decisions (g.app C) (fun j => g.dec (looked j)) = fun j => g.dec (m.decisions C looked j) := by
  funext j
  simp only [Model.decisions, event_app]
  split
  · rfl
  · simp only [CfgMap.app_agent]
    cases C.agents[j].pending <;> rfl

omit [FlagSet σ.F] in
theorem taking_app (g : CfgMap σ) (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) (x : Instant) :
    m.taking act0 (g.app C) active (fun j => g.dec (ds j)) x = fun j => g.dec (m.taking act0 C active ds x j) := by
  funext j
  simp only [Model.taking, event_app]
  split
  · rfl
  · exact (dec_idle act0 g C j).symm

theorem schedule_app (g : CfgMap σ) (hsch : ∀ ts C, m.scheduler.schedule ts (g.app C) = m.scheduler.schedule ts C)
    (ts : TState σ.S) (C : Config σ) : m.schedule ts (g.app C) = m.schedule ts C := by
  simp only [Model.schedule, eligible_app, hsch]

theorem schedule_commutes (g : CfgMap σ)
    (hcs : ∀ ts C s, ND.Can (m.scheduler.schedule ts C) s → g.Commutes s.effect)
    (ts : TState σ.S) (C : Config σ) (s : List (Fin σ.k) × Effect σ) (h : ND.Can (m.schedule ts C) s) : g.Commutes s.2 := by
  unfold Model.schedule at h
  split at h
  · rw [ND.can_pure.1 h]; intro w; rfl
  · obtain ⟨s', hs', rfl⟩ := ND.can_map.1 h
    exact hcs ts C s' hs'

theorem computeAll_app (g : CfgMap σ) (C : Config σ) (ds : Fin σ.k → Decision σ) :
    computeAll (g.app C) (fun j => g.dec (ds j)) = g.app (computeAll C ds) := by
  obtain ⟨agents, world⟩ := C
  unfold computeAll CfgMap.app
  congr 1
  apply Vector.ext
  intro i hi
  simp only [Vector.getElem_ofFn, Vector.getElem_map, Fin.getElem_fin]
  by_cases h1 : ((ds ⟨i, hi⟩).decided && FlagSet.acts agents[i].flags != Acts.never) = true
  · have h1' : ((g.dec (ds ⟨i, hi⟩)).decided && FlagSet.acts agents[i].flags != Acts.never) = true := h1
    simp only [h1, h1', ite_true]
    rfl
  · have h1' : ¬((g.dec (ds ⟨i, hi⟩)).decided && FlagSet.acts agents[i].flags != Acts.never) = true := h1
    simp only [h1, h1', ite_false, Bool.false_eq_true]

omit [FlagSet σ.F] in
theorem advance_app (g : CfgMap σ) (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) :
    m.advance (g.app C) active (fun j => g.dec (ds j)) = g.app (m.advance C active ds) := by
  obtain ⟨agents, world⟩ := C
  unfold Model.advance CfgMap.app
  congr 1
  apply Vector.ext
  intro i hi
  simp only [Vector.getElem_ofFn, Vector.getElem_map, Fin.getElem_fin]
  split
  · split <;> rfl
  · rfl

/-- A step built from pieces that do not see `g` is equivariant under `g`, with the same witness. -/
theorem step_app (g : CfgMap σ)
    (hinj : ∀ p q, g.pos p = g.pos q → p = q)
    (hnbr : ∀ p, σ.S.neighbors (g.pos p) = (σ.S.neighbors p).map g.pos)
    (hedge : ∀ ts ∈ m.tstates, ∀ p q, σ.S.edgePresent ts (g.pos p) (g.pos q) = σ.S.edgePresent ts p q)
    (hopt : ∀ ts C i w d, (w, d) ∈ m.options act0 ts C i → (w, g.dec d) ∈ m.options act0 ts (g.app C) i)
    (hbl : ∀ c ∈ m.components, ∀ ts C, c.beforeLook ts (g.app C) = c.beforeLook ts C)
    (hoc : ∀ c ∈ m.components, ∀ ts C ds, c.onCompute ts (g.app C) (fun j => g.dec (ds j)) = c.onCompute ts C ds)
    (hbm : ∀ c ∈ m.components, ∀ ts C ds, c.beforeMove ts (g.app C) (fun j => g.dec (ds j)) = c.beforeMove ts C ds)
    (ham : ∀ c ∈ m.components, ∀ ts C, c.afterMove ts (g.app C) = c.afterMove ts C)
    (hsch : ∀ ts C, m.scheduler.schedule ts (g.app C) = m.scheduler.schedule ts C)
    (hcomm : ∀ c ∈ m.components, ∀ ts C ds e,
      (ND.Can (c.beforeLook ts C) e ∨ ND.Can (c.onCompute ts C ds) e ∨ ND.Can (c.beforeMove ts C ds) e ∨
        ND.Can (c.afterMove ts C) e) → g.Commutes e)
    (hcs : ∀ ts C s, ND.Can (m.scheduler.schedule ts C) s → g.Commutes s.effect)
    {C C' : Config σ} {w : Witness} (h : m.Step act0 C w C') : m.Step act0 (g.app C) w (g.app C') := by
  obtain ⟨act, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨w1, ts, _, hts, ⟨w2, e1, _, h1, ⟨w3, s, _, hs, ⟨w4, looked, _, hl, ⟨w5, e2, _, h2, ⟨w6, e3, _, h3,
    ⟨w7, e4, _, h4, ⟨rfl, heq⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩ := h
  obtain ⟨rfl, rfl⟩ := Prod.mk.inj heq
  -- The configurations and decisions of the original step.
  let C1 := C.apply e1
  let C2 := C1.apply s.2
  let ds := m.decisions C2 looked
  let dc := m.taking act0 C2 s.1 ds .compute
  let dm := m.taking act0 C2 s.1 ds .move
  let C3 := computeAll (C2.apply e2) dc
  let C4 := moveAll ts (C3.apply e3) dm
  -- The effects commute with `g`.
  have c1 := parallel_commutes g C _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts C dc e (Or.inl he)) e1 ⟨_, h1⟩
  have cs := m.schedule_commutes g hcs ts C1 s ⟨_, hs⟩
  have c2 := parallel_commutes g C2 _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts C2 dc e (Or.inr (Or.inl he))) e2 ⟨_, h2⟩
  have c3 := parallel_commutes g C3 _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts C3 dm e (Or.inr (Or.inr (Or.inl he)))) e3 ⟨_, h3⟩
  have c4 := parallel_commutes g C4 _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts C4 dm e (Or.inr (Or.inr (Or.inr he)))) e4 ⟨_, h4⟩
  -- Each stage on the mapped configuration is the mapped stage.
  have e1C : (g.app C).apply e1 = g.app C1 := CfgMap.apply_app g C e1 c1
  have e2C : (g.app C1).apply s.2 = g.app C2 := CfgMap.apply_app g C1 s.2 cs
  have hds : m.decisions (g.app C2) (fun j => g.dec (looked j)) = fun j => g.dec (ds j) := m.decisions_app g C2 looked
  have hdc : m.taking act0 (g.app C2) s.1 (fun j => g.dec (ds j)) .compute = fun j => g.dec (dc j) := m.taking_app act0 g C2 s.1 ds .compute
  have hdm : m.taking act0 (g.app C2) s.1 (fun j => g.dec (ds j)) .move = fun j => g.dec (dm j) := m.taking_app act0 g C2 s.1 ds .move
  have e3C : computeAll ((g.app C2).apply e2) (fun j => g.dec (dc j)) = g.app C3 := by
    rw [CfgMap.apply_app g C2 e2 c2, computeAll_app]
  have mv : moveAll ts ((g.app C3).apply e3) (fun j => g.dec (dm j)) = g.app C4 := by
    rw [CfgMap.apply_app g C3 e3 c3]
    exact moveAll_app g ts _ dm hinj hnbr (hedge ts (mem_chooseIfMany hts))
  have adv : m.advance ((g.app C4).apply e4) s.1 (fun j => g.dec (ds j)) = g.app (m.advance (C4.apply e4) s.1 ds) := by
    rw [CfgMap.apply_app g C4 e4 c4, advance_app]
  have hlooked := m.decideAll_app act0 g ts C2 (hopt ts C2) (m.lookers C2 s.1) _ w4 looked hl
  refine ⟨s.1, ?_⟩
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure]
  refine ⟨w1, ts, _, hts, ⟨w2, e1, _, ?_, ⟨w3, s, _, ?_, ⟨w4, (fun j => g.dec (looked j)), _, ?_, ⟨w5, e2, _, ?_,
    ⟨w6, e3, _, ?_, ⟨w7, e4, _, ?_, ⟨rfl, ?_⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩
  · rw [parallel_app g C _ (by intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact hbl c hc ts C)]
    exact h1
  · rw [e1C, m.schedule_app g hsch]; exact hs
  · rw [e1C, e2C, lookers_app]
    have : (fun (j : Fin σ.k) => Decision.idle (g.app C2).agents[j] act0) =
        fun (j : Fin σ.k) => g.dec (Decision.idle C2.agents[j] act0) :=
      funext fun j => (dec_idle act0 g _ j).symm
    unfold Model.decideAll
    rw [this]; exact hlooked
  · rw [e1C, e2C, hds, hdc]
    rw [parallel_map_app g C2 (fun c D => c.onCompute ts D dc) (fun c D => c.onCompute ts D (fun j => g.dec (dc j)))
      m.components (fun c hc => hoc c hc ts C2 dc)]
    exact h2
  · rw [e1C, e2C, hds, hdc, hdm, e3C]
    rw [parallel_map_app g C3 (fun c D => c.beforeMove ts D dm) (fun c D => c.beforeMove ts D (fun j => g.dec (dm j)))
      m.components (fun c hc => hbm c hc ts C3 dm)]
    exact h3
  · rw [e1C, e2C, hds, hdc, hdm, e3C, mv]
    rw [parallel_app g C4 _ (by intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact ham c hc ts C4)]
    exact h4
  · rw [e1C, e2C, hds, hdc, hdm, e3C, mv, adv]

/-! ## Port-based frames

Under port-based frames, an automorphism of the space does not change an agent's presentations:
its Look on the mapped configuration is its Look with the positions moved. So the decisions on
the mapped configuration are the mapped decisions, if the sensors do not see the positions
(`henv`) and the algorithm reads only the locations (`hstep`, which the generated steps satisfy:
they read the Look through `here`, `neighbors` and its size). -/

/-- A Look whose configuration and positions are moved by `g`. -/
def _root_.Simulant.Look.app (g : CfgMap σ) (L : Look σ) : Look σ :=
  { L with config := g.app L.config, order := L.order.map g.pos }

omit [FlagSet σ.F] in
theorem portPresentation_congr {V V' : Space.View σ.S} (perm : List Nat)
    (hn : V'.vertices.length = V.vertices.length) (he : V'.edges = V.edges) :
    σ.S.portPresentation V' perm = σ.S.portPresentation V perm := by
  unfold Space.portPresentation
  rw [hn, he]

omit [FlagSet σ.F] in
theorem presentations_app (g : CfgMap σ) (hg : σ.S.Auto g.pos) (hports : ∀ ord, m.frames ≠ .isomorphisms ord)
    (a b : Agent σ) (hpos : b.pos = g.pos a.pos) (hframe : b.frame = a.frame) : m.presentations b = m.presentations a := by
  unfold Model.presentations
  simp only
  rw [hpos, hframe, Space.view_map hg]
  cases h : m.frames with
  | isomorphisms ord => exact absurd h (hports ord)
  | perLook perms =>
    simp only
    exact List.map_congr_left fun p _ => portPresentation_congr p (by simp) rfl
  | perRobot =>
    simp only
    exact congrArg (· :: []) (portPresentation_congr _ (by simp) rfl)

omit [FlagSet σ.F] in
theorem look_app (g : CfgMap σ) (hg : σ.S.Auto g.pos) (ts : TState σ.S) (C : Config σ) (i : Fin σ.k)
    (p : Space.Presentation) : m.look ts (g.app C) i p = (m.look ts C i p).app g := by
  unfold Model.look Look.app
  simp only [CfgMap.app_agent]
  rw [Space.view_map hg]
  simp only [List.map_map]
  congr 1
  apply List.map_congr_left
  intro v _
  exact (List.getD_map' g.pos _ v _)

omit [FlagSet σ.F] in
theorem position_app (g : CfgMap σ) (L : Look σ) (l : Nat) : (L.app g).position l = g.pos (L.position l) := by
  unfold Look.position Look.app
  simp only [CfgMap.app_agent]
  exact List.getD_map' g.pos _ l _

omit [FlagSet σ.F] in
/-- The agents at a location do not change when an injective map moves every position. -/
theorem occupants_app (g : CfgMap σ) (hinj : ∀ p q, g.pos p = g.pos q → p = q) (L : Look σ) (l : Nat) :
    (L.app g).occupants l = L.occupants l := by
  unfold Look.occupants
  rw [position_app]
  congr 1
  funext j
  have : (L.app g).config = g.app L.config := rfl
  rw [this, CfgMap.app_agent]
  by_cases h : L.config.agents[j].pos = L.position l
  · simp only [Fin.getElem_fin] at h ⊢
    rw [h, beq_self_eq_true, beq_self_eq_true]
  · have : g.pos L.config.agents[j].pos ≠ g.pos (L.position l) := fun e => h (hinj _ _ e)
    simp only [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]

omit [FlagSet σ.F] in
/-- An injective map commutes with removing duplicates. -/
theorem eraseDups_map {α β : Type} [BEq α] [LawfulBEq α] [BEq β] [LawfulBEq β] (f : α → β)
    (hinj : ∀ a b, f a = f b → a = b) : ∀ (l : List α), (l.map f).eraseDups = l.eraseDups.map f
  | [] => rfl
  | a :: as => by
    have hbeq : ∀ x, (f x == f a) = (x == a) := fun x => by
      by_cases h : x = a
      · subst h; simp
      · have : f x ≠ f a := fun e => h (hinj _ _ e)
        rw [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]
    rw [List.map_cons, List.eraseDups_cons, List.eraseDups_cons, List.map_cons, List.filter_map]
    have : ((fun b => !b == f a) ∘ f) = fun b => !b == a := funext fun x => by simp only [Function.comp_def, hbeq]
    rw [this, eraseDups_map f hinj (as.filter fun b => !b == a)]
termination_by l => l.length
decreasing_by
  simp only [List.length_cons]
  have := List.length_filter_le (fun b => !b == a) as
  omega

/-- On a configuration moved by an automorphism, an agent can take its decisions moved. -/
theorem options_app (g : CfgMap σ) (hg : σ.S.Auto g.pos) (hports : ∀ ord, m.frames ≠ .isomorphisms ord)
    (henv : ∀ L, m.env (L.app g) = m.env L)
    (hstep : ∀ mem pub L e, m.step mem pub (L.app g) e = m.step mem pub L e)
    (ts : TState σ.S) (C : Config σ) (i : Fin σ.k) (w : Witness) (d : Decision σ)
    (h : (w, d) ∈ m.options act0 ts C i) : (w, g.dec d) ∈ m.options act0 ts (g.app C) i := by
  unfold Model.options at h ⊢
  simp only [CfgMap.app_agent] at h ⊢
  split at h
  · rename_i hadv
    rw [show FlagSet.acts C.agents[i].flags = Acts.adversary from hadv]
    simp only
    rw [ND.mem_bind] at h ⊢
    obtain ⟨w₁, t, w₂, ht, hp, rfl⟩ := h
    rw [ND.mem_pure] at hp
    obtain ⟨rfl, rfl⟩ := hp
    refine ⟨w₁, g.pos t, [], ?_, by rw [ND.mem_pure]; exact ⟨rfl, rfl⟩, rfl⟩
    rw [hg.nbrs, ← List.map_cons, eraseDups_map g.pos hg.inj]
    rw [ND.mem_choose] at ht ⊢
    obtain ⟨j, hj, rfl⟩ := ht
    exact ⟨j, by rw [List.zipIdx_map]; exact List.mem_map.2 ⟨(t, j), hj, rfl⟩, rfl⟩
  · rw [presentations_app m g hg hports C.agents[i]
      { C.agents[i] with pos := g.pos C.agents[i].pos, pending := C.agents[i].pending.map g.dec } rfl rfl]
    rw [ND.mem_bind] at h ⊢
    obtain ⟨w₁, p, w₂, hp, h2, rfl⟩ := h
    refine ⟨w₁, p, w₂, hp, ?_, rfl⟩
    rw [ND.mem_bind] at h2 ⊢
    obtain ⟨w₃, e, w₄, he, h3, rfl⟩ := h2
    refine ⟨w₃, e, w₄, ?_, ?_, rfl⟩
    · rw [look_app m g hg, henv]; exact he
    · rw [ND.mem_pure] at h3 ⊢
      obtain ⟨rfl, rfl⟩ := h3
      refine ⟨rfl, ?_⟩
      rw [look_app m g hg, hstep, position_app]
      rfl

end Model
end Simulant
