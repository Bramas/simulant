/-!
# Nondeterminism with witnesses

The adversary's choices form a list monad: a computation is the list of
its outcomes, each with the witness of the choices that lead to it. A
witness is a list of (site, index) pairs, the same as the interpreter's
witnesses without their display labels.

The step relation of a model is membership in this list, so the
computable round and the relational semantics are the same object.
-/

namespace Simulant

abbrev Witness := List (String × Nat)

/-- A nondeterministic computation: its outcomes, with their witnesses. -/
abbrev ND (α : Type) : Type := List (Witness × α)

namespace ND

def pure (a : α) : ND α := [([], a)]

def bind (m : ND α) (f : α → ND β) : ND β :=
  List.flatMap (fun (w, a) => (f a).map fun (w', b) => (w ++ w', b)) m

instance : Monad ND where
  pure := ND.pure
  bind := ND.bind

/-- An adversary choice among `xs`; the witness records the index. -/
def choose (site : String) (xs : List α) : ND α :=
  (xs.zipIdx).map fun (x, i) => ([(site, i)], x)

/-- A choice among the elements of `xs` satisfying `p`; indices are positions in `xs`. -/
def chooseSuch (site : String) (xs : List α) (p : α → Bool) : ND α :=
  ((xs.zipIdx).filter fun (x, _) => p x).map fun (x, i) => ([(site, i)], x)

/-- `m` can produce `a`, with some witness. -/
def Can (m : ND α) (a : α) : Prop := ∃ w, (w, a) ∈ m

/-- The outcomes, forgetting witnesses. -/
def outcomes (m : ND α) : List α := List.map Prod.snd m

@[simp] theorem mem_pure {a b : α} {w : Witness} : (w, b) ∈ (Pure.pure a : ND α) ↔ w = [] ∧ b = a := by
  show (w, b) ∈ [([], a)] ↔ _
  simp

theorem mem_bind {m : ND α} {f : α → ND β} {w : Witness} {b : β} :
    (w, b) ∈ (m >>= f) ↔ ∃ w₁ a w₂, (w₁, a) ∈ m ∧ (w₂, b) ∈ f a ∧ w = w₁ ++ w₂ := by
  show (w, b) ∈ ND.bind m f ↔ _
  simp only [ND.bind, List.mem_flatMap, List.mem_map, Prod.exists, Prod.mk.injEq]
  constructor
  · rintro ⟨w₁, a, hm, w₂, b', hf, rfl, rfl⟩
    exact ⟨w₁, a, w₂, hm, hf, rfl⟩
  · rintro ⟨w₁, a, w₂, hm, hf, rfl⟩
    exact ⟨w₁, a, hm, w₂, b, hf, rfl, rfl⟩

theorem can_pure {a b : α} : Can (Pure.pure a : ND α) b ↔ b = a := by
  simp [Can]

theorem can_bind {m : ND α} {f : α → ND β} {b : β} :
    Can (m >>= f) b ↔ ∃ a, Can m a ∧ Can (f a) b := by
  simp only [Can, mem_bind]
  constructor
  · rintro ⟨w, w₁, a, w₂, hm, hf, rfl⟩
    exact ⟨a, ⟨w₁, hm⟩, ⟨w₂, hf⟩⟩
  · rintro ⟨a, ⟨w₁, hm⟩, ⟨w₂, hf⟩⟩
    exact ⟨w₁ ++ w₂, w₁, a, w₂, hm, hf, rfl⟩

theorem mem_choose {site : String} {xs : List α} {w : Witness} {x : α} :
    (w, x) ∈ choose site xs ↔ ∃ i, (x, i) ∈ xs.zipIdx ∧ w = [(site, i)] := by
  simp only [choose, List.mem_map, Prod.exists, Prod.mk.injEq]
  constructor
  · rintro ⟨y, i, h, rfl, rfl⟩; exact ⟨i, h, rfl⟩
  · rintro ⟨i, h, rfl⟩; exact ⟨x, i, h, rfl, rfl⟩

theorem can_choose {site : String} {xs : List α} {x : α} : Can (choose site xs) x ↔ x ∈ xs := by
  simp only [Can, mem_choose, List.mem_zipIdx_iff_getElem?]
  constructor
  · rintro ⟨_, i, h, -⟩
    exact List.mem_iff_getElem?.2 ⟨i, h⟩
  · intro h
    obtain ⟨i, hi⟩ := List.mem_iff_getElem?.1 h
    exact ⟨_, i, hi, rfl⟩

end ND
end Simulant
