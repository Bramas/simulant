import Simulant.Lemmas

/-!
# Non-vacuity from totality (plan, Section 5.2)

A round built from pieces that always have an outcome always has a
successor; with an initial configuration, a synchronous round then has an
admissible execution, so its correctness theorem is not vacuous.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

/-- Every hook always has an outcome. -/
def Component.Total (c : Component σ) : Prop :=
  (∀ ts C, ∃ e, ND.Can (c.beforeLook ts C) e) ∧
  (∀ ts C ds, ∃ e, ND.Can (c.beforeMove ts C ds) e) ∧
  (∀ ts C, ∃ e, ND.Can (c.afterMove ts C) e)

theorem ND.can_of_mem {m : ND α} {w : Witness} {a : α} (h : (w, a) ∈ m) : ND.Can m a := ⟨w, h⟩

theorem ND.exists_can {m : ND α} (h : m ≠ []) : ∃ a, ND.Can m a := by
  obtain ⟨⟨w, a⟩, rest, hm⟩ := List.exists_cons_of_ne_nil h
  exact ⟨a, w, by rw [hm]; exact List.mem_cons_self⟩

theorem ND.can_bind_of {m : ND α} {f : α → ND β} {a : α} {b : β} (h1 : ND.Can m a) (h2 : ND.Can (f a) b) :
    ND.Can (m >>= f) b :=
  ND.can_bind.2 ⟨a, h1, h2⟩

theorem chooseIfMany_total (site : String) {l : List α} (h : l ≠ []) : ∃ x, ND.Can (chooseIfMany site l) x := by
  unfold chooseIfMany
  split
  · exact ⟨_, ND.can_pure.2 rfl⟩
  · obtain ⟨x, hx⟩ := List.exists_mem_of_ne_nil l h
    exact ⟨x, ND.can_choose.2 hx⟩

theorem parallel_total (C : Config σ) :
    ∀ (hooks : List (Config σ → ND (Effect σ))), (∀ hk ∈ hooks, ∃ e, ND.Can (hk C) e) →
      ∃ e, ND.Can (parallel hooks C) e
  | [], _ => ⟨_, ND.can_pure.2 rfl⟩
  | hk :: hs, h => by
    obtain ⟨e, he⟩ := h hk List.mem_cons_self
    obtain ⟨r, hr⟩ := parallel_total C hs (fun hk' hm => h hk' (List.mem_cons_of_mem _ hm))
    exact ⟨_, ND.can_bind_of he (ND.can_bind_of hr (ND.can_pure.2 rfl))⟩

theorem combos_one (l : List α) : combos 1 l = l.map ([·]) := by
  induction l with
  | nil => rfl
  | cons x xs ih => simp [combos, ih]

namespace Model

variable (m : Model σ) (act0 : σ.A)

theorem activate_total (C : Config σ) : ∃ a, ND.Can (m.activate C) a := by
  unfold Model.activate
  dsimp only
  split
  · exact ⟨_, ND.can_pure.2 rfl⟩
  · split
    · exact ⟨_, ND.can_pure.2 rfl⟩
    · rename_i h
      obtain ⟨x, hx⟩ := List.exists_mem_of_ne_nil _ (fun he => h (List.isEmpty_iff.2 he))
      refine ⟨[x], ND.can_choose.2 ?_⟩
      simp only [nonemptySubsets, List.mem_flatMap, List.mem_range]
      exact ⟨0, List.length_pos_of_mem hx, by rw [combos_one]; exact List.mem_map_of_mem hx⟩
  · split
    · exact ⟨_, ND.can_pure.2 rfl⟩
    · rename_i h
      obtain ⟨x, hx⟩ := List.exists_mem_of_ne_nil _ (fun he => h (List.isEmpty_iff.2 he))
      exact ⟨[x], ND.can_choose.2 (List.mem_map_of_mem hx)⟩

theorem options_total (ts : TState σ.S) (C : Config σ) (i : Fin σ.k)
    (hpres : m.presentations C.agents[i] ≠ []) (henv : ∀ L, ∃ e, ND.Can (m.env L) e) :
    ∃ d, ND.Can (m.options act0 ts C i) d := by
  unfold Model.options
  dsimp only
  split
  · refine ⟨_, ND.can_bind_of (a := C.agents[i].pos) (ND.can_choose.2 ?_) (ND.can_pure.2 rfl)⟩
    rw [List.mem_eraseDups]; exact List.mem_cons_self
  · obtain ⟨p, hp⟩ := chooseIfMany_total ("frame " ++ agentName i) hpres
    obtain ⟨e, he⟩ := henv (m.look ts C i p)
    exact ⟨_, ND.can_bind_of hp (ND.can_bind_of he (ND.can_pure.2 rfl))⟩

theorem decideAll_total (ts : TState σ.S) (C : Config σ) (hpres : ∀ a : Agent σ, m.presentations a ≠ [])
    (henv : ∀ L, ∃ e, ND.Can (m.env L) e) :
    ∀ (active : List (Fin σ.k)) (init : Fin σ.k → Decision σ),
      ∃ ds, ND.Can (active.foldlM (fun ds i => do
          let d ← m.options act0 ts C i
          pure fun j => if j = i then d else ds j) init) ds
  | [], init => ⟨init, ND.can_pure.2 rfl⟩
  | i :: rest, init => by
    obtain ⟨d, hd⟩ := m.options_total act0 ts C i (hpres _) henv
    obtain ⟨ds, hds⟩ := decideAll_total ts C hpres henv rest (fun j => if j = i then d else init j)
    exact ⟨ds, by
      rw [List.foldlM_cons]
      exact ND.can_bind_of (ND.can_bind_of hd (ND.can_pure.2 rfl)) hds⟩

/-- A round built from total pieces always has a successor. -/
theorem total (hts : m.tstates ≠ []) (hc : ∀ c ∈ m.components, c.Total)
    (hpres : ∀ a : Agent σ, m.presentations a ≠ []) (henv : ∀ L, ∃ e, ND.Can (m.env L) e) (C : Config σ) :
    ∃ w a C', (w, (a, C')) ∈ m.roundA act0 C := by
  obtain ⟨ts, hts⟩ := chooseIfMany_total "edges" hts
  obtain ⟨e1, h1⟩ := parallel_total C (m.components.map fun c => c.beforeLook ts) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).1 ts C)
  obtain ⟨active, ha⟩ := m.activate_total (C.apply e1)
  obtain ⟨ds, hd⟩ := m.decideAll_total act0 ts (C.apply e1) hpres henv active
    (fun j => Decision.idle (C.apply e1).agents[j] act0)
  obtain ⟨e2, h2⟩ := parallel_total (C.apply e1) (m.components.map fun c D => c.beforeMove ts D ds) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).2.1 ts _ ds)
  obtain ⟨e3, h3⟩ := parallel_total (moveAll ts ((C.apply e1).apply e2) ds)
    (m.components.map fun c => c.afterMove ts) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).2.2 ts _)
  have : ND.Can (m.roundA act0 C) (active, (moveAll ts ((C.apply e1).apply e2) ds).apply e3) :=
    ND.can_bind_of hts (ND.can_bind_of h1 (ND.can_bind_of ha (ND.can_bind_of hd
      (ND.can_bind_of h2 (ND.can_bind_of h3 (ND.can_pure.2 rfl))))))
  obtain ⟨w, hw⟩ := this
  exact ⟨w, _, _, hw⟩

/-- A synchronous round with an initial configuration and a successor for every configuration
has an admissible execution. -/
theorem hasExecution (init : ND (Config σ)) (hround : m.round = .fsync) (hinit : m.HasInitial init)
    (htot : ∀ C, ∃ w a C', (w, (a, C')) ∈ m.roundA act0 C) : m.HasExecution act0 init := by
  classical
  let next : Config σ → Witness × List (Fin σ.k) × Config σ := fun C =>
    let h := htot C
    (Classical.choose h, Classical.choose (Classical.choose_spec h),
      Classical.choose (Classical.choose_spec (Classical.choose_spec h)))
  let config : Nat → Config σ := fun n => Nat.rec (Classical.choose hinit) (fun _ C => (next C).2.2) n
  refine ⟨⟨config, fun n => (next (config n)).1, fun n => (next (config n)).2.1⟩, ⟨?_, fun n => ?_⟩, ?_⟩
  · exact Classical.choose_spec hinit
  · exact Classical.choose_spec (Classical.choose_spec (Classical.choose_spec (htot (config n))))
  · intro h; exact False.elim (h hround)

end Model
end Simulant
