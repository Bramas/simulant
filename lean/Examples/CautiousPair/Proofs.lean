import Examples.CautiousPair.Model
import Simulant.LibraryLemmas.BlackHole
import Simulant.LibraryLemmas.Schedulers

/-! Hand-written proofs about the generated model. Regenerating the model never touches this file. -/

namespace Examples.CautiousPair
open Simulant

/-- The hole never moves: the library lemma `BlackHole.site_stays`, applied to this composition
without restating it. The side conditions are the generated `others_preserve_BlackHole` and
`scheduler_preserves_BlackHole`. -/
theorem site_invariant (N : Nat) [NeZero N] (k : Nat) {C C' : Config (sig N k)} {w : Witness}
    (h : (model N k).Step act0 C w C') : C'.world.BlackHole.site = C.world.BlackHole.site :=
  Simulant.Library.BlackHole.site_stays (model N k) act0 _ (ctx_BlackHole N k) (others_preserve_BlackHole N k)
    (scheduler_preserves_BlackHole N k) h

end Examples.CautiousPair

namespace Examples.CautiousPair
open Simulant

/-- The generated non-vacuity statement: an initial configuration, a successor for every
reachable configuration, and an admissible execution, for every value of the parameters. -/
theorem nonVacuity : NonVacuity := by
  intro N _ _ site _
  have htot := (model N 2).total act0 (by simp [model])
    (by
      intro c hc
      simp only [model, List.mem_singleton] at hc
      subst hc
      exact Simulant.Library.BlackHole.component_total _ _)
    (Simulant.Library.FSync.total _ _)
    (fun a => by simp [Model.presentations, model])
    (fun L => ⟨_, ND.can_bind_of (ND.can_pure.2 rfl) (ND.can_pure.2 rfl)⟩)
  have hinit : (model N 2).HasInitial (init N site) :=
    ⟨_, ND.can_bind_of (ND.can_bind_of (ND.can_pure.2 rfl) (ND.can_bind_of (ND.can_pure.2 rfl)
      (ND.can_pure.2 rfl))) (ND.can_pure.2 rfl)⟩
  exact ⟨hinit, fun C _ => htot C, (model N 2).hasExecution act0 _ rfl hinit htot⟩

end Examples.CautiousPair

namespace Examples.CautiousPair
open Simulant

/-- An invariant of the generated model: in every reachable configuration, the hole is at the
`site` parameter of the experiment. -/
theorem reachable_site (N : Nat) [NeZero N] (site : (space N).Pos) (C : Config (sig N 2))
    (h : (model N 2).Reachable act0 (init N site) C) : C.world.BlackHole.site = site := by
  induction h with
  | init hC =>
    obtain ⟨w, hw, rfl⟩ := ND.can_map.1 hC
    obtain ⟨s, hs, hw⟩ := ND.can_bind.1 hw
    obtain ⟨a, ha, hw⟩ := ND.can_bind.1 hw
    rw [ND.can_pure.1 hw, ND.can_pure.1 hs]
  | step _ hs ih =>
    rw [site_invariant N 2 ⟨_, hs⟩]
    exact ih

end Examples.CautiousPair
