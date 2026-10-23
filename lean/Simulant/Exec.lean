import Simulant.Round

/-!
# Executions, tasks and non-vacuity (plan, Sections 3.9, 3.10 and 5.2)

Every execution permitted by the step is considered (no fairness on the
adversary's choices), except that a scheduler with `Fairness.activation` only admits
executions in which every agent that acts forever takes events infinitely often.
-/

namespace Simulant

inductive Verdict where
  | success | failure | inProgress
deriving DecidableEq, Repr

inductive Goal where
  | eventually | eventuallyAlways | safety
deriving DecidableEq, Repr

variable {σ : Sig}

structure Execution (σ : Sig) where
  config : Nat → Config σ
  witness : Nat → Witness
  active : Nat → List (Fin σ.k)

def Satisfies (goal : Goal) (verdict : Config σ → Verdict) (e : Execution σ) : Prop :=
  match goal with
  | .safety => ∀ n, verdict (e.config n) ≠ .failure
  | .eventually => ∃ n, verdict (e.config n) = .success ∧ ∀ j, j ≤ n → verdict (e.config j) ≠ .failure
  | .eventuallyAlways =>
    (∀ n, verdict (e.config n) ≠ .failure) ∧ ∃ n, ∀ j, n ≤ j → verdict (e.config j) = .success

namespace Model

variable [FlagSet σ.F] (m : Model σ) (act0 : σ.A) (init : ND (Config σ))

/-- Starts in an initial configuration and follows the round. -/
def Valid (e : Execution σ) : Prop :=
  ND.Can init (e.config 0) ∧
    ∀ n, (e.witness n, (e.active n, e.config (n + 1))) ∈ m.roundA act0 (e.config n)

/-- Every agent that acts forever takes events infinitely often. -/
def Fair (e : Execution σ) : Prop :=
  ∀ a : Fin σ.k, (∀ n, FlagSet.acts (e.config n).agents[a].flags ≠ .never) →
    ∀ n, ∃ j, n ≤ j ∧ a ∈ e.active j

def Admissible (e : Execution σ) : Prop :=
  m.Valid act0 init e ∧ (m.scheduler.fairness = .activation → Fair e)

/-- The correctness statement: every admissible execution satisfies the goal. -/
def Correct (verdict : Config σ → Verdict) (goal : Goal) : Prop :=
  ∀ e, m.Admissible act0 init e → Satisfies goal verdict e

inductive Reachable : Config σ → Prop where
  | init {C} : ND.Can init C → Reachable C
  | step {C C' w a} : Reachable C → (w, (a, C')) ∈ m.roundA act0 C → Reachable C'

/-! Non-vacuity: the model is not empty, so a correctness theorem is not vacuous. -/

omit [FlagSet σ.F] in
/-- (The model is an argument only so that `m.HasInitial init` reads like the other statements.) -/
def HasInitial (_m : Model σ) (init : ND (Config σ)) : Prop := ∃ C, ND.Can init C

def Total : Prop := ∀ C, Reachable m act0 init C → ∃ w a C', (w, (a, C')) ∈ m.roundA act0 C

def HasExecution : Prop := ∃ e, m.Admissible act0 init e

end Model

/-! ## Lassos

A finite lasso found by the explorer, checked by evaluation, gives an
admissible execution (for a scheduler without fairness assumption). -/

structure Lasso (σ : Sig) where
  start : Config σ
  /-- Each step: witness, activated agents, next configuration. -/
  steps : List (Witness × List (Fin σ.k) × Config σ)
  /-- The last configuration equals the configuration at this position (0 is `start`). -/
  loop : Nat

namespace Lasso

def configs (l : Lasso σ) : List (Config σ) := l.start :: l.steps.map (·.2.2)

/-- The position in the lasso after `n` steps. -/
def pos (l : Lasso σ) : Nat → Nat
  | 0 => 0
  | n + 1 => if l.pos n + 1 = l.steps.length then l.loop else l.pos n + 1

theorem pos_lt (l : Lasso σ) (h : l.loop < l.steps.length) : ∀ n, l.pos n < l.steps.length := by
  intro n
  induction n with
  | zero => simp [pos]; omega
  | succ n ih => simp only [pos]; split <;> omega

theorem length_configs (l : Lasso σ) : l.configs.length = l.steps.length + 1 := by
  simp [configs]

def toExecution (l : Lasso σ) (h : l.loop < l.steps.length) : Execution σ where
  config n := l.configs[l.pos n]'(by have := l.pos_lt h n; rw [length_configs]; omega)
  witness n := (l.steps[l.pos n]'(l.pos_lt h n)).1
  active n := (l.steps[l.pos n]'(l.pos_lt h n)).2.1

variable [FlagSet σ.F]

/-- Every step of the lasso is a step of the round, and it closes on itself. -/
def Valid (m : Model σ) (act0 : σ.A) (l : Lasso σ) : Prop :=
  l.loop < l.steps.length ∧
  (∀ i (h : i < l.steps.length),
    l.steps[i] ∈ m.roundA act0 (l.configs[i]'(by rw [length_configs]; omega))) ∧
  l.configs[l.steps.length]? = l.configs[l.loop]?

omit [FlagSet σ.F] in
theorem config_succ (l : Lasso σ) (h : l.loop < l.steps.length)
    (hclose : l.configs[l.steps.length]? = l.configs[l.loop]?) (n : Nat) :
    (l.toExecution h).config (n + 1) =
      (l.steps[l.pos n]'(l.pos_lt h n)).2.2 := by
  have hp := l.pos_lt h n
  simp only [toExecution, pos]
  split
  · rename_i heq
    have h1 : l.configs[l.pos n + 1]? = some (l.steps[l.pos n]'hp).2.2 := by
      simp [configs, hp]
    rw [heq] at h1
    rw [hclose] at h1
    exact Option.some.inj ((List.getElem?_eq_getElem _).symm.trans h1)
  · simp [configs]

theorem toExecution_valid (m : Model σ) (act0 : σ.A) (init : ND (Config σ)) (l : Lasso σ)
    (hv : l.Valid m act0) (hinit : ND.Can init l.start) :
    m.Valid act0 init (l.toExecution hv.1) := by
  obtain ⟨hlt, hsteps, hclose⟩ := hv
  refine ⟨by simpa [toExecution, pos, configs] using hinit, fun n => ?_⟩
  have hp := l.pos_lt hlt n
  rw [config_succ l hlt hclose n]
  have := hsteps (l.pos n) hp
  simpa [toExecution] using this

/-- For a scheduler without fairness assumption, a valid lasso is an admissible execution. -/
theorem hasExecution (m : Model σ) (act0 : σ.A) (init : ND (Config σ)) (l : Lasso σ)
    (hfair : m.scheduler.fairness = .none) (hv : l.Valid m act0) (hinit : ND.Can init l.start) :
    m.HasExecution act0 init :=
  ⟨l.toExecution hv.1, toExecution_valid m act0 init l hv hinit, fun h => absurd (hfair.symm.trans h) (by decide)⟩

end Lasso
end Simulant
