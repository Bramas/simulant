# Projects

Each folder under `projects/` is a project or paper package. A project package can contain both simulation code and, optionally, a web page under `web/`.

Current workspace packages:

- `black-hole-search/`: all black-hole-search variants and its paper web page.

Only projects listed in `apps/public-site/src/public-projects.mjs` are published on the public site.

## Adding A Web Page

Use `@bramas/simulant-ui` when the default simulator interface is enough:

```tsx
import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';
import { projects } from '../projects';

export default function App() {
  return (
    <SimulatorApp
      title="My Paper"
      projects={projects}
      createGraphWorker={() => new Worker(new URL('./workers/graph-worker.ts', import.meta.url), { type: 'module' })}
    />
  );
}
```

If a paper needs a custom interface, keep the custom code in that project's `web/` folder and still reuse smaller pieces from `@bramas/simulant-ui` where useful.

For a published paper, record the exact `@bramas/simulant-core` and `@bramas/simulant-ui` versions used by the project.

Private projects should normally depend on published `@bramas/simulant-*` versions. During active local development, they can temporarily use `link:../simulant/packages/core` and `link:../simulant/packages/simulator-ui` to test simulator changes before publishing a new package version.

## Publishing A Public Project

Public pages are built by the root command:

```bash
pnpm build
```

To include a project in the public site:

1. Add a `web/` app in the project package.
2. Add a `build:web` script to that project's `package.json`.
3. Configure the Vite `outDir` to write into `dist/<project-slug>`.
4. Add the project metadata to `apps/public-site/src/public-projects.mjs`.

The root build creates a landing page at `dist/index.html` and links to every listed project page. GitHub Actions then deploys that `dist/` folder through GitHub Pages.
