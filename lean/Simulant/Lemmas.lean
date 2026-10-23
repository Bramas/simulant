import Simulant.Exec

/-!
# Library lemmas about the round, for any components (plan, Section 4)
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

theorem mem_chooseIfMany {site : String} {l : List α} {w : Witness} {x : α}
    (h : (w, x) ∈ chooseIfMany site l) : x ∈ l := by
  unfold chooseIfMany at h
  split at h
  · simp only [ND.mem_pure] at h; rw [h.2]; exact List.mem_singleton_self _
  · exact ND.can_choose.1 ⟨w, h⟩

@[simp] theorem Config.apply_world (C : Config σ) (e : Effect σ) : (C.apply e).world = e.world C.world := rfl

@[simp] theorem Config.apply_agent (C : Config σ) (e : Effect σ) (i : Fin σ.k) :
    (C.apply e).agents[i] =
      { C.agents[i] with flags := FlagSet.merge C.agents[i].flags (e.raise i), fields := e.fields i C.agents[i].fields } := by
  simp [Config.apply]

theorem moveAll_never (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k)
    (h : FlagSet.acts C.agents[i].flags = .never) : (moveAll ts C ds).agents[i] = C.agents[i] := by
  simp only [Fin.getElem_fin] at h
  simp [moveAll, h]

@[simp] theorem moveAll_world (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) :
    (moveAll ts C ds).world = C.world := rfl

@[simp] theorem computeAll_world (C : Config σ) (ds : Fin σ.k → Decision σ) :
    (computeAll C ds).world = C.world := rfl

theorem moveAll_flags (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (moveAll ts C ds).agents[i].flags = C.agents[i].flags := by
  simp only [moveAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem moveAll_pub (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (moveAll ts C ds).agents[i].pub = C.agents[i].pub := by
  simp only [moveAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem computeAll_pos (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (computeAll C ds).agents[i].pos = C.agents[i].pos := by
  simp only [computeAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem computeAll_flags (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (computeAll C ds).agents[i].flags = C.agents[i].flags := by
  simp only [computeAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem computeAll_pub (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (computeAll C ds).agents[i].pub =
      if ((ds i).decided && FlagSet.acts C.agents[i].flags != .never) = true then (ds i).pub else C.agents[i].pub := by
  simp only [computeAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

namespace Model

variable (m : Model σ)

@[simp] theorem advance_world (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) :
    (m.advance C active ds).world = C.world := rfl

theorem advance_pos (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (m.advance C active ds).agents[i].pos = C.agents[i].pos := by
  simp only [Model.advance, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem advance_flags (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (m.advance C active ds).agents[i].flags = C.agents[i].flags := by
  simp only [Model.advance, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem advance_pub (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (m.advance C active ds).agents[i].pub = C.agents[i].pub := by
  simp only [Model.advance, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

end Model

theorem apply_pos (C : Config σ) (e : Effect σ) (i : Fin σ.k) : (C.apply e).agents[i].pos = C.agents[i].pos := by
  rw [Config.apply_agent]

variable [LawfulFlagSet σ.F]

theorem apply_never (C : Config σ) (e : Effect σ) (i : Fin σ.k)
    (h : FlagSet.acts C.agents[i].flags = .never) : FlagSet.acts (C.apply e).agents[i].flags = .never := by
  rw [Config.apply_agent]
  exact LawfulFlagSet.acts_merge_never _ _ h

/-- An agent that never acts (crashed, dead) neither moves nor acts again, whatever the components. -/
theorem never_stays (m : Model σ) (act0 : σ.A) {C C' : Config σ} {w : Witness} (h : m.Step act0 C w C')
    (i : Fin σ.k) (hn : FlagSet.acts C.agents[i].flags = .never) :
    C'.agents[i].pos = C.agents[i].pos ∧ FlagSet.acts C'.agents[i].flags = .never := by
  obtain ⟨_, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨_, ts, _, -, ⟨_, e1, _, -, ⟨_, s, _, -, ⟨_, looked, _, -, ⟨_, e2, _, -, ⟨_, e3, _, -, ⟨_, e4, _, -,
    ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := h
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  have h1 := apply_never C e1 i hn
  have h2 := apply_never _ s.2 i h1
  have h3 := apply_never _ e2 i h2
  have h5 : ∀ ds, FlagSet.acts ((computeAll (((C.apply e1).apply s.2).apply e2) ds).apply e3).agents[i].flags = .never :=
    fun ds => apply_never _ e3 i (by rw [computeAll_flags]; exact h3)
  refine ⟨?_, ?_⟩
  · rw [Model.advance_pos, apply_pos, moveAll_never ts _ _ i (h5 _), apply_pos, computeAll_pos, apply_pos, apply_pos, apply_pos]
  · rw [Model.advance_flags]
    apply apply_never
    rw [moveAll_never ts _ _ i (h5 _)]
    exact h5 _

end Simulant

/-! ## World parts that the round preserves

An observation `g` of the world (typically: a component's part) is
preserved by the round when every component preserves it. Components
built from `Hooks` preserve every part they do not own (`toComponent_preserves`). -/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F] {T : Type}

/-- Every effect the component's hooks can produce preserves `g`. -/
def Component.Preserves (c : Component σ) (g : σ.W → T) : Prop :=
  (∀ ts C e, ND.Can (c.beforeLook ts C) e → ∀ w, g (e.world w) = g w) ∧
  (∀ ts C ds e, ND.Can (c.onCompute ts C ds) e → ∀ w, g (e.world w) = g w) ∧
  (∀ ts C ds e, ND.Can (c.beforeMove ts C ds) e → ∀ w, g (e.world w) = g w) ∧
  (∀ ts C e, ND.Can (c.afterMove ts C) e → ∀ w, g (e.world w) = g w)

/-- Every effect the scheduler can produce preserves `g`. -/
def Scheduler.Preserves (sc : Scheduler σ) (g : σ.W → T) : Prop :=
  ∀ ts C s, ND.Can (sc.schedule ts C) s → ∀ w, g (s.effect.world w) = g w

omit [FlagSet σ.F] in
theorem Component.Preserves.comp {c : Component σ} {g : σ.W → T} (h : c.Preserves g) (f : T → U) :
    c.Preserves (fun w => f (g w)) := by
  obtain ⟨h1, h2, h3, h4⟩ := h
  exact ⟨fun ts C e he w => congrArg f (h1 ts C e he w), fun ts C ds e he w => congrArg f (h2 ts C ds e he w),
    fun ts C ds e he w => congrArg f (h3 ts C ds e he w), fun ts C e he w => congrArg f (h4 ts C e he w)⟩

omit [FlagSet σ.F] in
theorem Scheduler.Preserves.comp {sc : Scheduler σ} {g : σ.W → T} (h : sc.Preserves g) (f : T → U) :
    sc.Preserves (fun w => f (g w)) :=
  fun ts C s hs w => congrArg f (h ts C s hs w)

theorem ND.can_map {m : ND α} {f : α → β} {b : β} :
    ND.Can (do let a ← m; pure (f a)) b ↔ ∃ a, ND.Can m a ∧ b = f a := by
  rw [ND.can_bind]
  exact exists_congr fun _ => and_congr_right fun _ => ND.can_pure

theorem parallel_preserves {g : σ.W → T} (C : Config σ) :
    ∀ (hooks : List (Config σ → ND (Effect σ))),
      (∀ hk ∈ hooks, ∀ e, ND.Can (hk C) e → ∀ w, g (e.world w) = g w) →
      ∀ e, ND.Can (parallel hooks C) e → ∀ w, g (e.world w) = g w
  | [], _, e, he, w => by
    simp only [parallel, ND.can_pure] at he
    subst he
    rfl
  | hk :: hs, h, e, he, w => by
    simp only [parallel, ND.can_bind, ND.can_pure] at he
    obtain ⟨e1, h1, r, hr, rfl⟩ := he
    have ih := parallel_preserves C hs (fun hk' hm => h hk' (List.mem_cons_of_mem _ hm)) r hr
    show g (r.world (e1.world w)) = g w
    rw [ih, h hk (List.mem_cons_self) e1 h1 w]

theorem Model.schedule_preserves (m : Model σ) {g : σ.W → T} (hsc : m.scheduler.Preserves g) (ts : TState σ.S)
    (C : Config σ) (s : List (Fin σ.k) × Effect σ) (h : ND.Can (m.schedule ts C) s) : ∀ w, g (s.2.world w) = g w := by
  unfold Model.schedule at h
  split at h
  · rw [ND.can_pure.1 h]; intro w; rfl
  · obtain ⟨s', hs', rfl⟩ := ND.can_map.1 h
    exact hsc ts C s' hs'

/-- If every component and the scheduler preserve `g`, so does the step. -/
theorem Model.step_preserves (m : Model σ) (act0 : σ.A) {g : σ.W → T}
    (h : ∀ c ∈ m.components, c.Preserves g) (hsc : m.scheduler.Preserves g) {C C' : Config σ} {w : Witness}
    (hs : m.Step act0 C w C') : g C'.world = g C.world := by
  obtain ⟨_, hs⟩ := hs
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at hs
  obtain ⟨_, ts, _, -, ⟨_, e1, _, h1, ⟨_, s, _, h2, ⟨_, looked, _, -, ⟨_, e2, _, h3, ⟨_, e3, _, h4, ⟨_, e4, _, h5,
    ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := hs
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  have p1 := parallel_preserves C _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).1 ts C e he) e1 ⟨_, h1⟩
  have p2 := m.schedule_preserves hsc ts _ s ⟨_, h2⟩
  have p3 := parallel_preserves _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).2.1 ts _ _ e he) e2 ⟨_, h3⟩
  have p4 := parallel_preserves _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).2.2.1 ts _ _ e he) e3 ⟨_, h4⟩
  have p5 := parallel_preserves _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).2.2.2 ts _ e he) e4 ⟨_, h5⟩
  simp only [Model.advance_world, Config.apply_world, moveAll_world, computeAll_world]
  rw [p5, p4, p3, p2, p1]

omit [FlagSet σ.F] in
/-- A component preserves every part of the world that its own lens does not touch. -/
theorem Hooks.toComponent_preserves (h : Hooks σ Wc Xc) (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) (g : σ.W → T)
    (hg : ∀ w x, g (L.set w x) = g w) : (h.toComponent L Lx).Preserves g := by
  refine ⟨fun ts C e he w => ?_, fun ts C ds e he w => ?_, fun ts C ds e he w => ?_, fun ts C e he w => ?_⟩ <;>
  · obtain ⟨e, -, rfl⟩ := ND.can_map.1 he
    exact hg _ _

omit [FlagSet σ.F] in
/-- A scheduler preserves every part of the world that its own lens does not touch. -/
theorem SchedulerHooks.toScheduler_preserves (h : SchedulerHooks σ Wc Xc) (events : List (List Instant))
    (fairness : Fairness) (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) (g : σ.W → T)
    (hg : ∀ w x, g (L.set w x) = g w) : (h.toScheduler events fairness L Lx).Preserves g := by
  intro ts C s hs w
  obtain ⟨s', -, rfl⟩ := ND.can_map.1 hs
  exact hg _ _

omit [FlagSet σ.F] in
/-- A component preserves an observation of its own part that each of its own effects preserves. -/
theorem Hooks.toComponent_preserves_own (h : Hooks σ Wc Xc) (L : Lens σ.W Wc) (Lx : Lens σ.X Xc) [LawfulLens L] (g : Wc → T)
    (hown : (∀ ts C e, ND.Can (h.beforeLook ts C) e → ∀ x, g (e.world x) = g x) ∧
      (∀ ts C ds e, ND.Can (h.onCompute ts C ds) e → ∀ x, g (e.world x) = g x) ∧
      (∀ ts C ds e, ND.Can (h.beforeMove ts C ds) e → ∀ x, g (e.world x) = g x) ∧
      (∀ ts C e, ND.Can (h.afterMove ts C) e → ∀ x, g (e.world x) = g x)) :
    (h.toComponent L Lx).Preserves (fun w => g (L.get w)) := by
  obtain ⟨h1, h2, h3, h4⟩ := hown
  refine ⟨fun ts C e he w => ?_, fun ts C ds e he w => ?_, fun ts C ds e he w => ?_, fun ts C e he w => ?_⟩
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h1 ts C e' he' _
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h2 ts C ds e' he' _
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h3 ts C ds e' he' _
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h4 ts C e' he' _

end Simulant
