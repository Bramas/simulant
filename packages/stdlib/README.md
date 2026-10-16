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

Tests import the helpers directly, for example `../../stdlib/test/helpers/index`. The package exports only `.sim` sources through `./sim/*`. Project algorithms import the library through `std/*.sim`; Lean library generation also reads `sim/` directly.

Topologies, rounds and expression builtins are implemented by the TypeScript and Lean semantic cores. The `.sim` library composes those capabilities; see the [architecture](../../docs/architecture.md#models-and-execution).
