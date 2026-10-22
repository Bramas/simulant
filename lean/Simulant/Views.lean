import Simulant.Space

/-!
# Views under automorphisms

An injective map of positions that commutes with the neighbor lists (an automorphism of the
space, ports included) maps the r-hop view of `o` onto the view of its image: the same
distances and edges, the positions moved. Presentations under port-based frames read only the
distances and edges, so they are the same.
-/

namespace Simulant

theorem List.foldl_hom {α β γ δ : Type _} (F : α → β → α) (G : γ → δ → γ) (h : α → γ) (k : β → δ)
    (hF : ∀ a b, G (h a) (k b) = h (F a b)) : ∀ (l : List β) (a : α), (l.map k).foldl G (h a) = h (l.foldl F a)
  | [], _ => rfl
  | b :: l, a => by
    simp only [List.map_cons, List.foldl_cons, hF]
    exact List.foldl_hom F G h k hF l (F a b)

theorem List.getD_map' {α β : Type _} (f : α → β) (l : List α) (i : Nat) (d : α) :
    (l.map f).getD i (f d) = f (l.getD i d) := by
  simp only [List.getD_eq_getElem?_getD, List.getElem?_map]
  cases l[i]? <;> rfl

namespace Space

variable (S : Space)

/-- `f` is an automorphism of the space: injective, and it maps each neighbor list to the
neighbor list of the image. -/
structure Auto (f : S.Pos → S.Pos) : Prop where
  inj : ∀ p q, f p = f q → p = q
  nbrs : ∀ p, S.neighbors (f p) = (S.neighbors p).map f

variable {S}

theorem Auto.beq {f : S.Pos → S.Pos} (hf : S.Auto f) (p q : S.Pos) : (f p == f q) = (p == q) := by
  by_cases h : p = q
  · subst h; simp
  · have : f p ≠ f q := fun e => h (hf.inj _ _ e)
    rw [beq_eq_false_iff_ne.2 this, beq_eq_false_iff_ne.2 h]

/-- Automorphisms preserve edge presence in a static space. -/
theorem Auto.edgePresent_nil {f : S.Pos → S.Pos} (hf : S.Auto f) (p q : S.Pos) :
    S.edgePresent [] (f p) (f q) = S.edgePresent [] p q := by
  rw [Space.edgePresent_nil, Space.edgePresent_nil, hf.nbrs]
  simp only [List.contains_eq_any_beq, List.any_map, Function.comp_def, hf.beq]

/-- The positions of a breadth-first state, moved by `f`. -/
def mapSeen (f : S.Pos → S.Pos) (acc : List (S.Pos × Nat) × List S.Pos) : List (S.Pos × Nat) × List S.Pos :=
  (acc.1.map fun (x : S.Pos × Nat) => (f x.1, x.2), acc.2.map f)

theorem layer_map {f : S.Pos → S.Pos} (hf : S.Auto f) (seen : List (S.Pos × Nat)) (frontier : List S.Pos) (d : Nat) :
    S.layer (seen.map fun (x : S.Pos × Nat) => (f x.1, x.2)) (frontier.map f) d = mapSeen f (S.layer seen frontier d) := by
  unfold layer
  have inner : ∀ (acc : List (S.Pos × Nat) × List S.Pos) (w : S.Pos),
      (fun (acc : List (S.Pos × Nat) × List S.Pos) w =>
        if acc.1.any (·.1 == w) then acc else (acc.1 ++ [(w, d + 1)], acc.2 ++ [w])) (mapSeen f acc) (f w) =
      mapSeen f ((fun (acc : List (S.Pos × Nat) × List S.Pos) w =>
        if acc.1.any (·.1 == w) then acc else (acc.1 ++ [(w, d + 1)], acc.2 ++ [w])) acc w) := by
    intro acc w
    simp only [mapSeen, List.any_map]
    have : ((fun x : S.Pos × Nat => x.1 == f w) ∘ fun (x : S.Pos × Nat) => (f x.1, x.2)) = fun (x : S.Pos × Nat) => x.1 == w := by
      funext x; simp only [Function.comp, hf.beq]
    rw [this]
    split <;> simp
  have outer := List.foldl_hom
    (fun (acc : List (S.Pos × Nat) × List S.Pos) q => (S.neighbors q).foldl (fun (acc : List (S.Pos × Nat) × List S.Pos) w =>
        if acc.1.any (·.1 == w) then acc else (acc.1 ++ [(w, d + 1)], acc.2 ++ [w])) acc)
    (fun (acc : List (S.Pos × Nat) × List S.Pos) q => (S.neighbors q).foldl (fun (acc : List (S.Pos × Nat) × List S.Pos) w =>
        if acc.1.any (·.1 == w) then acc else (acc.1 ++ [(w, d + 1)], acc.2 ++ [w])) acc)
    (mapSeen f) f (fun acc q => by rw [hf.nbrs]; exact List.foldl_hom _ _ _ _ inner _ _) frontier (seen, [])
  exact outer

theorem layers_map {f : S.Pos → S.Pos} (hf : S.Auto f) :
    ∀ (n : Nat) (seen : List (S.Pos × Nat)) (frontier : List S.Pos) (d : Nat),
      S.layers n (seen.map fun (x : S.Pos × Nat) => (f x.1, x.2)) (frontier.map f) d = (S.layers n seen frontier d).map fun (x : S.Pos × Nat) => (f x.1, x.2)
  | 0, _, _, _ => rfl
  | n + 1, seen, frontier, d => by
    simp only [layers]
    rw [layer_map hf]
    exact layers_map hf n _ _ (d + 1)

theorem view_map {f : S.Pos → S.Pos} (hf : S.Auto f) (r : Nat) (o : S.Pos) :
    S.view r (f o) = { vertices := (S.view r o).vertices.map f, dist := (S.view r o).dist, edges := (S.view r o).edges } := by
  have hball := layers_map hf r [(o, 0)] [o] 0
  simp only [List.map_cons, List.map_nil] at hball
  generalize hB : S.layers r [(o, 0)] [o] 0 = B at hball
  have hfind : ∀ w, (B.map fun x => f x.1).findIdx? (· == f w) = (B.map (·.1)).findIdx? (· == w) := by
    intro w
    rw [List.findIdx?_map, List.findIdx?_map]
    congr 1
    funext z
    simp only [Function.comp_def, hf.beq]
  unfold view
  rw [hball, hB]
  simp only [List.map_map, Function.comp_def]
  congr 1
  apply List.map_congr_left
  intro x _
  rw [hf.nbrs, List.zipIdx_map, List.filterMap_map]
  congr 1
  funext y
  simp only [Function.comp_def, Prod.map, id, hfind]

end Space
end Simulant
