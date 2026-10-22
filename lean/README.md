# @bramas/simulant-lean

Lean 4 semantic library for Simulant experiments on mobile entities and
distributed algorithms. The npm package ships the hand-written semantic core,
generated standard-library components, Lake configuration and pinned Lean
toolchain. It does not ship compiled caches or example projects.

## Use from a Simulant project

```sh
npm create @bramas/simulant@latest my-project
cd my-project
npm install
npx simulant lean
npx simulant lean --build
```

Install [elan](https://github.com/leanprover/elan) separately for `--build`.
The CLI configures the project's Lake dependency and uses the toolchain shipped
with this library. Generated models go in `lean/Generated/`; write hand-written
proofs in `lean/Proofs/`, which subsequent generation preserves.

## Library contents

- `Simulant.lean` and `Simulant/`: configurations, nondeterminism, graph spaces,
  views and their presentations, rounds, executions, fairness, temporal goals
  and supporting lemmas; `Simulant/Spaces.lean` gives the library's cycle and
  line with closed forms.
- `Simulant/Library/`: generated component definitions.
- `Simulant/LibraryLemmas/`: hand-written component lemmas.
- `lakefile.toml` and `lean-toolchain`: build configuration and compiler version.

This is a Lean source package, not a JavaScript runtime. The npm package's
`package.json` subpath lets tooling locate the library. The TypeScript-to-Lean
generator is distributed separately as `@bramas/simulant-lean-gen`.

Building a generated model checks its Lean types; proving the generated
correctness statement is a separate step. No Mathlib dependency is required.

[Lean guarantees and limits](https://github.com/Bramas/simulant/blob/main/docs/architecture.md#lean-guarantees-and-limits)
· [Source](https://github.com/Bramas/simulant/tree/main/lean)

Licensed under CeCILL-B; see `LICENCE.txt`.
