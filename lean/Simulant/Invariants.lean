import Simulant.NonVacuity

/-!
# Invariants of public states

The public state of an agent changes only through the algorithm's step:
components never write it, and agents that do not decide keep it. A decision
may wait, pending, between an agent's Look and its Compute. So a property of
public states that the step preserves holds of every agent, and of every pending
decision, in every reachable configuration, whatever the components and the scheduler.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

omit [FlagSet σ.F] in
theorem Decision.idle_pub (a : Agent σ) (act : σ.A) : (Decision.idle a act).pub = a.pub := rfl

theorem Config.apply_pub (C : Config σ) (e : Effect σ) (i : Fin σ.k) : (C.apply e).agents[i].pub = C.agents[i].pub := by
  rw [Config.apply_agent]

theorem Config.apply_pending (C : Config σ) (e : Effect σ) (i : Fin σ.k) :
    (C.apply e).agents[i].pending = C.agents[i].pending := by
  rw [Config.apply_agent]

theorem computeAll_pending (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (computeAll C ds).agents[i].pending = C.agents[i].pending := by
  simp only [computeAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem moveAll_pending (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (moveAll ts C ds).agents[i].pending = C.agents[i].pending := by
  simp only [moveAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

/-- `P` holds of an agent's public state and of the public state of its pending decision. -/
def PubGood (P : σ.P → Prop) (a : Agent σ) : Prop := P a.pub ∧ ∀ d, a.pending = some d → P d.pub

namespace Model

variable (m : Model σ) (act0 : σ.A) (P : σ.P → Prop)

theorem options_pub (ts : TState σ.S) (C : Config σ) (i : Fin σ.k)
    (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub) (hC : P C.agents[i].pub)
    {d : Decision σ} (hd : ND.Can (m.options act0 ts C i) d) : P d.pub := by
  unfold Model.options at hd
  dsimp only at hd
  split at hd
  · obtain ⟨_, -, rfl⟩ := ND.can_map.1 hd
    exact hC
  · obtain ⟨p, -, hd⟩ := ND.can_bind.1 hd
    obtain ⟨e, -, hd⟩ := ND.can_bind.1 hd
    rw [ND.can_pure.1 hd]
    exact hstep _ _ _ _ hC

theorem decideAll_pub (ts : TState σ.S) (C : Config σ)
    (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub) (hC : ∀ i : Fin σ.k, P C.agents[i].pub) :
    ∀ (active : List (Fin σ.k)) (init : Fin σ.k → Decision σ), (∀ j, P (init j).pub) →
      ∀ ds, ND.Can (active.foldlM (fun ds i => do
          let d ← m.options act0 ts C i
          pure fun j => if j = i then d else ds j) init) ds → ∀ j, P (ds j).pub
  | [], init, hinit, ds, hds => by
    rw [List.foldlM_nil, ND.can_pure] at hds
    subst hds
    exact hinit
  | i :: rest, init, hinit, ds, hds => by
    rw [List.foldlM_cons] at hds
    obtain ⟨acc, hacc, hds⟩ := ND.can_bind.1 hds
    obtain ⟨d, hd, rfl⟩ := ND.can_map.1 hacc
    refine decideAll_pub ts C hstep hC rest _ ?_ ds hds
    intro j
    by_cases h : j = i
    · simp only [h, ite_true]; exact m.options_pub act0 P ts C i hstep (hC i) hd
    · simp only [h, ite_false]; exact hinit j

theorem advance_good (C : Config σ) (active : List (Fin σ.k)) (ds : Fin σ.k → Decision σ)
    (hC : ∀ i : Fin σ.k, PubGood P C.agents[i]) (hds : ∀ j, P (ds j).pub) :
    ∀ i : Fin σ.k, PubGood P (m.advance C active ds).agents[i] := by
  intro i
  simp only [Model.advance, Fin.getElem_fin, Vector.getElem_ofFn]
  split
  · refine ⟨(hC i).1, fun d hd => ?_⟩
    simp only at hd
    split at hd
    · cases hd
    · cases hd; exact hds i
  · exact hC i

/-- A property of public states preserved by the step holds of every agent, and of every pending
decision, after a step. -/
theorem step_good {C C' : Config σ} {w : Witness} (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub)
    (h : m.Step act0 C w C') (hC : ∀ i : Fin σ.k, PubGood P C.agents[i]) : ∀ i : Fin σ.k, PubGood P C'.agents[i] := by
  obtain ⟨_, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨_, ts, _, -, ⟨_, e1, _, -, ⟨_, s, _, -, ⟨_, looked, _, hl, ⟨_, e2, _, -, ⟨_, e3, _, -, ⟨_, e4, _, -,
    ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := h
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  -- Effects keep public states and pending decisions.
  have keep : ∀ (D : Config σ) (e : Effect σ), (∀ i : Fin σ.k, PubGood P D.agents[i]) → ∀ i : Fin σ.k, PubGood P (D.apply e).agents[i] :=
    fun D e hD i => by unfold PubGood; rw [Config.apply_pub, Config.apply_pending]; exact hD i
  let C2 := (C.apply e1).apply s.2
  have h2 : ∀ i : Fin σ.k, PubGood P C2.agents[i] := keep _ _ (keep _ _ hC)
  have hlooked := m.decideAll_pub act0 P ts C2 hstep (fun i => (h2 i).1) (m.lookers C2 s.1)
    (fun j => Decision.idle C2.agents[j] act0) (fun j => by rw [Decision.idle_pub]; exact (h2 j).1) looked
    (by unfold Model.decideAll at hl; exact ⟨_, hl⟩)
  have hds : ∀ j, P (m.decisions C2 looked j).pub := by
    intro j
    unfold Model.decisions
    split
    · exact hlooked j
    · cases hp : C2.agents[j].pending with
      | none => exact hlooked j
      | some d => exact (h2 j).2 d hp
  have htake : ∀ x j, P (m.taking act0 C2 s.1 (m.decisions C2 looked) x j).pub := by
    intro x j
    unfold Model.taking
    split
    · exact hds j
    · rw [Decision.idle_pub]; exact (h2 j).1
  have h3 : ∀ i : Fin σ.k, PubGood P (computeAll (C2.apply e2) (m.taking act0 C2 s.1 (m.decisions C2 looked) .compute)).agents[i] := by
    intro i
    have hD := keep _ e2 h2 i
    refine ⟨?_, ?_⟩
    · rw [computeAll_pub]; split
      · exact htake _ i
      · exact hD.1
    · rw [computeAll_pending]; exact hD.2
  have h4 := keep _ e3 h3
  have h5 : ∀ i : Fin σ.k, PubGood P (moveAll ts ((computeAll (C2.apply e2) (m.taking act0 C2 s.1 (m.decisions C2 looked) .compute)).apply e3)
      (m.taking act0 C2 s.1 (m.decisions C2 looked) .move)).agents[i] := by
    intro i
    unfold PubGood
    rw [moveAll_pub, moveAll_pending]
    exact h4 i
  exact m.advance_good P _ _ _ (keep _ e4 h5) hds

/-- ... and so of every agent in every reachable configuration. -/
theorem reachable_pub (init : ND (Config σ)) (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub)
    (hinit : ∀ C, ND.Can init C → ∀ i : Fin σ.k, P C.agents[i].pub)
    (hpending : ∀ C, ND.Can init C → ∀ i : Fin σ.k, C.agents[i].pending = none) {C : Config σ}
    (h : m.Reachable act0 init C) : ∀ i : Fin σ.k, P C.agents[i].pub := by
  suffices hgood : ∀ i : Fin σ.k, PubGood P C.agents[i] by exact fun i => (hgood i).1
  induction h with
  | init hC => exact fun i => ⟨hinit _ hC i, fun d hd => by rw [hpending _ hC i] at hd; cases hd⟩
  | step _ hs ih => exact m.step_good act0 P hstep ⟨_, hs⟩ ih

end Model
end Simulant

/-! ## Atomic cycles

With one event per cycle (FSYNC, SSYNC, sequential), agents are always between two cycles: a
step is a whole Look-Compute-Move cycle of each scheduled agent, as in a round of the classic
models, and no decision is ever pending. -/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

/-- Between two cycles: phase 0, nothing pending. -/
def Agent.Idle (a : Agent σ) : Prop := a.phase = 0 ∧ a.pending = none

theorem Config.apply_phase (C : Config σ) (e : Effect σ) (i : Fin σ.k) :
    (C.apply e).agents[i].phase = C.agents[i].phase := by
  rw [Config.apply_agent]

theorem computeAll_phase (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (computeAll C ds).agents[i].phase = C.agents[i].phase := by
  simp only [computeAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

theorem moveAll_phase (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (moveAll ts C ds).agents[i].phase = C.agents[i].phase := by
  simp only [moveAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

namespace Model

variable (m : Model σ) (act0 : σ.A)

/-- With atomic cycles, the advance keeps every agent between two cycles. -/
theorem advance_idle (hev : m.scheduler.events.length = 1) (D : Config σ) (active : List (Fin σ.k))
    (ds : Fin σ.k → Decision σ) (hD : ∀ i : Fin σ.k, D.agents[i].Idle) : ∀ i : Fin σ.k, (m.advance D active ds).agents[i].Idle := by
  intro i
  simp only [Model.advance, Fin.getElem_fin, Vector.getElem_ofFn]
  split
  · have hz : (D.agents[i].phase + 1) % m.scheduler.events.length = 0 := by rw [hev]; exact Nat.mod_one _
    simp only [Fin.getElem_fin] at hz
    exact ⟨hz, by simp only [hz, ite_true]⟩
  · exact hD i

/-- Under a scheduler with atomic cycles, a step keeps every agent between two cycles. -/
theorem atomic_step (hev : m.scheduler.events.length = 1) {C C' : Config σ} {w : Witness}
    (h : m.Step act0 C w C') (hC : ∀ i : Fin σ.k, C.agents[i].Idle) : ∀ i : Fin σ.k, C'.agents[i].Idle := by
  obtain ⟨_, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨_, ts, _, -, ⟨_, e1, _, -, ⟨_, s, _, -, ⟨_, looked, _, -, ⟨_, e2, _, -, ⟨_, e3, _, -, ⟨_, e4, _, -,
    ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := h
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  -- Every stage before the advance keeps phases and pending decisions.
  have keep : ∀ D : Config σ, (∀ i : Fin σ.k, D.agents[i].Idle) → ∀ e : Effect σ, ∀ i : Fin σ.k, (D.apply e).agents[i].Idle :=
    fun D hD e i => by unfold Agent.Idle; rw [Config.apply_phase, Config.apply_pending]; exact hD i
  have h2 := keep _ (keep _ hC e1) s.2
  have h3 : ∀ ds, ∀ i : Fin σ.k, (computeAll ((((C.apply e1).apply s.2).apply e2)) ds).agents[i].Idle :=
    fun ds i => by unfold Agent.Idle; rw [computeAll_phase, computeAll_pending]; exact keep _ h2 e2 i
  have h4 : ∀ ds ds', ∀ i : Fin σ.k, (moveAll ts ((computeAll ((((C.apply e1).apply s.2).apply e2)) ds).apply e3) ds').agents[i].Idle :=
    fun ds ds' i => by unfold Agent.Idle; rw [moveAll_phase, moveAll_pending]; exact keep _ (h3 ds) e3 i
  exact m.advance_idle hev _ _ _ (keep _ (h4 _ _) e4)

end Model
end Simulant
