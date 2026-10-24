# Synthesized three-robot gathering on rings

P04 · executable protocol translation and source-discrepancy probe.

Source: Millet, Potop-Butucaru, Sznajder and Tixeuil,
*On the Synthesis of Mobile Robots Algorithms: the Case of Ring Gathering*,
SSS 2014. Pinned source: [arXiv:1407.0978v2](https://arxiv.org/abs/1407.0978v2),
§3.1 observations, §4 strategy description and final rule paragraph, Theorem 9.

## Model and source mapping

[three-robots.sim](sim/three-robots.sim) uses three oblivious FSYNC robots,
full multiplicity observations (`count`), frame isomorphisms and edge moves.
No physical labels, identifiers, lights, memory or scheduler extension are added.
The domain has N > 3 and any non-periodic initial triple, including towers.

The graph adapter reconstructs a rooted cyclic order from distances and a local
port. Gap lengths count empty nodes. Tower members stay; a singleton moves
towards the tower. The remaining branches implement the symmetric and rigid
gap-view cases in §4. Reflected Looks supply both choices at symmetric views.
The stable task uses `eventually always`; a three-robot tower has only stay
decisions, so eventual gathering remains at a fixed position.

## Two source readings

- `synthesized-ring-gathering-three-fsync` follows §4's strategy description,
  including the earlier bullet allowing the isolated robot to move in either
  direction when the two-robot tower is antipodal.
- `synthesized-ring-gathering-literal-final-paragraph` uses only the final
  paragraph's guards. Its tower guard is strict (y < z), leaving the equal-gap
  case without a move.

At N = 4 and positions `[0,0,2]`, the literal experiment has a one-state lasso:
the pair stays and the singleton has equal distances to the tower. The preceding
description supplies the missing move. Both variants remain visible; this is a
textual discrepancy to clarify, not a claim that all interpretations of the
paper's algorithm or its theorem fail. The source's prose classification also
has inconsistent tower parity; this artifact detects antipodal ties directly
from the graph rather than relying on that parity statement.

## Reproduce

From the workspace root:

~~~bash
pnpm --filter @bramas/simulant-project-synthesized-ring-gathering dev
pnpm cli check-all -p synthesized-ring-gathering-three-fsync
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/synthesized-ring-gathering.test.ts
pnpm cli lean -p synthesized-ring-gathering-three-fsync -o /private/tmp/synthesized-ring-lean --build
~~~

The following intentionally reports the source-discrepancy counterexample
(exit status 1); replay settings `{"N":4,"positions":[0,0,2]}` and path `[0,0]`:

~~~bash
pnpm cli check-all -p synthesized-ring-gathering-literal-final-paragraph
~~~

## Evidence and limits

The registry enumerates all rotation-normalized non-periodic triples at N = 4–12,
including multiplicities (351 settings). The domain itself has no upper bound.
The primary shared check passes with 92 states/edges in nine graphs; the literal
probe retains its expected lasso. Individual unreduced checks, paper-case
fixtures and equivariance checks are part of the test suite.

This translates the extracted protocol, not the synthesis tool, optimal-move
claim, game equivalence proof or general correctness theorem. The generated
primary and literal Lean models compile; no non-vacuity or
correctness theorem is proved. General correspondence/equivariance proofs
remain open, including the documented lawful-reference-ordering assumptions.
The adapter never uses physical vertex order to choose a direction.
