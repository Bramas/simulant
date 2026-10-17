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

Parameter declarations describe model domains, using `in [...]` for exact finite
sets and `where` for properties. Starting values come from a bounded search,
with editable typed fallbacks when no match is found. Override them separately
in the project registry:

```ts
simProject(model, 'cautiousPair', {
  defaults: { N: 8, site: 3 },
  checkSettings: () => [{ N: 5, site: 1 }, { N: 8, site: 3 }],
});
```

`checkSettings` supplies finite settings for `check-all` when model domains
cannot be enumerated. Each setting must include every parameter; settings
outside the model domains are skipped. Without it, `check-all` enumerates the
model's finite domains. Defaults never restrict the model or select check settings.

Renderers receive the page's colors in `options.theme` (light or dark): draw
labels and marks with `theme.foreground` and `theme.muted` so that drawings stay
readable in both themes. `simulator.css` is the whole stylesheet; the interface
no longer uses Pico CSS, and `pico.min.css` is kept empty for older pages.

The package uses subpath exports: `SimulatorApp`, `sim/*`, `components/*`,
`renderers/*`, and the CSS files. It has no root import.

[Project guide](https://github.com/Bramas/simulant/tree/main/projects/starter)
· [Architecture](https://github.com/Bramas/simulant/blob/main/docs/architecture.md)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/simulator-ui)

Licensed under CeCILL-B; see `LICENCE.txt`.
