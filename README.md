# Simulant

Simulant is a simulator toolkit for research on mobile entities and distributed algorithms, developed by Quentin Bramas. It provides an execution engine, a SolidJS web interface, and command-line tools for checking simulations.

[Visit the project website](https://bramas.github.io/simulant/) for a presentation and public paper artifacts.

## Getting started

Use Node.js 22 (as in CI) or newer and pnpm 10.22.0.

```bash
pnpm install
pnpm dev
```

The default development page runs the starter project: two agents moving in opposite directions on a ring. Edit [projects/example/src/index.ts](projects/example/src/index.ts) to change the simulation and [its App component](projects/example/web/src/App.tsx) to change the page.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the starter project |
| `pnpm --filter @bramas/simulant-project-black-hole-search dev` | Run the black-hole-search paper page |
| `pnpm build` | Build the public website into `dist/` |
| `pnpm serve` | Preview the built starter project; build it with its package's `build` command first |
| `pnpm typecheck` | Check the public workspace's TypeScript |
| `pnpm test` | Run regression tests, including CLI integration tests |

## Repository layout

```text
apps/public-site/        public landing page
packages/core/           execution engine, models, and shared types
packages/simulator-ui/   reusable SolidJS interface
packages/cli/            shared simulant command
projects/example/        starter ring simulation
projects/black-hole-search/
  src/simulations/       implementations: algo0.ts through algo6.ts
  src/algorithms/        structured pseudocode displayed in the UI
  src/projects.ts       named simulations and presets
  src/index.ts          package exports
  web/                  paper's web application
projects/private/        optional local private research repository, ignored by Git
scripts/                 public-site build, shared Vite defaults, and conversion tools
```

Black-hole-search exposes the stable simulation names `black-hole-search-algo0` through `black-hole-search-algo6`. Package imports such as `@bramas/simulant-project-black-hole-search/algo1` remain available.

Private projects are excluded from the public build and root typecheck. Only projects explicitly listed in [public-projects.mjs](apps/public-site/src/public-projects.mjs) are published on the website.

## Checking simulations with the CLI

The reusable `@bramas/simulant-cli` package provides the `simulant` executable. In this workspace, run it through `pnpm cli`:

```bash
pnpm cli list-projects
pnpm cli check-config -p black-hole-search-algo1 -s '{"N":5,"BH_node":2}' -d 10
pnpm cli check-all -p black-hole-search-algo1 --max-configs 10 -d 20
pnpm check black-hole-search-algo1
pnpm cli generate-config-graph -p black-hole-search-algo1 -s '{"N":5,"BH_node":2}' -d 5 -o graph.tex
pnpm cli --help
```

- `check-config` explores execution branches for one set of settings, up to the depth limit.
- `check-all` repeats that check for settings from `settingsGenerator()`. `--max-configs` limits the settings tested.
- `check` follows the first branch at each step for each generated setting, as a smoke check. `pnpm check <name>` invokes this command.
- `generate-config-graph` exports a configuration graph as TikZ; include it with `\input{graph.tex}` in a LaTeX document using the `tikz` package.

Exhaustive checks return **0** when the tested configurations pass, **1** for a failure or command error, and **2** for incomplete exploration, such as reaching the depth limit or an unfinished state with no successors. A limited check covers only the explored settings and paths.

Discovery uses the calling directory: the current package, `projects/*`, and `projects/private/*`. Registries declare a `./projects` package export; older packages with `projects.ts` or `src/projects.ts` also work. Simulation names must be unique across the workspace.

In a separate project with the CLI installed, use `pnpm exec simulant` instead of `pnpm cli`. Select a different directory or an explicit registry when needed:

```bash
pnpm exec simulant --registry ./src/projects.ts list-projects
pnpm exec simulant --root ../other-paper --registry ./src/projects.ts check-config -p my-simulation -s '{"N":8}' -d 20
```

The CLI supports TypeScript registries and includes its own loader; it requires Node.js 20.6 or newer.

## Using Simulant in a separate project

Configure GitHub Packages in your project's `.npmrc`:

```ini
@bramas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Use released package versions for reproducible projects:

```json
{
  "dependencies": {
    "@bramas/simulant-core": "0.1.0",
    "@bramas/simulant-ui": "0.1.0",
    "solid-js": "^1.9.3"
  }
}
```

The CLI is prepared for release but has not yet been published. Once released, install it with `pnpm add -D @bramas/simulant-cli`. Before release, create local CLI and core tarballs and install them together in the consuming project:

```bash
# From the Simulant workspace
pnpm --filter @bramas/simulant-core pack --pack-destination /tmp/simulant-packages
pnpm --filter @bramas/simulant-cli pack --pack-destination /tmp/simulant-packages

# From the consuming project
pnpm add -D /tmp/simulant-packages/bramas-simulant-core-0.1.0.tgz /tmp/simulant-packages/bramas-simulant-cli-0.1.0.tgz
```

During development, core and UI dependencies can point to a local checkout with `link:../simulant/packages/core` and `link:../simulant/packages/simulator-ui`. Run `pnpm install` after changing dependencies and restart the web development server. Keep unpublished research in separate private repositories and use exact released versions when freezing a paper artifact.

## Creating a project

Keep simulation code in `src/` and the optional web interface in `web/`:

```text
projects/<paper>/
  package.json
  src/index.ts           package exports
  src/projects.ts        simulation registry and presets
  src/simulations/       agents and model setup
  src/algorithms/        structured pseudocode (optional)
  web/src/App.tsx
  web/src/workers/graph-worker.ts
  web/tsconfig.json
  web/vite.config.ts
  web/index.html
```

Start from [the example project](projects/example/src/index.ts). A small project can export its registry directly from `src/index.ts`. Use `.ts` for simulation code and `.tsx` for JSX components.

Export a map of named simulations:

```ts
// src/projects.ts
import * as MySimulation from './simulations/my-simulation';
export const projects = { 'my-simulation': MySimulation };
```

Declare the registry in `package.json` so the CLI can discover it:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./projects": "./src/projects.ts"
  }
}
```

Each simulation follows [ProjectType](packages/core/src/types/project.ts):

| Export | Purpose |
| --- | --- |
| `setup(settings)` | Required: create agents and return a model with its initial configuration |
| `executionStatusChecker(config, model, history)` | Return `success`, `failure`, or `inProgress`; required for checks and configuration graphs |
| `settingsGenerator()` | Generate settings for `check` and `check-all` |
| `drawConfig(ctx, config, model, options)` | Draw a configuration on a canvas; options include its center, radius, agent/node sizes, and labels |
| `getAgentsRenderInfo(...)` | Provide agent positions and identifiers for selection |
| `debugConfig(config, model)` | Describe a configuration; required for CLI graph export |
| `editorSchema` | Describe editable settings and defaults |
| `getAlgorithmViewInfo(config)` | Provide structured pseudocode and agent line highlights |

For a web interface, use `SimulatorApp` from `@bramas/simulant-ui/SimulatorApp`, passing `projects`, a title, and a project-specific `storageKey`. The [black-hole-search App](projects/black-hole-search/web/src/App.tsx) shows how to add presets and a graph worker. Its [worker](projects/black-hole-search/web/src/workers/graph-worker.ts) delegates traversal to the shared `handleGraphRequest` function from `@bramas/simulant-core/lib/config-graph`.

Workspace web apps share Vite defaults:

```ts
// web/vite.config.ts
import { projectViteConfig } from '../../../scripts/project-vite-config';
export default projectViteConfig('my-paper');
```

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "types": ["vite/client"] },
  "include": ["src", "../src"]
}
```

Private projects one level deeper use `../../../../` for these relative paths and `projectViteConfig('private/my-paper')` for a separate output directory. Independent repositories use their own build configuration and depend on the simulator packages.

Rendering and status checks should read `config.agents()`. `clone_agents()` can replay generator histories and should be reserved for advancing the simulation. Graph rendering caches its execution across pan and zoom changes. Graph generation can prune repeated states using `debugConfig`; that output must distinguish relevant states. Repeated unfinished states remain `inProgress`. Graph node `childrenCount` reports explored children, with zero for terminal, repeated, and depth-limited nodes.

To regenerate structured pseudocode from the local `latex-algo/` sources, run `pnpm convert-algorithms`. Convert one file with `pnpm convert-algo <input.tex> <output.ts>`. The black-hole-search output lives in `projects/black-hole-search/src/algorithms/`.

## Publishing and reproducibility

To publish a project's web page, add a `web/` app and a package `build` script, use `projectViteConfig(<slug>)` to build into `dist/<slug>`, and add its metadata to [public-projects.mjs](apps/public-site/src/public-projects.mjs). `pnpm build` builds the listed projects and the landing page into `dist/`.

[The Pages workflow](.github/workflows/pages.yml) deploys `dist/` to GitHub Pages. Set the repository's Pages source to **GitHub Actions**.

[The package release workflow](.github/workflows/release-packages.yml) publishes core, UI, and CLI packages to GitHub Packages. It runs manually or on tags matching `simulator-v*`, after typechecking and tests. Update package versions under `packages/` and the lockfile before releasing changed contents.

For a paper artifact, record exact package versions or commits and tag the repository state, for example `paper-black-hole-search-v1`. `workspace:*` tracks the current local package; it does not preserve an older simulator version. Keep old artifacts reproducible through exact external package versions or their repository tag.

## License and citation

Simulant is distributed under the CeCILL-B license. See [LICENCE.txt](LICENCE.txt).

If you use this simulator or the black-hole-search artifact, please cite:

> François Bonnet, Quentin Bramas, and Anissa Lamani. Searching for an Eventually-Emerging Black Hole in Rings. In 5th Symposium on Algorithmic Foundations of Dynamic Networks (SAND 2026).
