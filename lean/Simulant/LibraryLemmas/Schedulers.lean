import Simulant.NonVacuity
import Simulant.Library.FSync

/-!
# Lemmas about the library's schedulers, for every model that uses them

Hand-written, once per library version, like the component lemmas.
-/

namespace Simulant.Library.FSync
open Simulant

variable {σ : Sig} [FlagSet σ.F] [Flags σ.F] [Actions σ.A]

/-- FSYNC always has an outcome: every eligible agent. -/
theorem total (events : List (List Instant)) (L : Ctx σ) : (scheduler events L).Total := by
  intro ts C _
  exact ⟨_, ND.can_bind_of (ND.can_pure.2 rfl) (ND.can_pure.2 rfl)⟩

end Simulant.Library.FSync
