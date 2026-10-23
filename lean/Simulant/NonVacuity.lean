import Simulant.Lemmas

/-!
# Non-vacuity from totality (plan, Section 5.2)

A step built from pieces that always have an outcome always has a
successor; with an initial configuration, a scheduler without fairness
assumption then has an admissible execution, so its correctness theorem is not vacuous.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

/-- Every hook always has an outcome. -/
def Component.Total (c : Component σ) : Prop :=
  (∀ ts C, ∃ e, ND.Can (c.beforeLook ts C) e) ∧
  (∀ ts C ds, ∃ e, ND.Can (c.onCompute ts C ds) e) ∧
  (∀ ts C ds, ∃ e, ND.Can (c.beforeMove ts C ds) e) ∧
  (∀ ts C, ∃ e, ND.Can (c.afterMove ts C) e)

/-- The scheduler always has an outcome when some agent can act. -/
def Scheduler.Total (sc : Scheduler σ) : Prop :=
  ∀ ts (C : Config σ), C.eligible ≠ [] → ∃ s, ND.Can (sc.schedule ts C) s

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

theorem schedule_total (hsc : m.scheduler.Total) (ts : TState σ.S) (C : Config σ) : ∃ s, ND.Can (m.schedule ts C) s := by
  unfold Model.schedule
  split
  · exact ⟨_, ND.can_pure.2 rfl⟩
  · rename_i h
    obtain ⟨s, hs⟩ := hsc ts C (fun he => h (List.isEmpty_iff.2 he))
    exact ⟨_, ND.can_bind_of hs (ND.can_pure.2 rfl)⟩

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

/-- A step built from total pieces always has a successor. -/
theorem total (hts : m.tstates ≠ []) (hc : ∀ c ∈ m.components, c.Total) (hsc : m.scheduler.Total)
    (hpres : ∀ a : Agent σ, m.presentations a ≠ []) (henv : ∀ L, ∃ e, ND.Can (m.env L) e) (C : Config σ) :
    ∃ w a C', (w, (a, C')) ∈ m.roundA act0 C := by
  obtain ⟨ts, hts⟩ := chooseIfMany_total "edges" hts
  obtain ⟨e1, h1⟩ := parallel_total C (m.components.map fun c => c.beforeLook ts) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).1 ts C)
  obtain ⟨s, hs⟩ := m.schedule_total hsc ts (C.apply e1)
  let C2 := (C.apply e1).apply s.2
  obtain ⟨looked, hd⟩ := m.decideAll_total act0 ts C2 hpres henv (m.lookers C2 s.1)
    (fun j => Decision.idle C2.agents[j] act0)
  let ds := m.decisions C2 looked
  let dc := m.taking act0 C2 s.1 ds .compute
  let dm := m.taking act0 C2 s.1 ds .move
  obtain ⟨e2, h2⟩ := parallel_total C2 (m.components.map fun c D => c.onCompute ts D dc) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).2.1 ts _ dc)
  let C3 := computeAll (C2.apply e2) dc
  obtain ⟨e3, h3⟩ := parallel_total C3 (m.components.map fun c D => c.beforeMove ts D dm) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).2.2.1 ts _ dm)
  let C4 := moveAll ts (C3.apply e3) dm
  obtain ⟨e4, h4⟩ := parallel_total C4 (m.components.map fun c => c.afterMove ts) (by
    intro hk hm; simp only [List.mem_map] at hm; obtain ⟨c, hcm, rfl⟩ := hm; exact (hc c hcm).2.2.2 ts _)
  have : ND.Can (m.roundA act0 C) (s.1, m.advance (C4.apply e4) s.1 ds) :=
    ND.can_bind_of hts (ND.can_bind_of h1 (ND.can_bind_of hs (ND.can_bind_of hd
      (ND.can_bind_of h2 (ND.can_bind_of h3 (ND.can_bind_of h4 (ND.can_pure.2 rfl)))))))
  obtain ⟨w, hw⟩ := this
  exact ⟨w, _, _, hw⟩

/-- A scheduler without fairness assumption, an initial configuration and a successor for every
configuration give an admissible execution. -/
theorem hasExecution (init : ND (Config σ)) (hfair : m.scheduler.fairness = .none) (hinit : m.HasInitial init)
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
  · intro h; exact absurd (hfair.symm.trans h) (by decide)

end Model
end Simulant
