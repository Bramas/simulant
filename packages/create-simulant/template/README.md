# My Simulant project

```sh
npm install
npm run dev
```

Edit `src/main.sim` and save. The simulator reloads the experiment and displays
compiler diagnostics. `src/projects.ts` registers the experiments available to
the page and command line. `web/src/App.tsx` customizes the page.

```sh
npm run check              # every setting and admissible execution
npm run typecheck          # TypeScript and editor configuration
npm run build              # static website in dist/
npx simulant lean          # generate lean/Generated/
npx simulant lean --build  # generate, then compile with Lake
```

Node.js 20.6 or newer is required. Install Lean through elan separately for
`--build`; the project pins its toolchain when generating Lean. Write your
proofs in `lean/Proofs/`: regeneration preserves that folder. Compiling the
generated model does not prove its correctness statement.

The simulator package versions are pinned in `package.json`. Keep the package
manager's lockfile with the project for reproducible research.
