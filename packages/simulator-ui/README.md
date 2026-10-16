# @bramas/simulant-ui

SolidJS interface for Simulant experiments: interactive execution navigation,
adversary choices, settings and presets, state inspection, algorithm source
highlighting, configuration graphs, and a view of the model and generated Lean.

## Start a simulator

```sh
npm create @bramas/simulant@latest my-project
cd my-project
npm install
npm run dev
```

The generated project includes the Vite configuration and a working `.sim`
experiment. For an existing Solid/Vite project, install the UI and compiler
plugin:

```sh
npm install @bramas/simulant-ui solid-js
npm install --save-dev @bramas/simulant-vite-plugin vite-plugin-solid
```

```tsx
import SimulatorApp from '@bramas/simulant-ui/SimulatorApp';
import { simProject } from '@bramas/simulant-ui/sim/project';
import '@bramas/simulant-ui/simulator.css';
import * as model from './main.sim';

const projects = {
  'cautious-pair': simProject(model, 'cautiousPair'),
};

export default () => <SimulatorApp projects={projects} />;
```

Configure Vite with `solid({ exclude: [] })` and `simulant()`; the published UI
contains Solid JSX that the consuming application must compile. Include the
Simulant plugin in graph workers too. The initializer supplies this setup.

`simProject` supplies a settings form, execution adapter, model description,
state inspector and default ring renderer from the compiled experiment.
Projects can supply a custom drawing function, agent names and aliases for
older parameter names. Settings outside declared domains produce advisory
warnings; execution remains available.

The package uses subpath exports: `SimulatorApp`, `sim/*`, `components/*`,
`renderers/*`, and the CSS files. It has no root import.

[Project guide](https://github.com/Bramas/simulant/tree/main/projects/starter)
· [Architecture](https://github.com/Bramas/simulant/blob/main/docs/architecture.md)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/simulator-ui)

Licensed under CeCILL-B; see `LICENCE.txt`.
