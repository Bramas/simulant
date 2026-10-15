import Simulant.Round

/-!
# Builtins of the IR that are not plain Lean functions

Same semantics as the interpreter (`packages/engine/src/compile.ts`).
Multisets are lists here; generated code only applies to them operations
that do not depend on the order of their elements.
-/

namespace Simulant.B

/-- Sub-lists with at most `k` elements, smallest first, then in order of positions. -/
def subsetsUpTo (k : Nat) (l : List α) : List (List α) :=
  (List.range (min k l.length + 1)).flatMap fun s => combos s l

def subsets (l : List α) : List (List α) := subsetsUpTo l.length l

/-- Multiset difference: removes one occurrence per element of `b`. -/
def diff [BEq α] (a b : List α) : List α := b.foldl List.erase a

def ofFn (n : Nat) (f : Nat → α) : List α := (List.range n).map f

end Simulant.B
