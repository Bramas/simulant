# Simulant

Simulant is a simulator toolkit for research on mobile entities and distributed algorithms, developed by Quentin Bramas. Algorithms and experiments are written in the `.sim` language ([docs/sim-language.md](docs/sim-language.md)); Simulant runs them in a SolidJS web interface, checks every admissible execution from the command line, and generates their Lean models.

[Visit the project website](https://bramas.github.io/simulant/) for a presentation and public paper artifacts.

## Getting started

Use Node.js 24 (as in CI) or newer and pnpm 10.22.0.

```bash
pnpm install
pnpm dev
```

The default development page runs the starter project: two agents look for a black hole on a ring. Edit [projects/starter/src/main.sim](projects/starter/src/main.sim) while the page is open: saving it updates the page. The [starter's README](projects/starter/README.md) describes the workflow.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the starter project |
| `pnpm --filter @bramas/simulant-project-black-hole-search dev` | Run the black-hole-search paper page |
| `pnpm --filter @bramas/simulant-project-standup-gathering dev` | Run the stand-up gathering paper page |
| `pnpm build` | Build the public website into `dist/` |
| `pnpm serve` | Preview the built starter project; build it with its package's `build` command first |
| `pnpm typecheck` | Check the public workspace's TypeScript |
| `pnpm test` | Run regression tests, including CLI integration tests |

## Editing `.sim` in VS Code

The [Simulant extension](extensions/vscode-simulant/README.md) provides syntax highlighting, snippets and a language server with live compiler diagnostics, completion, hover, navigation and rename. Build an installable extension with `pnpm editor:package`, then install `extensions/vscode-simulant/dist/simulant.vsix` using **Extensions: Install from VSIX…**. Its shared language service also builds as a browser module for a future web editor.

## Repository layout

See the [architecture](docs/architecture.md) for the design and [development guide](docs/development.md) for verification, generated files and known issues.

```text
apps/public-site/        public website: landing page, guide, library reference, model builder
packages/lang/           the .sim language: parser, elaborator, IR (docs/ir.md)
packages/engine/         interpreter of the IR, explorer, symmetry reduction
packages/stdlib/         standard library: sensors, components, model families, tasks
packages/lean-gen/       Lean generation from the IR
packages/vite-plugin/    .sim imports under Vite and Node
packages/core/           shared project types and the graph worker's traversal
packages/simulator-ui/   reusable SolidJS interface
packages/cli/            shared simulant command
lean/                    Lean semantic core and library lemmas
projects/starter/        starter project
projects/black-hole-search/
  sim/                   the paper's algorithms: algo0.sim through algo6.sim
  src/projects.ts        named simulations and presets
  web/                   paper's web application
projects/standup-gathering/  three line-gathering algorithms
projects/private/        optional local private research repository, ignored by Git
scripts/                 public-site build, shared Vite defaults, and conversion tools
```

The [stand-up gathering project](projects/standup-gathering/README.md) compares the paper’s three line-gathering algorithms, with limited visibility, external lights and single-location crashes.

The [public-projects roadmap](docs/public-projects-roadmap.md) plans a broader collection of paper formalizations, starting with graph and ring models. It includes an initial paper catalog, model audits, artifact requirements and a delivery sequence.

Black-hole-search exposes the stable simulation names `black-hole-search-algo0` through `black-hole-search-algo6`. Their settings name the hole's node `site`; settings of the former TypeScript simulations, which called it `BH_node` (shared links, saved settings), are still accepted.

Private projects are excluded from the public build and root typecheck. Only projects explicitly listed in [public-projects.mjs](apps/public-site/src/public-projects.mjs) are published on the website.

## Checking simulations with the CLI

The reusable `@bramas/simulant-cli` package provides the `simulant` executable. In this workspace, run it through `pnpm cli`:

```bash
pnpm cli list-projects
pnpm cli check-config -p cautious-pair -s '{"N":6,"site":2}'      # every admissible execution, no depth limit by default
pnpm cli check-all -p black-hole-search-algo1                      # settings of a ring size share one state graph
pnpm cli check-all -p black-hole-search-algo1 --per-setting        # one state graph per setting (less memory)
pnpm check black-hole-search-algo1                                 # first branch of every setting, as a smoke check
pnpm cli generate-config-graph -p black-hole-search-algo1 -s '{"N":5,"site":2}' -o graph.tex
pnpm cli check-config -p cautious-pair -s '{"N":6,"site":2}' --watch   # again on every save of the .sim sources
pnpm cli lean -p cautious-pair --build                    # Lean model into <project>/lean/Generated, then lake build
pnpm cli --help
```

- `check-config` checks every admissible execution of one setting; `check-all` every setting of the experiment's parameter domains (`--max-configs` limits the settings tested); `-d` and `--max-states` limit the exploration.
- Liveness goals are decided on the whole state graph; a counterexample is printed step by step with its witnesses (such as `activates`), and, for an execution that repeats forever, where its cycle starts. It also prints the settings and the path to load in the simulator to replay it.
- `generate-config-graph` exports the state graph as TikZ, with edges labelled by witnesses; include it with `\input{graph.tex}` in a LaTeX document using the `tikz` package.
- `--watch` (on `check-config`, `check-all`, `check`, `generate-config-graph` and `lean`) recompiles after each save, cancels the run in progress, and prints the results of the newest revision; sources that do not compile print their diagnostics.
- `lean` writes `lean/Generated/<Simulation>/Model.lean` (and `lakefile.toml` and `lean-toolchain` when missing), never `lean/Proofs/`; it rejects proof files that use `sorry`, axioms or new syntax, and `--build` runs `lake build`.

Inside a project folder with exactly one registered simulation, its name is inferred:

```bash
cd projects/starter
npx simulant lean
npx simulant lean --build    # also compile the generated model and proofs
```

Use `-p <name>` only when several simulations are available, such as at the workspace root or in a paper project with several algorithms. An ambiguous command lists the available names without generating files. `npx` uses the installed workspace executable; in a separate project, install `@bramas/simulant-cli` first as described below.

Exhaustive checks return **0** when the tested configurations pass, **1** for a failure or command error, and **2** for incomplete exploration, such as reaching a depth or state limit. A limited check covers only the explored settings and paths.

Discovery uses the calling directory: the current package, `projects/*`, and `projects/private/*`. Registries declare a `./projects` package export; older packages with `projects.ts` or `src/projects.ts` also work. Simulation names must be unique across the workspace.

In a separate project with the CLI installed, use `pnpm exec simulant` instead of `pnpm cli`. Select a different directory or an explicit registry when needed:

```bash
pnpm exec simulant --registry ./src/projects.ts list-projects
pnpm exec simulant --root ../other-paper --registry ./src/projects.ts check-config -p my-simulation -s '{"N":8}' -d 20
```

The CLI supports TypeScript registries and `.sim` imports, and includes its own loader; it requires Node.js 20.6 or newer.

## Using Simulant in a separate project

Simulant and its initializer are available on public npm. A new project needs
Node.js 20.6 or newer, with no clone of this repository:

```bash
npm create @bramas/simulant@latest my-project
cd my-project
npm install
npm run dev
```

The initializer creates one working experiment, its registry and a simulator
page. It refuses to overwrite a nonempty directory. Then:

```bash
npm run check                  # every setting and admissible execution
npm run build                  # static site in dist/
npx simulant lean              # generate the Lean model
npx simulant lean --build      # also compile it (Lean/elan installed separately)
```

Simulator versions are pinned to the initializer's release. Keep the generated
package-manager lockfile to preserve the complete dependency versions. Public
npm packages need no GitHub Packages configuration or token for installation;
remove any old `@bramas:registry=https://npm.pkg.github.com` mapping when moving
to the public npm release.

To prepare and verify a release before publication, including a fresh project
installed from the actual archives, see [npm distribution](docs/distribution.md).
For workspace development, `pnpm install` also builds the runtime packages; run
`pnpm packages:build` after changing package sources used by Vite configurations.

## Creating a project

Copy [the starter project](projects/starter) and see its [README](projects/starter/README.md):

```text
projects/<paper>/
  package.json
  src/main.sim           algorithms and experiments
  src/projects.ts        simulation registry and presets
  src/renderers/         custom drawing (optional)
  web/src/App.tsx
  web/src/workers/graph-worker.ts
  web/tsconfig.json
  web/vite.config.ts
  web/index.html
```

Register each experiment of a `.sim` module with `simProject`:

```ts
// src/projects.ts
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as main from './main.sim';
export const projects = { 'my-simulation': simProject(main, 'myExperiment') };
```

`simProject` builds the settings form from the experiment's parameters, draws configurations with the default ring renderer (or the `draw` option), shows the algorithm's `.sim` source with each agent on its current line, and provides the explorer's checks to the CLI. Its `aliases` option accepts older parameter names in settings. Parameter domains use `in [values]` for exact finite sets and `where predicate` for general properties; both apply when combined. Simulator starting values are inferred or supplied with `defaults` in `project.ts`. Use `checkSettings` there to supply finite checks for predicate-only domains; neither option changes the model assumptions.

Declare the registry in `package.json` so the CLI can discover it:

```json
{
  "exports": {
    ".": "./src/projects.ts",
    "./projects": "./src/projects.ts"
  }
}
```

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

## Publishing and reproducibility

To publish a project's web page, add a `web/` app and a package `build` script, use `projectViteConfig(<slug>)` to build into `dist/<slug>`, and add its metadata to [public-projects.mjs](apps/public-site/src/public-projects.mjs). `pnpm build` builds the listed projects and the landing page into `dist/`.

[The Pages workflow](.github/workflows/pages.yml) deploys `dist/` to GitHub Pages. Set the repository's Pages source to **GitHub Actions**.

[The package release workflow](.github/workflows/release-packages.yml) prepares and validates the public npm archives. Prepare a shared version with `pnpm release:version patch` (add `--dry-run` to preview), then review and commit it. A manual workflow run prepares downloadable artifacts by default; its explicit publish input or a matching `simulator-v*` tag enables publication through npm trusted publishing. See [the release procedure](docs/distribution.md) for versions, verification and authentication.

For a paper artifact, record exact package versions or commits and tag the repository state, for example `paper-black-hole-search-v1`. `workspace:*` tracks the current local package; it does not preserve an older simulator version. Keep old artifacts reproducible through exact external package versions or their repository tag.

## License and citation

Simulant is distributed under the CeCILL-B license. See [LICENCE.txt](LICENCE.txt).

If you use this simulator or the black-hole-search artifact, please cite:

> François Bonnet, Quentin Bramas, and Anissa Lamani. Searching for an Eventually-Emerging Black Hole in Rings. In 5th Symposium on Algorithmic Foundations of Dynamic Networks (SAND 2026).
