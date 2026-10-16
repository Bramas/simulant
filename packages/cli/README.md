# Simulant CLI

Check `.sim` experiments and generate their Lean models. The package is prepared
for its first public npm release. After publication, create a complete project
with `npm create @bramas/simulant@latest my-project`, or install this CLI into
an existing Simulant project:

```sh
npm install --save-dev @bramas/simulant-cli
npx simulant list-projects
npx simulant check-all -p my-simulation
npx simulant lean
npx simulant lean --build
```

A project registers experiments in `projects.ts` or `src/projects.ts`, or a
`./projects` package export. Lean generation selects the only registered
simulation automatically; use `-p <name>` if there are several. `--watch`
reruns a command on `.sim` changes. `--root` and `--registry` select another
project directory or registry.

Node.js 20.6 or newer is required; the launcher also supports Bun. The package
loads TypeScript registries and `.sim` imports itself. Lean compilation needs
elan/Lake separately. Generated files go in `lean/Generated/`; write proofs in
`lean/Proofs/`, which regeneration preserves. Compilation does not prove the
generated correctness statement.

Source and full documentation: [Bramas/simulant](https://github.com/Bramas/simulant).
