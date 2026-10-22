import Simulant.NonVacuity

/-!
# Invariants of public states

The public state of an agent changes only through the algorithm's step:
components never write it, and agents that do not decide keep it. So a
property of public states that the step preserves holds of every agent in
every reachable configuration, whatever the components.
-/

namespace Simulant

variable {σ : Sig} [FlagSet σ.F]

omit [FlagSet σ.F] in
theorem Decision.idle_pub (a : Agent σ) (act : σ.A) : (Decision.idle a act).pub = a.pub := rfl

theorem Config.apply_pub (C : Config σ) (e : Effect σ) (i : Fin σ.k) : (C.apply e).agents[i].pub = C.agents[i].pub := by
  rw [Config.apply_agent]

theorem moveAll_pub (ts : TState σ.S) (C : Config σ) (ds : Fin σ.k → Decision σ) (i : Fin σ.k) :
    (moveAll ts C ds).agents[i].pub =
      if ((ds i).decided && FlagSet.acts C.agents[i].flags != .never) = true then (ds i).pub else C.agents[i].pub := by
  simp only [moveAll, Fin.getElem_fin, Vector.getElem_ofFn]
  split <;> rfl

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

/-- A property of public states preserved by the step holds of every agent after a round. -/
theorem step_pub {C C' : Config σ} {w : Witness} (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub)
    (h : m.Step act0 C w C') (hC : ∀ i : Fin σ.k, P C.agents[i].pub) : ∀ i : Fin σ.k, P C'.agents[i].pub := by
  obtain ⟨_, h⟩ := h
  simp only [Model.roundA, ND.mem_bind, ND.mem_pure] at h
  obtain ⟨_, ts, _, -, ⟨_, e1, _, -, ⟨_, act, _, -, ⟨_, ds, _, hd, ⟨_, e2, _, -, ⟨_, e3, _, -, ⟨-, heq⟩, -⟩, -⟩, -⟩, -⟩, -⟩, -⟩ := h
  obtain ⟨-, rfl⟩ := Prod.mk.inj heq
  have h1 : ∀ i : Fin σ.k, P (C.apply e1).agents[i].pub := by intro i; rw [Config.apply_pub]; exact hC i
  have hds := m.decideAll_pub act0 P ts (C.apply e1) hstep h1 act _ (fun j => by rw [Decision.idle_pub]; exact h1 j) ds ⟨_, hd⟩
  intro i
  rw [Config.apply_pub, moveAll_pub, Config.apply_pub]
  split
  · exact hds i
  · exact h1 i

/-- ... and so of every agent in every reachable configuration. -/
theorem reachable_pub (init : ND (Config σ)) (hstep : ∀ mem pub L e, P pub → P (m.step mem pub L e).pub)
    (hinit : ∀ C, ND.Can init C → ∀ i : Fin σ.k, P C.agents[i].pub) {C : Config σ}
    (h : m.Reachable act0 init C) : ∀ i : Fin σ.k, P C.agents[i].pub := by
  induction h with
  | init hC => exact hinit _ hC
  | step _ hs ih => exact m.step_pub act0 P hstep ⟨_, hs⟩ ih

end Model
end Simulant
