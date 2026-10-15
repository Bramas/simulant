import Simulant.Lemmas

/-!
# A round built from equivariant pieces is equivariant (plan, Section 3.11)

A configuration map `g` moves every agent's position and transforms the
world (a rotation of the ring moves positions and the nodes stored in the
world). If moves commute with `g`, the algorithm's view and the components'
hooks do not see `g`, and the world updates of effects commute with `g`,
then `g` maps steps to steps with the same witness.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

structure CfgMap (σ : Sig) where
  pos : Fin σ.N → Fin σ.N
  world : σ.W → σ.W

def CfgMap.app (g : CfgMap σ) (C : Config σ) : Config σ :=
  { agents := C.agents.map fun a => { a with pos := g.pos a.pos }, world := g.world C.world }

omit [FlagSet σ.F] in
@[simp] theorem CfgMap.app_agent (g : CfgMap σ) (C : Config σ) (i : Fin σ.k) :
    (g.app C).agents[i] = { C.agents[i] with pos := g.pos C.agents[i].pos } := by
  simp [CfgMap.app]

omit [FlagSet σ.F] in
@[simp] theorem CfgMap.app_agent' (g : CfgMap σ) (C : Config σ) (i : Nat) (h : i < σ.k) :
    (g.app C).agents[i] = { C.agents[i] with pos := g.pos C.agents[i].pos } := by
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

theorem activate_app (g : CfgMap σ) (C : Config σ) : m.activate (g.app C) = m.activate C := by
  simp [Model.activate]

theorem decideAll_app (g : CfgMap σ) (ts : TState) (C : Config σ) (active : List (Fin σ.k))
    (hview : ∀ C i f, m.view ts (g.app C) i f = m.view ts C i f) :
    m.decideAll act0 ts (g.app C) active = m.decideAll act0 ts C active := by
  simp [Model.decideAll, Model.options, Model.frames, Decision.idle, hview]

theorem moveAll_app (g : CfgMap σ) (ts : TState) (C : Config σ) (ds : Fin σ.k → Decision σ)
    (htarget : ∀ p mv, Ring.target (g.pos p) mv = g.pos (Ring.target p mv))
    (hcan : ∀ p mv, Ring.canMove ts (g.pos p) mv = Ring.canMove ts p mv) :
    moveAll ts (g.app C) ds = g.app (moveAll ts C ds) := by
  obtain ⟨agents, world⟩ := C
  simp only [moveAll, CfgMap.app, Config.mk.injEq, and_true]
  apply Vector.ext
  intro i hi
  simp only [Vector.getElem_ofFn, Fin.getElem_fin, Vector.getElem_map, htarget, hcan]
  by_cases h1 : ((ds ⟨i, hi⟩).decided && FlagSet.acts agents[i].flags != Acts.never) = true <;>
  by_cases h2 : ((ds ⟨i, hi⟩).move != Move.stay && Ring.canMove ts agents[i].pos (ds ⟨i, hi⟩).move) = true <;>
  simp only [h1, h2, ite_true, ite_false, Bool.false_eq_true]

/-- A round built from pieces that do not see `g` is equivariant under `g`, with the same witness. -/
theorem step_app (g : CfgMap σ)
    (htarget : ∀ p mv, Ring.target (g.pos p) mv = g.pos (Ring.target p mv))
    (hcan : ∀ ts ∈ m.tstates, ∀ p mv, Ring.canMove ts (g.pos p) mv = Ring.canMove ts p mv)
    (hview : ∀ ts C i f, m.view ts (g.app C) i f = m.view ts C i f)
    (hbl : ∀ c ∈ m.components, ∀ ts C, c.beforeLook ts (g.app C) = c.beforeLook ts C)
    (hbm : ∀ c ∈ m.components, ∀ ts C ds, c.beforeMove ts (g.app C) ds = c.beforeMove ts C ds)
    (ham : ∀ c ∈ m.components, ∀ ts C, c.afterMove ts (g.app C) = c.afterMove ts C)
    (hcomm : ∀ c ∈ m.components, ∀ ts C ds e,
      (ND.Can (c.beforeLook ts C) e ∨ ND.Can (c.beforeMove ts C ds) e ∨ ND.Can (c.afterMove ts C) e) → g.Commutes e)
    {C C' : Config σ} {w : Witness} (h : m.Step act0 C w C') : m.Step act0 (g.app C) w (g.app C') := by
  obtain ⟨act, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨w1, ts, _, hts, ⟨w2, e1, _, h1, ⟨w3, active, _, ha, ⟨w4, ds, _, hd, ⟨w5, e2, _, h2,
    ⟨w6, e3, _, h3, ⟨rfl, heq⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩ := h
  obtain ⟨rfl, rfl⟩ := Prod.mk.inj heq
  -- The effects commute with `g`.
  have c1 := parallel_commutes g C _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts C ds e (Or.inl he)) e1 ⟨_, h1⟩
  have c2 := parallel_commutes g _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts _ ds e (Or.inr (Or.inl he))) e2 ⟨_, h2⟩
  have c3 := parallel_commutes g _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm
    exact hcomm c hc ts _ ds e (Or.inr (Or.inr he))) e3 ⟨_, h3⟩
  -- Each stage on the mapped configuration is the stage on the original one.
  have p1 : parallel (m.components.map fun c => c.beforeLook ts) (g.app C) =
      parallel (m.components.map fun c => c.beforeLook ts) C :=
    parallel_app g C _ (by intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact hbl c hc ts C)
  have e1C := CfgMap.apply_app g C e1 c1
  have p2 : parallel (m.components.map fun c D => c.beforeMove ts D ds) (g.app (C.apply e1)) =
      parallel (m.components.map fun c D => c.beforeMove ts D ds) (C.apply e1) :=
    parallel_app g _ _ (by intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact hbm c hc ts _ ds)
  have e2C := CfgMap.apply_app g (C.apply e1) e2 c2
  have mv := Model.moveAll_app g ts ((C.apply e1).apply e2) ds htarget (hcan ts (mem_chooseIfMany hts))
  have p3 : parallel (m.components.map fun c => c.afterMove ts) (g.app (moveAll ts ((C.apply e1).apply e2) ds)) =
      parallel (m.components.map fun c => c.afterMove ts) (moveAll ts ((C.apply e1).apply e2) ds) :=
    parallel_app g _ _ (by intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact ham c hc ts _)
  have e3C := CfgMap.apply_app g (moveAll ts ((C.apply e1).apply e2) ds) e3 c3
  refine ⟨act, ?_⟩
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure]
  refine ⟨w1, ts, _, hts, ⟨w2, e1, _, ?_, ⟨w3, act, _, ?_, ⟨w4, ds, _, ?_, ⟨w5, e2, _, ?_,
    ⟨w6, e3, _, ?_, ⟨rfl, ?_⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩, rfl⟩
  · rw [p1]; exact h1
  · rw [e1C, m.activate_app]; exact ha
  · rw [e1C, m.decideAll_app act0 g ts _ act (hview ts)]; exact hd
  · rw [e1C, p2]; exact h2
  · rw [e1C, e2C, mv, p3]; exact h3
  · rw [e1C, e2C, mv, e3C]

end Model
end Simulant
