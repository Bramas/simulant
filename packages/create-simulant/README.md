# Create Simulant

A minimal standalone project for research on mobile entities and distributed
algorithms. Create a project with:

```sh
npm create @bramas/simulant@latest my-project
cd my-project
npm install
npm run dev
```

Edit `src/main.sim` to change the algorithm. The project includes the simulator
page, compiler diagnostics, exhaustive checking and Lean generation:

```sh
npm run check
npm run typecheck
npm run build
npx simulant lean --build
```

Requires Node.js 20.6 or newer. Install Lean through elan separately for
`--build`. Simulator versions are pinned; keep the generated lockfile with your
research project. Existing nonempty directories are never overwritten.

Source and release instructions: [Bramas/simulant](https://github.com/Bramas/simulant).
