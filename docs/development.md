# Development

Read the [architecture](architecture.md), [language reference](sim-language.md) and [IR contract](ir.md) for the area being changed. Keep these documents aligned with the implementation. Record unresolved problems here with a reproduction and remaining work; completed implementation history is available in Git.

## Verification

Use Node.js 24 or newer and pnpm 10.22.0 for workspace development. The published CLI's runtime requirement is separate from the workspace test requirement.

Run commands from the repository root unless a working directory is shown. Node tests load TypeScript and `.sim` imports through the registered hooks.

```bash
pnpm test
pnpm typecheck

# Editor extension, bundled server and reusable browser language service
pnpm editor:build
pnpm editor:package

# A single test file
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/starter.test.ts

# Optional private translations, when the private repository is present
node --import tsx --import ./packages/vite-plugin/src/register.ts --test projects/private/*/tests/*.test.ts

# Public page builds
(cd projects/starter && ../../node_modules/.bin/vite build web --config web/vite.config.ts)
(cd projects/black-hole-search && ../../node_modules/.bin/vite build web --config web/vite.config.ts)
pnpm --filter @bramas/simulant-project-standup-gathering build

# Stand-up gathering: paper examples, sensors and exhaustive crash branches
node --import tsx --import ./packages/vite-plugin/src/register.ts --test --test-isolation=none tests/standup-gathering.test.ts tests/parameter-acceptance.test.ts tests/component-inputs.test.ts
# Domain syntax, defaults, finite project checks and source updates
node --import tsx --import ./packages/vite-plugin/src/register.ts --test --test-isolation=none tests/parameter-acceptance.test.ts packages/simulator-ui/test/parameter-defaults.test.ts
pnpm cli check-all -p standup-gathering-h-plus-three
pnpm cli check-all -p standup-gathering-h-plus-one
pnpm cli check-all -p standup-gathering-two-colors

# Lean: build the semantic library before the examples
(cd lean && lake build Simulant && lake build Examples)

# Generate a project's Lean model (the name is inferred inside a single-simulation project)
npx simulant lean -p cautious-pair --build

# Lean build, proof checks, differential tests and generated project models
SIMULANT_LEAN=1 node --import tsx --import ./packages/vite-plugin/src/register.ts --test --test-isolation=none packages/lean-gen/test/lean-gen.test.ts tests/cli-lean.test.ts

# Distribution: actual npm archives installed outside the workspace (network access)
pnpm test:packages
# Include a clean build of the installed Lean semantic library and generated model
SIMULANT_LEAN=1 pnpm test:packages

# Browser acceptance
pnpm test:browser
# Visibility warnings and inline errors, without the known line-highlight scenario
node --import tsx --test --test-name-pattern='stand-up visibility' tests/browser/ui.test.ts
```

`pnpm typecheck` first generates snapshot types with `pnpm sim-types`. Ordinary tests do not require Lean or a browser. Bun is optional: run the same CLI with
`bun packages/cli/bin/simulant.mjs <command>`. The Node launcher remains the default.
`tests/cli-bun.test.ts` compares both runtimes on an independent project and skips if Bun is
unavailable; `SIMULANT_BUN` selects an executable outside `PATH`. Bun uses native package
resolution, so projects outside the repository need their workspace dependencies installed. Lean-backed tests take several minutes. Build `Simulant` before the examples when validating changes to the semantic core. The package configuration includes its root module explicitly, so a fresh project can build its installed library without a pre-existing cache.

Vite tests need permission to bind local sockets, and `tsx` may need a local IPC socket. Sandboxes can also report `spawnSync lake EPERM` even when Lake produces successful output; rerun affected verification with appropriate process access before treating that as an implementation failure. Set `TMPDIR` to a readable directory if temporary files cannot be read back. On macOS, use `TMPDIR=/private/tmp` for Vite tests if symbolic links in the default temporary directory prevent file updates from resolving. Generated Lean dependency paths use physical directories and work through those links.

Browser tests use a local Node or Python Playwright installation and its matching Chromium browser. `SIMULANT_PLAYWRIGHT_MODULE` selects another installed Node API. See [browser acceptance](../tests/browser/README.md) for setup and coverage. Source-edit tests use temporary public starter copies.

Editor support is documented in the [extension README](../extensions/vscode-simulant/README.md). Its tests cover the actual TextMate grammar, compiler diagnostics, scope-aware navigation/rename, incremental stdio LSP traffic and browser bundling. Extension tests are included by `pnpm test`; generated bundles and VSIX files live in ignored `extensions/vscode-simulant/dist/`. VS Code host testing can use the repository's F5 launch configuration, or run `extensions/vscode-simulant/test/host.cjs` through `--extensionTestsPath` with `--extensionDevelopmentPath` and an isolated user-data/extensions directory. Under WSL, the Remote WSL CLI can ignore those isolation flags; use the native desktop CLI when testing the Windows host.

The 2026-10-15 editor verification passed 148 ordinary tests with four Lean-only skips (152 total), including 16 editor tests; strict typechecking and VSIX packaging passed. An isolated Windows VS Code 1.141.2 Extension Development Host passed activation, language mode, hover, completion, definition, outline, rename and live diagnostics. The 2026-10-14 verification also passed all seven Lean-backed tests, private migration tests and both public page builds. Browser acceptance passed six of seven scenarios on repeat; the line-only highlighting failure remains below. The 2026-10-16 interface redesign (no CSS framework, themed drawings) kept that result: browser acceptance passes every scenario but the line-only one, with selectors and labels updated for the new controls. The stage's ring placement, which the canvas-selection check clicks, is `geometry` in `SimulatorApp.tsx`.

The 2026-10-17 stand-up gathering visibility verification passed 203 ordinary tests (208 total, five optional skips), strict typechecking, the project page build, and all nine check-all samples. The focused Chromium regression passed minimum-radius and gap-dependent warnings on φ, stepping below the declared bounds, clearing warnings after correction, and inline structural errors without console logging. Earlier browser checks also verified the simplified settings, absence of light state in the oblivious models, and recorded crash presets. All three generated gathering models compiled with Lake in a temporary output directory; no correctness theorem was proved. The earlier full public-site build also passed. The manuscript figure discrepancy is recorded below.

The subsequent parameter-domain verification passed 210 ordinary tests (215 total, five optional skips), strict typechecking, runtime and editor builds, and the gathering page build. Tests cover `in` finite domains, predicate-only domains, their intersections, bounded default selection, project default overrides, finite project check settings and source updates. All nine gathering check settings passed after moving samples out of the models. The focused Chromium visibility regression also passed. Lake compiled both the predicate-only gathering model and a separate model combining a finite domain with a predicate; these are compilation checks, not correctness proofs.

## Package distribution

Prepare a shared release version with `pnpm release:version patch` (or `minor`,
`major`, or an explicit stable version); add `--dry-run` to preview without
writing. This updates the public manifests, template release dependencies and
lockfile, leaving commit, tag and push as separate review steps. Focused release
tests run with `node --import tsx --import ./packages/vite-plugin/src/register.ts
--test tests/release-version.test.ts`. GitHub release publication uses npm trusted
publishing; see [distribution](distribution.md) for its per-package setup.

The release workflow uses `--skip-published` to resume partial publications.
Focused registry and retry tests are in `tests/release-publish.test.ts`; archive
acceptance also verifies that every public package ships its README.

`pnpm install` builds runtime package exports through the root `prepare` script.
Run `pnpm packages:build` again after editing runtime sources used by external
Node/Vite consumers. Run `pnpm packages:pack` to build the explicit public
package list into `dist/packages/`; that directory is ignored. Inspect
`release.json` and run `node scripts/publish-packages.mjs --dry-run` before an
actual release. See [distribution](distribution.md).

The ordinary suite checks initializer creation and overwrite refusal. Sequential scheduling has a public conformance fixture and tests for singleton activation, stable identities, unbounded finite activation gaps and fair liveness; Lean differential verification includes that fixture.
`pnpm test:packages` separately installs the real archives into a temporary
project with no workspace links, checks its CLI, builds its website, and
starts its dev server to check that the published Solid JSX is transformed.
It uses the configured npm registry for external dependencies; the simulator
packages come from local archives. `SIMULANT_LEAN=1` also builds Lean from the
installed source package, without reusing the workspace's `.lake` cache.
`SIMULANT_PACKAGES_OFFLINE=1` requests an offline install when all dependency
metadata and archives are already cached. Tests stop their temporary dev server
before removing the project, with a forced shutdown after three seconds if
graceful shutdown leaves watcher handles running.

## Generated files and regression fixtures

Regenerate these files from their sources:

```bash
# Component library and example models; an unchanged generator leaves no Lean diff
npx tsx packages/lean-gen/src/library.ts
npx tsx packages/lean-gen/src/examples.ts
git diff -- lean

# IR conformance fixtures, when intentionally changing the contract or semantics
npx tsx packages/engine/conformance/generate.ts
# Regenerate just a selected fixture
node --import tsx packages/engine/conformance/generate.ts parameter-acceptance
```

`lean/Simulant/Library/` and `lean/Examples/*/Model.lean` are generated. Hand-written component lemmas live in `lean/Simulant/LibraryLemmas/`; example proofs and equivariance proofs live beside their generated models. Project Lean generation writes `lean/Generated/` and preserves `lean/Proofs/` and existing Lake configuration. `.simulant/types/` contains ignored generated renderer types.

Conformance fixtures specify unreduced state graphs, verdicts, witnesses and activations. Keep them, the interpreter, the Lean generator and [ir.md](ir.md) consistent whenever changing the IR. The standard library's [TypeScript counterparts](../packages/stdlib/README.md) live in `packages/stdlib/test/helpers/` and are imported directly by conformance, engine and typechecker tests. They have no production TypeScript exports or resolution aliases. Builder-versus-`.sim` tests check the frontend against independently constructed IR; changes to shared definitions must keep those counterparts consistent.

`tests/migration*.ts`, `tests/presets.test.ts` and `projects/black-hole-search/fixtures/migration/` retain behavior recorded before the former engine was removed. These are regression coverage for reachable configurations, recorded executions and presets. Private regression fixtures remain in the separate private repository.

`docs/syntax/lean/Target.lean` is a standalone hand-written semantic prototype retained for reference. It predates the current generated library and is outside the Lake targets; the current semantics are documented in [ir.md](ir.md) and implemented in `lean/Simulant/`.

## Performance work

Benchmark `gathering-on-rings` only at N = 16 unless the user requests another size. Compare the same deterministic sample: the existing per-setting reference uses 200 settings, and different samples have substantially different costs. Private full-view equivalence tests can be enabled with `GATHERING_FULL=1` for views up to 16 nodes.

The recorded N = 16 `.sim` shared-graph run checked 62,736 settings in 4 min 22 s, with 107,720 states and 1.35 GB peak RSS. Shared graphs save time by reusing states; `--per-setting` limits memory. Keep canonical string encodings until profiling demonstrates a need to change them.
Batch grouping appends to arrays instead of copying growing groups, and initial/successor
membership uses maps. `--max-configs` stops the settings iterator before requesting another
setting, so a small prefix does not enumerate later ring sizes. A dependent domain may still
construct its list before yielding its first value. These changes preserve state encodings,
successor order, witnesses and the exploration semantics.

## Known issues

- **The stand-up gathering manuscript's Algorithm 2 figure disagrees with its formal rules.** In `figures/oblivious-example-Hp1.tex`, with φ = 5, the row `......>X<X.XX.<` occupies coordinates `[6,7,8,9,11,12,14]`. The next illustrated row occupies `[7,9,11,12,13]`, but `border-idle,2` keeps the border at 6 still, and `4-merge,1` moves the robot at 7 towards 6. The formal successor therefore occupies `[6,9,11,12,13]`, agreeing with the prose describing the four-block merge. Reproduce with `tests/standup-gathering.test.ts` or the `standup-gathering-h-plus-one` simulation from `[3,7,8,9,11,12,14,15,17]`, φ = 5, following empty-crash branches for four rounds. The showcase follows the formal rules. Reconcile the manuscript illustration with those rules separately; the manuscript is outside this repository.

- **Array-valued presets are not formatted as JSON by the generic settings editor.** Loading a preset with a list parameter passes the array through `formValues`; assigning it to the text input displays comma-separated elements without brackets. Normalize array-valued JSON fields to text in project adapters until the editor serializes loaded values according to its field schema. Reproduce by loading an array-valued preset and inspecting/editing its JSON field.

- **Lean component export supports only its top-level world/agent record types.** A component with `World := { points : List Point }`, where `Point` is a record, or a component sensor returning a custom record, fails generation with `no Lean name for ...`. A transformed parameter input such as `xs := (param points).map (·.x)` also cannot infer the input parameter type when no direct initializer determines that parameter’s type. Direct initializers are collected before transformed ones, so their field order does not matter. Generate nested record declarations and pass known parameter types into component generation. Until then, use directly initialized scalar lists and scalar/list-valued component sensors.

- **Lean indexing a list of nodes inside a component sensor needs a nonempty node type.** A sensor using `C.nodes.at i` emits indexing of `List (Fin σ.N)` without an `Inhabited (Fin σ.N)` instance. Reproduce by exporting and compiling a component sensor containing that expression. Supply a valid node default or a suitable nonempty-size assumption in the generated component. Mapping nodes to booleans before indexing avoids this requirement.

- **Lean export of indexing a list of records needs an `Inhabited` instance.** A used definition such as `def first (xs : List Item) : Item := xs.at 0`, where `Item` is a `.sim` structure, generates Lean indexing (`xs[i]!`) with a missing `Inhabited Rec…` instance. Reproduce by using that definition in an experiment and running its Lean export with `--build`. Generate suitable defaults/instances for record types, or make the indexing default explicit in the translation, with a Lean compilation regression. Until then, projecting to lists of supported scalar/list types before indexing avoids the failure.

- **Line-only edits leave explanation-based highlights stale.** Browser acceptance fails `line-only saves preserve the execution and move highlights`. `simExecution` caches explanations from the running system, while `AlgorithmViewer` prefers `explanation.line` over the current line table. On algo1, adding a leading comment shifts the adapter's lines from `[32,32,35,35]` to `[33,33,36,36]`, but `execution.explain([0,0])` retains the old lines. Refresh explanation source locations without resetting execution, and cover the combined viewer/explanation behavior; the existing adapter test checks only the line table.
- **The first-branch smoke check ignores SSYNC fairness.** `checkFirstBranch` in `packages/engine/src/check.ts` judges repeated cycles without checking activation fairness. The skeleton's two-agent `MarkActivated` / `EveryoneActivated` experiment on SSYNC, N = 3, passes `checkSetting` but fails `checkFirstBranch`, whose first branch never activates the second agent. An unfair lasso must not be reported as an admissible counterexample. Add a focused regression test; the exhaustive explorer already handles this case correctly.

- **Custom renderers in the private projects ignore the drawing theme.** `projects/private/gathering-on-rings/src/renderer.ts` draws its labels in `#333`, which is hard to read on the dark stage. Reproduce by opening that page with a dark color scheme. Use `options.theme.foreground` (and `muted`) as the starter's renderer does; the private repository is updated separately.

- **Regenerating the conformance fixtures adds display-only `at` lines.** `npx tsx packages/engine/conformance/generate.ts` strips `source` but not the `at` source lines of expressions, so all seven fixtures change (for example `ssync.json` gains `"at":38` on the algorithm's step) although their semantics do not. Strip `at` in the generator, as the simulator project key does, and check that regeneration leaves no diff.

## Model limitations

Lean translation and equivariance limitations are described in [architecture.md](architecture.md#lean-guarantees-and-limits). Bounded checks do not establish correctness for all sizes.

The registered `algo5` and `algo6` experiments preserve pseudo-random idling from the TypeScript simulations and need exploration limits; the synchronous variants without that idling are checked exhaustively. `algo0` succeeds only when the hole is on the starting node under its task, because a surviving a₄ never claims. Its growing exploration counter also requires a state limit.

`algo6Async` fails on N = 5, site = 3: the translated leader and follower can separate and wait forever. These rules differ from the paper's cautious-walk procedure. The check takes minutes and is outside the ordinary suite; register that experiment to run it with `pnpm cli check-config`. The synchronous variant succeeds on the tested settings. Preserve these distinctions when changing algorithms or task semantics.
