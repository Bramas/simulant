# Standard library

`@bramas/simulant-stdlib` supplies the model families, components, sensors and
tasks used by Simulant experiments. It is installed with the compiler and CLI.
Start a standalone project with `npm create @bramas/simulant@latest my-project`.

Use it from `.sim` sources:

```lean
import "std/models.sim"
import "std/tasks.sim"
```

The library includes black-hole and crash components, pebble storage, visit
monitors, ring model families and example algorithms. Topologies and rounds are
implemented in the semantic core; library definitions compose those capabilities.

For limited-visibility luminous robots with a fixed palette of three colors:

```lean
def robots : Model :=
  obliviousRing (view := colorView)
    (components := [Vision.Radius, Storage.Lights 3, Faults.CrashAtNode])
```

`Storage.Lights k` provides a fixed positive number of colors, numbered 0 through
k−1. Every light starts at 0. The optional `light` action uses `none` to keep the
current color and `some c` to request color c; out-of-palette requests are ignored.
Updates commit after Compute and before movement, including when `CrashAtNode`
prevents that movement. Slots associate stored colors with robots internally;
there is no geometry, visibility, population or initial-light parameter.

`Vision.Radius` reads the experiment's `phi` parameter. `lineView` returns a
centered occupancy view, while `colorView` returns a list of distinct colors at
each visible node, in palette order. An empty color list means unoccupied.
Neither observation exposes multiplicity, fault flags, slots or topology size.
A project can interpret a padded ring as a line and choose its own notation for
colors, such as the stand-up project's X/Y/Z encoding.

Compose model capabilities explicitly. For example, fixed-node crash gathering
uses `obliviousRing (components := [Faults.CrashAtNode])`; dynamic-ring robots use
`obliviousRing (topology := DynamicRing 1)` with the appropriate observation and
frame. Dynamic black-hole search uses
`blackHoleRing .mayEmerge .unknown (topology := DynamicRing 1)`. The experiment
selects the existing task and goal, such as `Gathering`, separately from the model.

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

Change the `.sim` sources for library behavior used by projects. When a definition has a builder counterpart covered by conformance tests, update both versions and verify their agreement. Follow the [IR contract](../../docs/ir.md) and [regeneration instructions](../../docs/development.md#generated-files-and-regression-fixtures) for semantic changes.

Register new reusable components in `packages/lean-gen/src/library.ts` and
regenerate the Lean library. The generic light fixture covers palette changes, fixed-node crashes and
color-set observations; the independent
builder versions must produce the same states, edges and witnesses. The
`reusable-robots` tests cover one, two, three and five colors, out-of-palette
updates, independent storage and bounded rotation/reflection equivariance.

Tests import the helpers directly, for example `../../stdlib/test/helpers/index`. The package exports only `.sim` sources through `./sim/*`. Project algorithms import the library through `std/*.sim`; Lean library generation also reads `sim/` directly.

Topologies, rounds and expression builtins are implemented by the TypeScript and Lean semantic cores. The `.sim` library composes those capabilities; see the [architecture](../../docs/architecture.md#models-and-execution).
