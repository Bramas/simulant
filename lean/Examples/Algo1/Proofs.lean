import Examples.Algo1.Model
import Simulant.Invariants

/-! Hand-written proofs about the paper's Algorithm 1, generated from its structured `.sim`
source (`projects/black-hole-search/sim/algo1.sim`). -/

namespace Examples.Algo1
open Simulant

/-- An agent claims nothing, or the clockwise port (`Port.cw`, 0): the only claim the algorithm makes. -/
def ClaimsCw (p : Pub) : Prop := p.bh = none ∨ p.bh = some 0

/-- The lowered step function, from every value of the program counter, keeps the property. -/
theorem step_claims (N : Nat) [NeZero N] (k : Nat) (mem : Mem) (pub : Pub) (L : Look (sig N k)) (E : Env)
    (h : ClaimsCw pub) : ClaimsCw (step N k mem pub L E).pub := by
  obtain ⟨pc⟩ := mem
  cases pc <;> simp only [step] <;> (try split) <;> simp_all [ClaimsCw, «Port.cw»]

/-- An invariant of the generated model: in every reachable configuration, every agent's claim
is nothing or the clockwise direction. -/
theorem reachable_claims (N : Nat) [NeZero N] (site : (space N).Pos) (C : Config (sig N (count N site)))
    (h : (model N (count N site)).Reachable act0 (init N site) C) :
    ∀ i : Fin (count N site), ClaimsCw C.agents[i].pub :=
  (model N (count N site)).reachable_pub act0 ClaimsCw (init N site) (fun mem pub L E hp => step_claims N _ mem pub L E hp)
    (fun C hC i => by
      obtain ⟨_, -, rfl⟩ := ND.can_map.1 hC
      left
      simp) h

end Examples.Algo1
