# Planar robots: numerical views and exact models

The first planar artifact is [P23, stand-up indulgent gathering](../projects/public/standup-plane-gathering/README.md).
It visualizes Algorithm 3 from Bramas, Lamani and Tixeuil using project-local numerical
code. The standard `.sim` engine still executes graphs only. `Euclidean.Plane` remains an
interface, and the preview does not implement its semantics.

## A useful visualization now

The existing `ProjectType` adapter already supports custom configurations, execution
paths, source highlighting, inspection and drawing. P23 uses those interfaces with
floating-point planar coordinates. A fixed camera maps physical positions to canvas pixels.
This separates display precision from the coordinates used by its numerical interpreter.

The numerical interpreter also approximates geometric predicates, including occupancy,
collinearity, circle construction and ratio equality. Its epsilon is a simulation aid,
not an assumption of the paper. Its three movement policies are sample adversaries;
they do not enumerate all allowed non-rigid stops. Tests can validate their implementation
and reproduce examples, but cannot prove the real-number algorithm.

For that reason the companion has no formal `experiment`, task verdict or state-graph
checker. CLI checks return `incomplete`. Its Model description omits IR and Lean, and
the viewer offers no corresponding downloads. The project is counted separately from
formal translations in the literature roadmap.

## Exact geometry contracts to add next

| Area | Required contract |
| --- | --- |
| Physical space | Opaque `Pos` in a plane, not graph vertices or a bounded grid. |
| Observation | A finite set of occupied locations, including the observer; the whole physical plane need not be enumerable. Multiplicity remains a separate sensor policy. |
| Local frame | A similarity from physical positions to local coordinates, centered at the observer: rotation, optional reflection and positive scale. Specify whether it is fixed or renewed per Look. |
| Destinations | The algorithm must construct a new local point, such as a circle center or midpoint, even when it was unoccupied and absent from the observed point set. The frame maps it back to an opaque physical position. |
| Scalars | Exact ordered arithmetic and the geometric operations required by the chosen algorithm, with mathematical definitions in Lean. A renderer may approximate their values. |
| Geometry library | Midpoints, affine combinations, distances, collinearity, enclosing-circle center, unique extremities, dyadic levels and interval partitions. Keep paper-specific ratio sets outside the core. |
| Movement | A destination and a chosen point on the segment with progress at least `min(δ, distance)` and at most the full distance. δ is positive, fixed, shared and hidden from algorithms. |
| Faults and task | Crashes freeze visible bodies; the single-crash-location assumption is explicit. Gathering uses exact equality and eventual permanence, including crashed bodies. |

The existing `Loc`/`Pos` distinction remains useful. A planar Look should not enumerate
all of R², nor should it replace geometry by arbitrary permutations of occupied points.
Similarity frames constrain which observations represent the same physical scene. A local
point constructed during Compute must remain meaningful through that cycle's Move.

## Incremental implementation

1. **Keep P23 as a reference visualization.** Pin the rule mapping, include asymmetric,
   symmetric, collinear, two-point and crash examples, and preserve approximation labels.
2. **Specify the planar semantic slice.** Begin with full-visibility FSYNC and fixed
   private frames. Define occupied observations, constructed destinations and non-rigid
   movement before extending ASYNC or partial visibility. Coordinate frontend, IR,
   interpreter, conformance fixtures and Lean changes under the normal repository rules.
3. **Add exact mathematical geometry.** Lean currently has no Mathlib. Choose a suitable
   exact real-number foundation, or explicitly state an abstract ordered geometric
   structure and its assumptions. A rational implementation alone does not cover arbitrary
   circle centers. Do not count an abstract axiom as a proved geometric theorem.
4. **Translate P23 once in `.sim`.** The numerical execution path should eventually
   interpret that same declaration, with a documented numerical meaning for each exact
   primitive. Test both backends on cases with known exact answers and precision boundaries.
5. **Prove correspondence and the algorithm claims separately.** Compiled Lean, numerical
   traces, finite tests and a correctness proof are distinct deliverables. Exhaustive search
   over continuous adversaries requires a justified abstraction or a different proof method.

This work does not require a perfectly accurate drawing. It does require keeping a rounded
drawing, an approximate numerical execution, and an exact mathematical model distinguishable.
