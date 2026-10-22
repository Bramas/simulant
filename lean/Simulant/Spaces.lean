import Simulant.Views

/-!
# Library spaces with closed forms (`packages/stdlib/sim/spaces.sim`)

`Graphs.Cycle n` and `Graphs.Line` are written here by hand, with positions `Fin n` and `Int`,
so that proofs about them use plain arithmetic. The generator uses them when an experiment's
space is the library's; other spaces are generated from their IR. Their neighbors are the IR's:
port 0 to `v + 1`, port 1 to `v - 1` (mod `n` on the cycle).
-/

namespace Simulant.Spaces

/-- The cycle C_n. For n = 2, both ports of a vertex lead to the other vertex. -/
def cycle (n : Nat) [NeZero n] : Space where
  Pos := Fin n
  neighbors p :=
    [⟨(p.val + 1) % n, Nat.mod_lt _ (by have := p.isLt; omega)⟩,
     ⟨(p.val + n - 1) % n, Nat.mod_lt _ (by have := p.isLt; omega)⟩]
  vertices := some (List.finRange n)
  maxDegree := 2
  le a b := a.val ≤ b.val
  ofNat v := Fin.ofNat n v
  ofInt v := Fin.ofNat n (v % n).toNat

/-- The infinite line. -/
def line : Space where
  Pos := Int
  neighbors v := [v + 1, v - 1]
  maxDegree := 2
  le a b := a ≤ b
  ofNat v := v
  ofInt v := v

/-- A position of the cycle from a vertex number (mod n). -/
def cyclePos (n : Nat) [NeZero n] (v : Nat) : (cycle n).Pos := Fin.ofNat n v

/-- Rotation by `r`, an automorphism of the cycle. -/
def rot {n : Nat} [NeZero n] (r : Nat) (p : (cycle n).Pos) : (cycle n).Pos :=
  ⟨(p.val + r) % n, Nat.mod_lt _ (by have := p.isLt; omega)⟩

theorem rot_val {n : Nat} [NeZero n] (r : Nat) (p : (cycle n).Pos) : (rot r p).val = (p.val + r) % n := rfl

theorem rot_rot {n : Nat} [NeZero n] (a b : Nat) (p : (cycle n).Pos) : rot a (rot b p) = rot (b + a) p := by
  apply Fin.ext
  simp only [rot_val, Nat.mod_add_mod, Nat.add_assoc]

/-- Rotating by a multiple of `n` is the identity. -/
theorem rot_mul {n : Nat} [NeZero n] (m : Nat) (p : (cycle n).Pos) : rot (n * m) p = p := by
  apply Fin.ext
  show (p.val + n * m) % n = p.val
  rw [Nat.add_mul_mod_self_left, Nat.mod_eq_of_lt p.isLt]

/-- The inverse of rotation by `r`. -/
def unrot {n : Nat} [NeZero n] (r : Nat) (p : (cycle n).Pos) : (cycle n).Pos := rot (n - r % n) p

theorem unrot_rot {n : Nat} [NeZero n] (r : Nat) (p : (cycle n).Pos) : unrot r (rot r p) = p := by
  have hN : 0 < n := Nat.lt_of_le_of_lt (Nat.zero_le _) p.isLt
  have h : r + (n - r % n) = n * (r / n + 1) := by
    have := Nat.mod_add_div r n
    have := Nat.mod_lt r hN
    rw [Nat.mul_add, Nat.mul_one]
    omega
  rw [unrot, rot_rot, h, rot_mul]

theorem rot_inj {n : Nat} [NeZero n] (r : Nat) {p q : (cycle n).Pos} (h : rot r p = rot r q) : p = q := by
  rw [← unrot_rot r p, h, unrot_rot]

@[simp] theorem rot_beq {n : Nat} [NeZero n] (r : Nat) (p q : (cycle n).Pos) : (rot r p == rot r q) = (p == q) := by
  by_cases h : p = q
  · subst h; rw [beq_self_eq_true, beq_self_eq_true]
  · have : rot r p ≠ rot r q := fun e => h (rot_inj r e)
    rw [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]

@[simp] theorem rot_eq_rot {n : Nat} [NeZero n] (r : Nat) (p q : (cycle n).Pos) : rot r p = rot r q ↔ p = q :=
  ⟨rot_inj r, fun h => h ▸ rfl⟩

/-- Rotations are automorphisms of the cycle, ports included. -/
theorem rot_auto {n : Nat} [NeZero n] (r : Nat) : (cycle n).Auto (rot r) where
  inj _ _ h := rot_inj r h
  nbrs p := by
    have hN : 0 < n := Nat.lt_of_le_of_lt (Nat.zero_le _) p.isLt
    show [_, _] = [_, _]
    congr 1
    · apply Fin.ext
      show ((p.val + r) % n + 1) % n = ((p.val + 1) % n + r) % n
      rw [Nat.mod_add_mod, Nat.mod_add_mod, Nat.add_right_comm]
    · congr 1
      apply Fin.ext
      show ((p.val + r) % n + n - 1) % n = ((p.val + n - 1) % n + r) % n
      have h1 : (p.val + r) % n + n - 1 = (p.val + r) % n + (n - 1) := by omega
      have h2 : p.val + n - 1 = p.val + (n - 1) := by omega
      rw [h1, h2, Nat.mod_add_mod, Nat.mod_add_mod, Nat.add_right_comm]

end Simulant.Spaces
