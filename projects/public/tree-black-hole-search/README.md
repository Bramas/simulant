# Black-hole search in synchronous trees

P22 · Jurek Czyzowicz, Dariusz Kowalski, Euripides Markou and Andrzej Pelc,
[Searching for a Black Hole in Synchronous Tree Networks](https://doi.org/10.1017/S0963548306008133),
Combinatorics, Probability and Computing 16(4), 2007, 595–619.
Source: [author-uploaded journal manuscript](https://www.researchgate.net/publication/220357976_Searching_for_a_Black_Hole_in_Synchronous_Tree_Networks),
§2, §3 `probe`/`split`, §5.2 Algorithm Tree and `relocate` from §5.1.
The OPODIS 2004 precursor belongs to the same paper family.

Two labelled agents start at a safe root. The input tree is known; communication is
face-to-face, with no whiteboards. Traversals take one time unit. An absent partner at
a prescribed meeting deadline reveals the dangerous branch. The source permits no hole
as well as one hole, and requires surviving agents to return to the root.

## Translation

This implements the general **Algorithm Tree** on arbitrary finite rooted trees, rather
than only paths or stars (at least two vertices). A parent vector encodes the input: `parents[0] = 0` and
`parents[v] < v` for every non-root vertex. Every finite rooted tree admits such a
numbering. Its ordered ports list children first, followed by the parent.

| Source operation | `.sim` behavior |
| --- | --- |
| Pair of unknown child edges | Roles 0 and 1 visit separate children, then return in two steps (`split`) |
| One remaining unknown edge | Role 0 visits and returns; role 1 waits for two steps (`probe`) |
| Successful meeting | Both agents mark those edges explored in private memory |
| `relocate` | Move together to a child with unknown outgoing edges, otherwise to the parent |
| Missing partner | Record the partner's attempted child, then return through safe parents |
| Completed safe exploration | Both return to the root and report no hole |

`KnownTree` supplies a read-only input map, equivalent to preloaded knowledge, not a
dynamic view of remote agents. Physical vertex numbers encode the same known map in the
environment; the algorithm tracks its map location in memory and selects local ports.
The other sensor is `otherStates`, restricted to co-location. It cannot observe the hole
or a remote death. `Hazards.BlackHole` destroys arrivals after Move. The root is excluded
from the hole domain; the no-hole experiment uses the same algorithm without an active hazard.

`TreeIdentification` requires a correct explicit answer, at least one survivor, and the
actual return of all survivors. Incorrect completed reports fail immediately. A completed
agent stays forever. Publication occurs on the Look/Compute activation after the final
return; the checker therefore includes a final reporting step. We do not equate its raw
step count with the source's scheme time or claim the 5/3 approximation theorem.

## Evidence and remaining work

The finite verification set contains all 153 increasing parent vectors with 2–6 vertices:
719 non-root hole placements plus 153 no-hole cases. Reduced and independent unreduced
checks pass. Tests inspect split/probe timing, hidden hole locations, return paths,
coverage of every edge in a no-hole execution, incorrect reports and continued quiescence.
This is a bounded family, not a proof for arbitrary trees.

Both generated Lean models compile. General correctness, correspondence with the offline
scheme, the approximation proof and the optimized Line/Bushy-Tree algorithms remain open.
All new definitions are project-local; the semantic core and stdlib are unchanged.

```bash
pnpm cli check-all -p tree-black-hole-search-two-agents
pnpm cli check-all -p tree-black-hole-search-no-hole
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/tree-black-hole-search.test.ts
pnpm --filter @bramas/simulant-project-tree-black-hole-search build
pnpm cli lean -p tree-black-hole-search-two-agents -o /private/tmp/tree-bhs-lean --build
pnpm cli lean -p tree-black-hole-search-no-hole -o /private/tmp/tree-bhs-no-hole-lean --build
```
