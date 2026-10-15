# Instructions for AI agents working in this repository

The implemented design is described in [`docs/architecture.md`](docs/architecture.md). Verification commands and unresolved problems are in [`docs/development.md`](docs/development.md).

## Before you start

1. Read `docs/development.md`, including the known issues relevant to the task.
2. Read `docs/architecture.md` and the relevant sections of `docs/sim-language.md`; read `docs/ir.md` when changing semantics or the IR.
3. Use the verification commands in `docs/development.md` to establish the relevant baseline and check your changes.

## While you work

- Update the maintained documentation when changing architecture, language, semantics or development workflows. Explain lasting design choices and their reasons where they apply.
- Record unresolved problems in `docs/development.md` under "Known issues", with a reproduction and remaining work, instead of silently fixing unrelated code.
- `packages/core` keeps only the shared project types and the graph worker's traversal. Engine code goes in `packages/engine`; the package boundaries are documented in `docs/architecture.md`.
- `projects/private/` is a separate, git-ignored repository. Never commit it from this repository, and never copy private code or fixtures into public files.
- Do not commit unless the user asks.

## Conventions

- TypeScript, strict mode, ES modules, run with `tsx`. Tests use `node:test` and live in `tests/` (`pnpm test`) or next to the package (`packages/<name>/test/`).
- `.sim` files are imported as modules: under Vite through `packages/vite-plugin`, under Node through `--import ./packages/vite-plugin/src/register.ts` (already in `pnpm test` and the CLI). Run a single test file with `node --import tsx --import ./packages/vite-plugin/src/register.ts --test <file>`.
- `pnpm typecheck` must stay clean (it first generates `.simulant/types` with `pnpm sim-types`).
- Match the style of the surrounding code: small modules, comments only where they explain intent.
- Lean 4 is installed through elan (no Mathlib). Lean sources live in `lean/`: build with `cd lean && lake build Simulant && lake build Examples` (build `Simulant` first; on this drive Lake sometimes misses a changed dependency of another target). Files under `lean/Simulant/Library/` and `lean/Examples/*/Model.lean` are generated: regenerate them, never edit them. Lean-backed tests run with `SIMULANT_LEAN=1`.
- The IR is described in `docs/ir.md`; a change to it updates the conformance fixtures, the interpreter, the Lean generator and that document together.
- The standard library used by projects is authored in `packages/stdlib/sim/`. Files in `packages/stdlib/test/helpers/` are hand-written builder counterparts for conformance, engine and typechecker tests; keep shared definitions consistent. See `packages/stdlib/README.md`.
