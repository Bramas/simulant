# Planar stand-up indulgent gathering — numerical companion

P23 · Quentin Bramas, Anissa Lamani and Sébastien Tixeuil,
[Stand Up Indulgent Gathering](https://doi.org/10.1016/j.tcs.2022.10.015), TCS (2023).
Pinned algorithm source: [arXiv:2302.03466v1](https://arxiv.org/abs/2302.03466v1),
§5.1, Algorithm 3 and Figure 4.

This is an **approximate visualization**, integrated into the existing simulator through
its project adapter. It has no `.sim` experiment, compiled IR or generated Lean model.
It is not counted as a formal translation. The [planar implementation plan](../../../docs/planar-robots.md)
describes the remaining exact-model work.

## What runs

The numerical algorithm uses occupied points without multiplicities. It chooses a
midpoint or a side-dependent fractional move in two-point configurations, a distinguished
extremity when one exists, and otherwise the enclosing-circle center. Each robot has its
own fixed rotation, handedness and unit. These parameters affect its local view; its
decision cannot inspect identities, crash flags, other robots' frames or the movement policy.

All targets are computed from one FSYNC snapshot. The environment then applies a selected
sample movement policy: rigid, minimum progress, or alternating full/partial moves.
The same positive δ is used throughout a run and is hidden from decisions. A chosen crash
event freezes selected robots before Look in the specified round. Multiple crashes must
occur at one location. Crashed bodies remain visible.

Algorithm 3 uses `1/10` for the right-side B move. Footnote 3 mentions `1/8`; the preview
follows the algorithm box and preserves the printed extremity-ratio set. Confirm source
correspondence before claiming an exact formalization.

## Using the viewer

Use the six presets, then step or play. The canvas draws current robot positions, a
numerical enclosing circle and the previous round's computed targets. Co-located icons
are offset for selection, with lines back to their physical position. Grey crossed icons
are crashed. The source panel highlights the branch taken; State shows coordinates and
the numerical observation. Drawing coordinates and colors are for the reader only.

The JSON settings contain `{position: {x,y}, unit, angle, handedness}` per robot. Angles
are in degrees; handedness is `1` or `-1`; unit means world length per local unit.
`crashRobots` contains viewer indices. Indices are never algorithm observations.

The preview accepts 2–16 robots and at most 256 rounds. Coordinates and input units have
explicit bounds for practical numerical use. The tolerance is `epsilon × initial diameter`.
It affects occupancy, alignment and ratio tests. A run stops when all positions lie within
that tolerance or at the round limit. **Coordinates are never snapped together.**

Floating-point errors near collinearity, ratio equalities and powers of two can select a
different branch. This is especially relevant to the paper's level slicing. Canvas placement
only projects the stored coordinates; it does not affect decisions. The page therefore
does not show an exact task-success badge or an exhaustive configuration graph. CLI checks
return `incomplete` even when a sample visually gathers. The Model view has no IR or Lean
download.

## Validation

Tests check circle support sets, level/side rule fixtures, extremity ambiguity, simultaneous
targets, sampled non-rigid progress, fixed crash bodies, transformation of private frames,
invalid inputs and separation of approximate observations from physical coordinates.
All six presets reach numerical co-location; this is example evidence only.

```bash
pnpm --filter @bramas/simulant-project-standup-plane-gathering dev
pnpm --filter @bramas/simulant-project-standup-plane-gathering build
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/standup-plane-gathering.test.ts
# Expected exit 2: a numerical visualization cannot certify the paper theorem.
pnpm cli check-all -p standup-plane-gathering-preview
```
