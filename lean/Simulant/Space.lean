/-!
# Spaces, views and presentations (docs/core-redesign.md, sections 2 and 3)

A graph space has positions with decidable equality and, for each position, its ordered list of
neighbors: that order is its port numbering, and a position may appear twice (parallel edges, as
in the two-node cycle). The functions here follow the interpreter (`packages/engine/src/space.ts`)
step by step, so that the generated round enumerates the same choices in the same order and the
interpreter's witnesses are witnesses here.

An agent's Look is its r-hop view (the positions at distance at most `r`, and the edges with an
endpoint at distance less than `r`), presented as locations `0 .. n-1`. Under port-based frames,
the locations are numbered breadth-first through the agent's ports. Under `Frames.isomorphisms`,
they follow a reference ordering of the visible positions, then a rooted isomorphism of the view
chosen by the adversary. The reference ordering is a parameter of the round (`RefOrder`), and the
correctness statements quantify over the lawful ones (`RefOrder.Lawful`).
-/

namespace Simulant

structure Space where
  Pos : Type
  [deq : DecidableEq Pos]
  [repr : Repr Pos]
  [inh : Inhabited Pos]
  /-- The ordered neighbors of a position: its ports. -/
  neighbors : Pos → List Pos
  /-- The positions of a finite space, in vertex order. -/
  vertices : Option (List Pos) := none
  /-- The largest degree (the number of port numbers that port permutations permute). -/
  maxDegree : Nat
  /-- The interpreter's physical order of positions, for the identity reference ordering. -/
  le : Pos → Pos → Bool

attribute [instance] Space.deq Space.repr Space.inh

namespace Space

variable (S : Space)

/-! ## Dynamic spaces: missing edges -/

/-- An edge `(u, w, k)`: the `k`-th parallel edge between `u` and `w`, in either orientation. -/
abbrev Edge := S.Pos × S.Pos × Nat

/-- The edges of a finite space, in vertex then port order, each once. -/
def edges : List S.Edge :=
  (S.vertices.getD []).foldl (fun out u =>
    ((S.neighbors u).foldl (fun (acc : List S.Edge × List S.Pos) w =>
      let (out, before) := acc
      let k := before.count w
      let same := fun (e : S.Edge) => e.2.2 == k && ((e.1 == u && e.2.1 == w) || (e.1 == w && e.2.1 == u))
      (if out.any same then out else out ++ [(u, w, k)], before ++ [w])) (out, [])).1) []

/-- Sets of at most `k` missing edges, extending `cur` with candidates in order (depth first). -/
def extend (k : Nat) (cur : List S.Edge) : List S.Edge → List (List S.Edge)
  | [] => []
  | e :: rest =>
    let next := cur ++ [e]
    (if next.length ≤ k then next :: extend k next rest else []) ++ extend k cur rest

/-- The states a dynamic space may be in during a round: the sets of at most `k` missing edges. -/
def dynamicStates (k : Nat) : List (List S.Edge) := [] :: S.extend k [] S.edges

/-- Whether some edge between `u` and `w` is present when the edges `missing` are missing. -/
def edgePresent (missing : List S.Edge) (u w : S.Pos) : Bool :=
  missing.isEmpty ||
    (List.range ((S.neighbors u).count w)).any fun k =>
      !missing.any fun e => e.2.2 == k && ((e.1 == u && e.2.1 == w) || (e.1 == w && e.2.1 == u))

/-- From `p`, `k` times through the port `port` (staying put at a missing port). -/
def follow (p : S.Pos) (port : Nat) : Nat → S.Pos
  | 0 => p
  | k + 1 => follow ((S.neighbors p).getD port p) port k

/-! ## Views -/

/-- The visible domain around a position: its positions (breadth-first), their distances, and
for each of them its visible edges, as (port, index of the neighbor). -/
structure View (S : Space) where
  vertices : List S.Pos
  dist : List Nat
  edges : List (List (Nat × Nat))

/-- One breadth-first layer: the unseen neighbors of `frontier`, at distance `d + 1`. -/
def layer (seen : List (S.Pos × Nat)) (frontier : List S.Pos) (d : Nat) : List (S.Pos × Nat) × List S.Pos :=
  frontier.foldl (fun acc q =>
    (S.neighbors q).foldl (fun (acc : List (S.Pos × Nat) × List S.Pos) w =>
      if acc.1.any (·.1 == w) then acc else (acc.1 ++ [(w, d + 1)], acc.2 ++ [w])) acc) (seen, [])

/-- `n` layers of breadth-first search. -/
def layers : Nat → List (S.Pos × Nat) → List S.Pos → Nat → List (S.Pos × Nat)
  | 0, seen, _, _ => seen
  | n + 1, seen, frontier, d =>
    let (seen', next) := S.layer seen frontier d
    layers n seen' next (d + 1)

/-- The r-hop view around `o` (`r` at least the number of positions gives the full view of a
finite space). -/
def view (r : Nat) (o : S.Pos) : View S :=
  let ball := S.layers r [(o, 0)] [o] 0
  let vs := ball.map (·.1)
  let dist := ball.map (·.2)
  let idx := fun (w : S.Pos) => vs.findIdx? (· == w)
  { vertices := vs, dist := dist,
    edges := ball.map fun (v, dv) =>
      ((S.neighbors v).zipIdx).filterMap fun (w, port) =>
        match idx w with
        | some j => if dv < r || dist.getD j r < r then some (port, j) else none
        | none => none }

/-! ## Presentations -/

/-- A presentation of a view: which view vertex each location is, and each location's
neighbors (as locations). -/
structure Presentation where
  order : List Nat
  nbrs : List (List Nat)

/-- The isomorphisms of a view fixing its center: permutations of its vertices preserving
distances and the multiset of edges, by backtracking in breadth-first order (as the
interpreter enumerates them). -/
def rootedAutomorphisms (V : View S) : List (List Nat) :=
  let n := V.vertices.length
  let row := fun i => V.edges.getD i []
  let mult := fun i j => ((row i).filter (·.2 == j)).length
  let degree := fun i => (row i).length
  let dist := fun i => V.dist.getD i 0
  let rec go : Nat → Nat → List Nat → List (List Nat)
    | 0, _, _ => []
    | fuel + 1, i, sigma =>
      if i == n then [sigma] else
        ((List.range n).filter fun c =>
          c ≥ 1 && !sigma.contains c && dist c == dist i && degree c == degree i && mult c c == mult i i &&
            (List.range i).all fun j => mult i j == mult c (sigma.getD j 0) && mult j i == mult (sigma.getD j 0) c)
          |>.flatMap fun c => go fuel (i + 1) (sigma ++ [c])
  if n == 0 then [] else go n 1 [0]

/-- The index of the first occurrence of `x` in `l` (its length when absent). -/
def indexIn {α} [BEq α] (l : List α) (x : α) : Nat := (l.findIdx? (· == x)).getD l.length

/-- Under `Frames.isomorphisms`: the reference ordering `ref` of the visible positions of `o`,
then the rooted isomorphism `sigma`; neighbor lists in location order. -/
def isoPresentation (V : View S) (o : S.Pos) (ref : List S.Pos) (sigma : List Nat) : Presentation :=
  let n := V.vertices.length
  let loc := fun v => indexIn ref (V.vertices.getD (sigma.getD v 0) o)
  let order := (List.range n).map fun l => indexIn ((List.range n).map loc) l
  { order := order,
    nbrs := order.map fun v => ((V.edges.getD v []).map fun e => loc e.2).mergeSort (· ≤ ·) }

/-- Under port-based frames: locations breadth-first from the observer, through the
permutation `local` (local port i is the space's port `local[i]`); neighbor lists in that order.
View vertices that the permuted ports do not reach come last, in view order. -/
def portPresentation (V : View S) (perm : List Nat) : Presentation :=
  let n := V.vertices.length
  let visibleIn := fun v => perm.flatMap fun p => ((V.edges.getD v []).filter (·.1 == p)).map (·.2)
  let rec bfs : Nat → Nat → List Nat → List Nat
    | 0, _, order => order
    | fuel + 1, q, order =>
      match order[q]? with
      | none => order
      | some v => bfs fuel (q + 1) ((visibleIn v).foldl (fun o w => if o.contains w then o else o ++ [w]) order)
  let reached := bfs n 0 [0]
  let order := reached ++ (List.range n).filter (!reached.contains ·)
  { order := order, nbrs := order.map fun v => (visibleIn v).map (indexIn order) }

/-- The permutations of `0 .. d-1`, identity first, in lexicographic order. -/
def permutations : Nat → List (List Nat)
  | d => go d (List.range d)
where
  go : Nat → List Nat → List (List Nat)
    | 0, _ => [[]]
    | fuel + 1, rest => if rest.isEmpty then [[]] else
      rest.zipIdx.flatMap fun (x, i) => (go fuel (rest.eraseIdx i)).map (x :: ·)

end Space

/-! ## Reference orderings -/

/-- A reference ordering: for each observer, a list of the positions of its visible domain. -/
abbrev RefOrder (S : Space) := S.Pos → List S.Pos

/-- The interpreter's reference ordering: the visible positions in physical order. It is not
lawful in general (docs/core-redesign.md, section 3); differential tests evaluate with it. -/
def RefOrder.physical (S : Space) (r : Nat) : RefOrder S :=
  fun o => (S.view r o).vertices.mergeSort S.le

/-- The structure a presentation transports onto indices: the observer's index, the view's
edges as (index, index) pairs, and, when ports are kept, the observer's ports as indices. -/
def Space.present (S : Space) (r : Nat) (keepPorts : Bool) (ord : RefOrder S) (o : S.Pos) :
    Nat × List (Nat × Nat) × List Nat :=
  let V := S.view r o
  let idx := fun (j : Nat) => Space.indexIn (ord o) (V.vertices.getD j o)
  (Space.indexIn (ord o) o,
   (V.edges.zipIdx.flatMap fun (es, i) => es.map fun e => (idx i, idx e.2)).mergeSort (fun a b => a.1 < b.1 || (a.1 == b.1 && a.2 ≤ b.2)),
   if keepPorts then (S.neighbors o).map (Space.indexIn (ord o)) else [])

/-- An isomorphism of the r-hop views of `o` and `o'`: a bijection of their visible positions,
mapping `o` to `o'` and each visible edge (with multiplicity) to a visible edge; when ports are
kept, it preserves the port numbering at the observer. -/
def Space.ViewIso (S : Space) (r : Nat) (keepPorts : Bool) (o o' : S.Pos) : Prop :=
  ∃ f : S.Pos → S.Pos,
    ((S.view r o).vertices.map f).Perm (S.view r o').vertices ∧ f o = o' ∧
    (((S.view r o).edges.zipIdx.flatMap fun (es, i) => es.map fun e =>
        (f ((S.view r o).vertices.getD i o), f ((S.view r o).vertices.getD e.2 o))).Perm
      ((S.view r o').edges.zipIdx.flatMap fun (es, i) => es.map fun e =>
        ((S.view r o').vertices.getD i o', (S.view r o').vertices.getD e.2 o'))) ∧
    (keepPorts → (S.neighbors o).map f = S.neighbors o')

/-- The law of reference orderings: each lists the visible domain without repetition, and
isomorphic views get identical presented structures. -/
structure RefOrder.Lawful (S : Space) (r : Nat) (keepPorts : Bool) (ord : RefOrder S) : Prop where
  enumerates : ∀ o, (ord o).Perm (S.view r o).vertices
  canonical : ∀ o o', S.ViewIso r keepPorts o o' → S.present r keepPorts ord o = S.present r keepPorts ord o'

end Simulant
