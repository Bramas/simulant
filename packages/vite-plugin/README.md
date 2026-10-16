# @bramas/simulant-vite-plugin

Compile Simulant `.sim` modules in Vite and load them under Node.js or Bun.
Imported modules expose compiled experiments, diagnostics, source texts,
generated Lean models and source revisions. Vite watches transitive imports
and updates the simulator when sources change.

## Vite setup

```sh
npm install --save-dev @bramas/simulant-vite-plugin vite vite-plugin-solid
```

```ts
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { simulant } from '@bramas/simulant-vite-plugin';

const plugins = () => [solid({ exclude: [] }), simulant()];

export default defineConfig({
  plugins: plugins(),
  worker: { format: 'es', plugins },
});
```

Including the plugin in workers lets configuration-graph workers import the
same experiments. `exclude: []` lets the Solid plugin compile the published
simulator UI's JSX as well as the project's components.

```ts
import * as model from './main.sim';

const experiment = model.experiments.cautiousPair;
console.log(model.diagnostics, experiment);
```

The plugin generates snapshot types under `.simulant/types` by default.
`simulant({ types: false })` disables that output; `types` can also select an
output directory. The installed standard library resolves `std/*.sim` imports.

For Node/Bun execution, the `simulant` CLI configures the appropriate `.sim`
loader automatically. A complete project can be created with:

```sh
npm create @bramas/simulant@latest my-project
```

[Language and source updates](https://github.com/Bramas/simulant/blob/main/docs/architecture.md#projects-and-source-updates)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/vite-plugin)

Licensed under CeCILL-B; see `LICENCE.txt`.
