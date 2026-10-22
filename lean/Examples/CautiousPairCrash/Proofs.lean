import Examples.CautiousPairCrash.Model
import Simulant.LibraryLemmas.BlackHole

/-! Hand-written proofs about the generated model. Regenerating the model never touches this file. -/

namespace Examples.CautiousPairCrash
open Simulant

/-- The hole never moves: the library lemma `BlackHole.site_stays`, applied to this composition
without restating it. The side condition is the generated `others_preserve_BlackHole`. -/
theorem site_invariant (N : Nat) [NeZero N] (k : Nat) {C C' : Config (sig N k)} {w : Witness}
    (h : (model N k).Step act0 C w C') : C'.world.BlackHole.site = C.world.BlackHole.site :=
  Simulant.Library.BlackHole.site_stays (model N k) act0 _ (ctx_BlackHole N k) (others_preserve_BlackHole N k) h

end Examples.CautiousPairCrash
