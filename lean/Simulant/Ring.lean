/-!
# Rings, static and dynamic

Nodes of a ring of size `N` are `Fin N`; edge `e` joins nodes `e` and
`e + 1`. A frame is a `Bool` (mirrored or not). The per-round state of a
dynamic ring is the list of missing edges, in the interpreter's order.
-/

namespace Simulant

inductive Move where
  | stay | cw | ccw
deriving DecidableEq, Repr, Inhabited

def Move.flip : Move → Move
  | .cw => .ccw
  | .ccw => .cw
  | .stay => .stay

/-- A local move, mapped to a global one through a frame. -/
def toGlobal (mirrored : Bool) (m : Move) : Move := if mirrored then m.flip else m

/-- The per-round state of the topology: the missing edges. -/
abbrev TState := List Nat

namespace Ring

variable {N : Nat}

def succ (p : Fin N) : Fin N := ⟨(p.val + 1) % N, Nat.mod_lt _ (by have := p.isLt; omega)⟩
def pred (p : Fin N) : Fin N := ⟨(p.val + N - 1) % N, Nat.mod_lt _ (by have := p.isLt; omega)⟩

/-- The neighbour in a global direction, whether or not the edge is present. -/
def target (p : Fin N) : Move → Fin N
  | .stay => p
  | .cw => succ p
  | .ccw => pred p

/-- The node seen at local offset `i` from `p`, in a frame. -/
def offset (p : Fin N) (mirrored : Bool) (i : Nat) : Fin N :=
  if mirrored then ⟨(p.val + N - i % N) % N, Nat.mod_lt _ (by have := p.isLt; omega)⟩
  else ⟨(p.val + i) % N, Nat.mod_lt _ (by have := p.isLt; omega)⟩

/-- The node reached from `p` after `i` steps in a global direction, edges present or not. -/
def advance (p : Fin N) : Move → Nat → Fin N
  | .stay, _ => p
  | .cw, i => offset p false i
  | .ccw, i => offset p true i

/-- Whether moving from `p` in direction `m` uses an edge present in state `ts`. -/
def canMove (ts : TState) (p : Fin N) : Move → Bool
  | .stay => true
  | .cw => !ts.contains p.val
  | .ccw => !ts.contains ((p.val + N - 1) % N)

/-- Sets of at most `k` missing edges, extending `cur` with candidates in order. -/
def extend (k : Nat) (cur : List Nat) : List Nat → List (List Nat)
  | [] => []
  | e :: rest =>
    let next := cur ++ [e]
    (if next.length ≤ k then next :: extend k next rest else []) ++ extend k cur rest

/-- The states of `DynamicRing k`: at most `k` missing edges. -/
def dynamicStates (N k : Nat) : List TState := [] :: extend k [] (List.range N)

/-- The single state of a static ring. -/
def staticStates : List TState := [[]]

/-- Rotation by `r`. -/
def rot (r : Nat) (p : Fin N) : Fin N := ⟨(p.val + r) % N, Nat.mod_lt _ (by have := p.isLt; omega)⟩

end Ring
end Simulant

namespace Simulant.Ring

variable {N : Nat}

theorem rot_val (r : Nat) (p : Fin N) : (rot r p).val = (p.val + r) % N := rfl

theorem rot_rot (a b : Nat) (p : Fin N) : rot a (rot b p) = rot (b + a) p := by
  apply Fin.ext
  simp only [rot_val, Nat.mod_add_mod, Nat.add_assoc]

/-- Rotating by a multiple of `N` is the identity. -/
theorem rot_mul (m : Nat) (p : Fin N) : rot (N * m) p = p := by
  apply Fin.ext
  show (p.val + N * m) % N = p.val
  rw [Nat.add_mul_mod_self_left, Nat.mod_eq_of_lt p.isLt]

/-- The inverse of rotation by `r`. -/
def unrot (r : Nat) (p : Fin N) : Fin N := rot (N - r % N) p

theorem unrot_rot (r : Nat) (p : Fin N) : unrot r (rot r p) = p := by
  have hN : 0 < N := Nat.lt_of_le_of_lt (Nat.zero_le _) p.isLt
  have h : r + (N - r % N) = N * (r / N + 1) := by
    have := Nat.mod_add_div r N
    have := Nat.mod_lt r hN
    rw [Nat.mul_add, Nat.mul_one]
    omega
  rw [unrot, rot_rot, h, rot_mul]

theorem rot_inj (r : Nat) {p q : Fin N} (h : rot r p = rot r q) : p = q := by
  rw [← unrot_rot r p, h, unrot_rot]

@[simp] theorem rot_eq_rot (r : Nat) (p q : Fin N) : rot r p = rot r q ↔ p = q :=
  ⟨rot_inj r, fun h => h ▸ rfl⟩

@[simp] theorem rot_beq (r : Nat) (p q : Fin N) : (rot r p == rot r q) = (p == q) := by
  by_cases h : p = q
  · subst h; rw [beq_self_eq_true, beq_self_eq_true]
  · have : rot r p ≠ rot r q := fun e => h (rot_inj r e)
    rw [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]

theorem rot_target (r : Nat) (p : Fin N) (m : Move) : target (rot r p) m = rot r (target p m) := by
  have hN : 0 < N := Nat.lt_of_le_of_lt (Nat.zero_le _) p.isLt
  cases m with
  | stay => rfl
  | cw =>
    apply Fin.ext
    show ((p.val + r) % N + 1) % N = ((p.val + 1) % N + r) % N
    rw [Nat.mod_add_mod, Nat.mod_add_mod, Nat.add_right_comm]
  | ccw =>
    apply Fin.ext
    show ((p.val + r) % N + N - 1) % N = ((p.val + N - 1) % N + r) % N
    have h1 : (p.val + r) % N + N - 1 = (p.val + r) % N + (N - 1) := by omega
    have h2 : p.val + N - 1 = p.val + (N - 1) := by omega
    rw [h1, h2, Nat.mod_add_mod, Nat.mod_add_mod, Nat.add_right_comm]

end Simulant.Ring
