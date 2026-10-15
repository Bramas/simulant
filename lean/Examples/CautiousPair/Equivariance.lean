import Examples.CautiousPair.Model
import Simulant.Equivariance

/-! Rotation equivariance of the generated cautious-pair model (plan Phase 2), from the library
lemma `Model.step_app`: rotating every position and the hole's site maps steps to steps, with the
same witness. -/

namespace Examples.CautiousPair
open Simulant

variable {N k : Nat}

/-- Rotation by `r` of the configurations of this model. -/
def rot (r : Nat) : CfgMap (sig N k) :=
  ⟨Ring.rot r, fun w => { BlackHole := { w.BlackHole with site := Ring.rot r w.BlackHole.site } }⟩

theorem view_rot (r : Nat) (ts : TState) (C : Config (sig N k)) (me : Fin k) (f : Bool) :
    view N k ts ((rot r).app C) me f = view N k ts C me f := by
  simp [view, sensor_otherStates, rot, CfgMap.app, Vector.getElem_map]

theorem step_rot (r : Nat) {C C' : Config (sig N k)} {w : Witness}
    (h : (model N k).Step act0 C w C') : (model N k).Step act0 ((rot r).app C) w ((rot r).app C') := by
  refine Model.step_app (model N k) act0 (rot r) (fun p mv => Ring.rot_target r p mv) ?_ ?_ ?_ ?_ ?_ ?_ h
  · -- the ring is static: every edge is present
    intro ts hts p mv
    simp only [model, Ring.staticStates, List.mem_singleton] at hts
    subst hts
    cases mv <;> rfl
  · intro ts C i f; exact view_rot r ts C i f
  · intro c hc ts C; simp only [model, List.mem_singleton] at hc; subst hc; rfl
  · intro c hc ts C ds; simp only [model, List.mem_singleton] at hc; subst hc; rfl
  · intro c hc ts C; simp only [model, List.mem_singleton] at hc; subst hc
    simp [Library.BlackHole.component, Library.BlackHole.hooks, Hooks.toComponent, rot, ctx_BlackHole,
      CfgMap.app, Vector.getElem_map]
  · intro c hc ts C ds e he; simp only [model, List.mem_singleton] at hc; subst hc
    rcases he with he | he | he <;> obtain ⟨e', he', rfl⟩ := ND.can_map.1 he
    · rw [ND.can_pure.1 he']; intro w; rfl
    · rw [ND.can_pure.1 he']; intro w; rfl
    · obtain ⟨_, -, rfl⟩ := ND.can_map.1 he'; intro w; rfl

end Examples.CautiousPair
