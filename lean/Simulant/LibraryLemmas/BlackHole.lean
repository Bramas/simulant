import Simulant.NonVacuity
import Simulant.Library.BlackHole

/-!
# Lemmas about the black hole, for every model that contains it

Hand-written, once per library version (plan, Section 5.1). They are
stated for any list of components, given that the other components
preserve the black hole's part of the world; a generated model file
proves that hypothesis (`others_preserve_BlackHole`), because components
only write their own part.
-/

namespace Simulant.Library.BlackHole
open Simulant

variable {σ : Sig} [FlagSet σ.F] [Flags σ.F]

/-- The black hole's own effects never change its site. -/
theorem hooks_keep_site (policy : HolePolicy) (L : Ctx σ) :
    (∀ ts C e, ND.Can ((hooks policy L).beforeLook ts C) e → ∀ x, (e.world x).site = x.site) ∧
    (∀ ts C ds e, ND.Can ((hooks policy L).beforeMove ts C ds) e → ∀ x, (e.world x).site = x.site) ∧
    (∀ ts C e, ND.Can ((hooks policy L).afterMove ts C) e → ∀ x, (e.world x).site = x.site) := by
  refine ⟨fun ts C e he x => ?_, fun ts C ds e he x => ?_, fun ts C e he x => ?_⟩
  · rw [ND.can_pure.1 he]; rfl
  · rw [ND.can_pure.1 he]; rfl
  · obtain ⟨_, -, rfl⟩ := ND.can_map.1 he; rfl

/-- The site of the black hole never changes, whatever the other components. -/
theorem site_stays (m : Model σ) (act0 : σ.A) (policy : HolePolicy) (L : Ctx σ) [LawfulLens L.world]
    (hc : ∀ c ∈ m.components, c = component policy L ∨ c.Preserves L.world.get)
    {C C' : Config σ} {w : Witness} (hs : m.Step act0 C w C') :
    (L.world.get C'.world).site = (L.world.get C.world).site :=
  m.step_preserves act0 (g := fun w => (L.world.get w).site) (fun c hcm => by
    rcases hc c hcm with rfl | hp
    · exact Hooks.toComponent_preserves_own (hooks policy L) L.world (Lens.unit σ.X) (fun x : World σ.S.Pos => x.site)
        (hooks_keep_site policy L)
    · exact hp.comp (·.site)) hs

/-- Every hook of the black hole always has an outcome. -/
theorem component_total (policy : HolePolicy) (L : Ctx σ) : (component policy L).Total := by
  refine ⟨fun ts C => ⟨_, ND.can_bind_of (ND.can_pure.2 rfl) (ND.can_pure.2 rfl)⟩,
    fun ts C ds => ⟨_, ND.can_bind_of (ND.can_pure.2 rfl) (ND.can_pure.2 rfl)⟩, fun ts C => ?_⟩
  unfold component Hooks.toComponent hooks
  dsimp only
  by_cases h : (policy == HolePolicy.mayEmerge && !(L.world.get C.world).active) = true
  · exact ⟨_, ND.can_bind_of (ND.can_bind_of (by simp only [h, ↓reduceIte]; exact ND.can_choose.2 (List.mem_cons_self))
      (ND.can_pure.2 rfl)) (ND.can_pure.2 rfl)⟩
  · exact ⟨_, ND.can_bind_of (ND.can_bind_of (by simp only [h, Bool.false_eq_true, ↓reduceIte]; exact ND.can_pure.2 rfl)
      (ND.can_pure.2 rfl)) (ND.can_pure.2 rfl)⟩

end Simulant.Library.BlackHole
