# Standard library

`@bramas/simulant-stdlib` supplies the model families, components, sensors and
tasks used by Simulant experiments. It is installed with the compiler and CLI.
Start a standalone project with `npm create @bramas/simulant@latest my-project`.

Use it from `.sim` sources:

```lean
import "std/models.sim"
```

The library includes spaces (`Graphs.Cycle`, `Graphs.Line`, `Graphs.Star`),
location sensors, black-hole and crash components, lights, pebble storage, visit
monitors, tasks, the model families `robots` and `blackHoleRobots`, and example
algorithms. Graphs, observations, frames and rounds are implemented in the
semantic core; library definitions compose those capabilities.

For limited-visibility luminous robots on a line, with a palette of three colors,
disoriented (a fresh isomorphism of the view at each Look):

```lean
def luminous : Model :=
  robots Graphs.Line (Observe.radius (param phi)) Frames.isomorphisms [colors]
    (components := [Storage.Lights 3, Faults.CrashAt])
```

`Storage.Lights k` provides a fixed positive number of colors, numbered 0 through
k−1, as an agent field `light`. Every light starts at 0. The optional `setLight`
action uses `none` to keep the current color and `some c` to request color c;
out-of-palette requests are ignored. Updates commit after Compute and before
movement, including when `Faults.CrashAt` prevents that movement.

Sensors are queried by location: `occupied l`, `count l` and `colors l` (the
distinct colors at a location, in palette order; an empty list means unoccupied)
expose neither multiplicity beyond what they say, nor fault flags, nor the size
of the space. Helpers such as `Line.window` (the visible locations of a line view,
from one end to the other) and `Ring.cw`/`Ring.ccw` (named neighbors) build lists
from locations; a project chooses its own notation, such as the stand-up project's
X/Y/Z encoding of `colors`.

Compose model capabilities explicitly. Black-hole search with chirality uses
`blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown`; on a dynamic ring,
`blackHoleRobots (Graphs.Dynamic (Graphs.Cycle N) 1) .mayEmerge .unknown`. Full-view
gathering on a ring uses `robots (Graphs.Cycle N) Observe.full Frames.isomorphisms
[occupied]`. The experiment selects the task and goal, such as `Gathering`,
separately from the model.

See the [language reference](https://github.com/Bramas/simulant/blob/main/docs/sim-language.md)
for a complete experiment. The development notes below describe how the library
is maintained in the source repository; test helpers are not part of this npm
package. Licensed under CeCILL-B; see `LICENCE.txt`.

The standard library used by project simulations and Lean generation is authored in [`sim/`](sim/). A `.sim` import such as `import "std/models.sim"` loads these sources and compiles them to IR.

| Location | Role |
| --- | --- |
| `sim/*.sim` | Authoritative sensors, components, tasks, model families and examples |
| `test/helpers/*.ts` | Hand-written builder counterparts and helpers used only by tests |

## Why the TypeScript counterparts exist

The TypeScript files in [`test/helpers/`](test/helpers/) construct IR through [`packages/lang/src/builder.ts`](../lang/src/builder.ts). They are maintained independently of the `.sim` frontend and are not generated from `.sim` files. Only test code imports them; the simulator, CLI and Lean generator compile the `.sim` library.

Conformance fixtures are generated from [`sim/conformance.sim`](sim/conformance.sim). The [conformance test](../engine/test/conformance.test.ts) compares the state graphs, verdicts, witnesses and activations produced by the fixture IR, then compares state graphs and edges against independently [built experiments](../engine/test/builder-experiments.ts). This provides a check on frontend translation as well as interpreter behavior.

The TypeScript definitions also supply small models and algorithms for the engine's [round tests](../engine/test/round.test.ts) and [semantic acceptance tests](../engine/test/skeleton.test.ts), and the language's [typechecker tests](../lang/test/check.test.ts).

## Editing the library

The website's [library reference and model builder](../../docs/architecture.md#public-website) are read from these sources: give every model, component, sensor and task a `/-- … -/` doc comment (its first sentence is the builder's summary), and give a new algorithm output read by a task a type in `outputTypes` (`apps/public-site/src/builder.ts`). `apps/public-site/test/site.test.ts` checks both, and compiles every model family with every task, component and view sensor.

Change the `.sim` sources for library behavior used by projects. When a definition has a builder counterpart covered by conformance tests, update both versions and verify their agreement. Follow the [IR contract](../../docs/ir.md) and [regeneration instructions](../../docs/development.md#generated-files-and-regression-fixtures) for semantic changes.

Register new reusable components in `packages/lean-gen/src/library.ts` and
regenerate the Lean library. The generic light fixture covers palette changes, fixed-node crashes and
color-set observations; the independent
builder versions must produce the same states, edges and witnesses. The
`reusable-robots` tests cover one, two, three and five colors, out-of-palette
updates, independent storage and bounded rotation/reflection equivariance.

Tests import the helpers directly, for example `../../stdlib/test/helpers/index`. The package exports only `.sim` sources through `./sim/*`. Project algorithms import the library through `std/*.sim`; Lean library generation also reads `sim/` directly.

Graphs, observations, frames, rounds and expression builtins are implemented by the TypeScript and Lean semantic cores. The `.sim` library composes those capabilities; see the [architecture](../../docs/architecture.md#models-and-execution).
