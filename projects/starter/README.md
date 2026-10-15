# Starter project

A minimal Simulant project using the shared [project architecture](../../docs/architecture.md#projects-and-source-updates). Copy this folder to start a new one.

```text
src/main.sim            model, algorithm, task and experiment (the `.sim` language: docs/sim-language.md)
src/projects.ts         the registry: experiments shown by the page and the CLI, presets
src/renderers/ring.ts   optional custom drawing (the default ring renderer otherwise)
web/                    the standard viewer page
.simulant/types/        generated snapshot types (ignored by git)
```

## Workflow

```bash
pnpm --filter @bramas/simulant-project-starter dev     # open the printed URL
```

Edit `src/main.sim` and save:

- if the experiment changed, the page restarts at the initial configuration and keeps the settings that are still valid (the reset ones are listed above the drawing);
- if it does not compile, the page shows the errors with file, line and column, and keeps the last version that compiled, marked out of date;
- if only lines moved (comments), or only `src/renderers/ring.ts` changed, the page redraws and keeps the execution.

From the command line (from the repository root):

```bash
pnpm cli check-all -p cautious-pair              # every setting, every admissible execution
pnpm cli check-config -p cautious-pair -s '{"N":6,"site":2}' --watch   # again on every save
pnpm cli lean -p cautious-pair --build  # Lean model into lean/Generated; write proofs in lean/Proofs
pnpm sim-types                                   # regenerate .simulant/types (also done by the dev server)
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/starter.test.ts
```

Inside the project folder, the single registered simulation is selected automatically:

```bash
cd projects/starter
npx simulant lean
```

Add `--build` to compile the generated Lean model and proofs, or `--watch` to regenerate on saves. If your registry contains several simulations, choose one with `-p <name>`.

## Registering an experiment

```ts
import * as main from './main.sim';
export const projects = {
  'cautious-pair': simProject(main, 'cautiousPair', { draw }),
};
```

Options of `simProject`: `draw` (a renderer, preferably made with `defineRenderer` so that saving it redraws in place), `agentName` (how the algorithm view names agents), and `aliases` (older parameter names accepted in settings, for links and saved settings of an earlier version: `{ BH_node: 'site' }`).
