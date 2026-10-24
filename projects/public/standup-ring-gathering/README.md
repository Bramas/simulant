# Stand-up indulgent rendezvous on rings

P06 · positive two-robot case · self-reviewed executable translation.

Source: Bramas, Kamei, Lamani and Tixeuil, *Stand-Up Indulgent Gathering on Rings*,
SIROCCO 2024; pinned [arXiv:2402.14233v1](https://arxiv.org/abs/2402.14233v1),
§2 model and §3 positive FSYNC strategy (paragraph following Lemma 1).
The general multi-robot SUIG algorithm and impossibility proofs are not translated.

## Model and rule mapping

[rendezvous.sim](sim/rendezvous.sim) implements the described strategy: when the
other occupied node has a unique shortest path, take its first edge; stay when
the two robots have met. Robots see full occupancy, with no multiplicity,
identity, crash-status sensor or private memory. Frame isomorphisms supply both
orientations without giving a common direction.

The experiment admits even N ≥ 6, positions 0 and offset, with both arc lengths
positive, even and unequal. This is the non-periodic node-node symmetric initial
class. Rotating the pair to start at 0 chooses representatives; it adds no robot
knowledge. Odd distance can arise after a crash and is handled by the same rule.

`Faults.CrashStop 1` chooses at most one crash, before any round's Look.
The crashed body remains occupied and never acts again. With at most one fault,
this is the single-crash-location case; no location is fixed in advance.
The stable task quantifies over both bodies, so a survivor must meet the crashed
robot. Once co-located, all possible decisions stay: this closes success at a
fixed node.

Antipodal ties outside the admitted class stay explicitly. They are not claimed
to solve any excluded configuration or any SSYNC variant.

## Reproduce

From the workspace root:

~~~bash
pnpm --filter @bramas/simulant-project-standup-ring-gathering dev
pnpm cli check-all -p standup-ring-gathering-two-fsync
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/standup-ring-gathering.test.ts
pnpm cli lean -p standup-ring-gathering-two-fsync -o /private/tmp/standup-ring-lean --build
~~~

The general domain is unbounded. Registry checks enumerate every admitted
normalized pair on even cycles N = 6–20. Presets expose crash branches in the UI.

## Evidence and limits

Tests check fault timing, invisible crash status, odd distances reached after a
crash, stable closure, domain exclusions and reduced/unreduced agreement.
All 40 registered settings pass reduced and unreduced checks. The shared CLI
run explores 68 states and 96 edges in eight graphs. Strict typechecking, the
project page build and generated Lean compilation pass.
No unbounded correctness or impossibility theorem is proved.

The simulator's documented physical reference ordering and Lean's lawful-ordering
quantification apply. The algorithm only indexes a singleton target or unique
shortest-path neighbor, so it does not use an arbitrary ordering to break ties.
Next: prove convergence/non-vacuity and audit the multi-robot algorithm.
