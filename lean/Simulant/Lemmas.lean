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
    (C.apply e).agents[i] = { C.agents[i] with flags := FlagSet.merge C.agents[i].flags (e.raise i) } := by
  simp [Config.apply]

theorem moveAll_never (ts : TState) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k)
    (h : FlagSet.acts C.agents[i].flags = .never) : (moveAll ts C ds).agents[i] = C.agents[i] := by
  simp only [Fin.getElem_fin] at h
  simp [moveAll, h]

@[simp] theorem moveAll_world (ts : TState) (C : Config σ) (ds : Fin σ.k → Decision σ) :
    (moveAll ts C ds).world = C.world := rfl

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
  obtain ⟨_, ts, _, -, ⟨_, e1, _, -, ⟨_, _, _, -, ⟨_, ds, _, -, ⟨_, e2, _, -, ⟨_, e3, _, -, ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := h
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  have h1 := apply_never C e1 i hn
  have h2 := apply_never _ e2 i h1
  have hm := moveAll_never ts ((C.apply e1).apply e2) ds i h2
  refine ⟨?_, ?_⟩
  · simp only [Config.apply_agent] at hm ⊢
    rw [hm]
  · apply apply_never
    rw [hm]
    exact h2

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
  (∀ ts C ds e, ND.Can (c.beforeMove ts C ds) e → ∀ w, g (e.world w) = g w) ∧
  (∀ ts C e, ND.Can (c.afterMove ts C) e → ∀ w, g (e.world w) = g w)

omit [FlagSet σ.F] in
theorem Component.Preserves.comp {c : Component σ} {g : σ.W → T} (h : c.Preserves g) (f : T → U) :
    c.Preserves (fun w => f (g w)) := by
  obtain ⟨h1, h2, h3⟩ := h
  exact ⟨fun ts C e he w => congrArg f (h1 ts C e he w), fun ts C ds e he w => congrArg f (h2 ts C ds e he w),
    fun ts C e he w => congrArg f (h3 ts C e he w)⟩

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

/-- If every component preserves `g`, so does the round. -/
theorem Model.step_preserves (m : Model σ) (act0 : σ.A) {g : σ.W → T}
    (h : ∀ c ∈ m.components, c.Preserves g) {C C' : Config σ} {w : Witness}
    (hs : m.Step act0 C w C') : g C'.world = g C.world := by
  obtain ⟨_, hs⟩ := hs
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at hs
  obtain ⟨_, ts, _, -, ⟨_, e1, _, h1, ⟨_, _, _, -, ⟨_, ds, _, -, ⟨_, e2, _, h2, ⟨_, e3, _, h3, ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := hs
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  have p1 := parallel_preserves C _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).1 ts C e he) e1 ⟨_, h1⟩
  have p2 := parallel_preserves _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).2.1 ts _ ds e he) e2 ⟨_, h2⟩
  have p3 := parallel_preserves _ _ (by
    intro hk hm e he; simp only [List.mem_map] at hm; obtain ⟨c, hc, rfl⟩ := hm; exact (h c hc).2.2 ts _ e he) e3 ⟨_, h3⟩
  simp only [Config.apply_world, moveAll_world]
  rw [p3, p2, p1]

omit [FlagSet σ.F] in
/-- A component preserves every part of the world that its own lens does not touch. -/
theorem Hooks.toComponent_preserves (h : Hooks σ Wc) (L : Lens σ.W Wc) (g : σ.W → T)
    (hg : ∀ w x, g (L.set w x) = g w) : (h.toComponent L).Preserves g := by
  refine ⟨fun ts C e he w => ?_, fun ts C ds e he w => ?_, fun ts C e he w => ?_⟩ <;>
  · obtain ⟨e, -, rfl⟩ := ND.can_map.1 he
    exact hg _ _

omit [FlagSet σ.F] in
/-- A component preserves an observation of its own part that each of its own effects preserves. -/
theorem Hooks.toComponent_preserves_own (h : Hooks σ Wc) (L : Lens σ.W Wc) [LawfulLens L] (g : Wc → T)
    (hown : (∀ ts C e, ND.Can (h.beforeLook ts C) e → ∀ x, g (e.world x) = g x) ∧
      (∀ ts C ds e, ND.Can (h.beforeMove ts C ds) e → ∀ x, g (e.world x) = g x) ∧
      (∀ ts C e, ND.Can (h.afterMove ts C) e → ∀ x, g (e.world x) = g x)) :
    (h.toComponent L).Preserves (fun w => g (L.get w)) := by
  obtain ⟨h1, h2, h3⟩ := hown
  refine ⟨fun ts C e he w => ?_, fun ts C ds e he w => ?_, fun ts C e he w => ?_⟩
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h1 ts C e' he' _
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h2 ts C ds e' he' _
  · obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    simp only [OwnEffect.lift, LawfulLens.get_set]
    exact h3 ts C e' he' _

end Simulant
