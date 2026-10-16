# npm distribution and project creation

The runtime packages and initializer are available on public npm as version
`0.1.0`. Use the archive test below to verify a future release locally before
publishing.

## Creating an independent project

```sh
npm create @bramas/simulant@latest my-project
cd my-project
npm install
npm run dev
```

`npm create @bramas/simulant` runs the `@bramas/create-simulant` initializer.
The equivalent explicit form is `npx @bramas/create-simulant@latest my-project`.
The initializer needs Node.js 20.6 or newer and creates a minimal experiment,
registry, Vite configuration and simulator page. It writes no credentials and
refuses a nonempty destination. Installation is a separate, visible step.

```sh
npm run check
npm run build
npx simulant lean
npx simulant lean --build
```

`dev` serves the page and reloads `.sim` edits. `check` exhaustively checks the
starter experiment; `build` creates the static website in `dist/`. `lean`
generates `lean/Generated/` and preserves `lean/Proofs/`; add `--build` to compile
with Lake. Install elan separately for Lean compilation; the generated
`lean-toolchain` selects the version shipped with the semantic library.

The simulator versions are exact and match the initializer version. Commit the
package manager's lockfile alongside a research project for complete dependency
reproducibility. No GitHub Packages configuration is needed for public npm;
remove an old `@bramas` registry mapping to GitHub Packages before migrating.

## Package contents

All runtime packages use version `0.1.0` for the initial release:

- `@bramas/simulant-core`: shared project types and graph worker traversal.
- `@bramas/simulant-lang`, `simulant-engine` and `simulant-lean-gen`: compiler,
  interpreter/explorer and Lean generation.
- `@bramas/simulant-stdlib`: the `.sim` standard library, without test helpers.
- `@bramas/simulant-vite-plugin`: Vite and Node/Bun `.sim` loaders.
- `@bramas/simulant-ui`: the simulator interface, including Solid JSX exports.
- `@bramas/simulant-lean`: Lean semantic sources, generated component library,
  Lake configuration and pinned toolchain; no compiled cache or example projects.
- `@bramas/simulant-cli`: the installed `simulant` executable.
- `@bramas/create-simulant`: a dependency-free initializer and template.

The explicit ordered list is `packageDirectories` in
[`scripts/build-packages.mjs`](../scripts/build-packages.mjs). No private
project is on that list. Packing rewrites `workspace:*` dependencies to release
versions. Runtime exports use generated ESM JavaScript; type exports use the
original TypeScript. The UI retains Solid JSX for Vite's Solid plugin.

## Preparing and validating archives

From the workspace, using Node.js 24 or newer and pnpm 10.22.0:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm packages:pack
SIMULANT_PACKAGES_DIR=dist/packages SIMULANT_LEAN=1 pnpm test:packages
node scripts/publish-packages.mjs --dry-run
```

Use `TMPDIR=/private/tmp` for local Vite tests on macOS when necessary.
`test:packages` packs and installs every simulator package in a separate
project. Local file dependencies point only the simulator packages to the actual archives;
external dependencies are installed from npm. It verifies archive inventories,
initializer overwrite refusal, CLI discovery and exhaustive checks, Lean
generation, website production build, and dev-server JSX transformation. With
`SIMULANT_LEAN=1`, it also compiles the installed Lean sources and generated
model without a workspace cache. This test needs network access for uncached
external dependencies; `SIMULANT_PACKAGES_OFFLINE=1` uses the existing cache.

`SIMULANT_PACKAGES_DIR` selects existing archives instead of packing again, so
the release workflow tests the exact files it will upload and publish.

`packages:pack` writes `dist/packages/*.tgz` and `release.json`, containing
names, versions and SHA-256 hashes in dependency order. Inspect these exact
archives before publication. The initializer is last, so its dependencies are
published first. The publish script validates every archive and version before
publishing anything and never repacks sources during publication.

## Publishing

Confirm ownership of the npm `@bramas` scope before the first publication.
The scope was retained from the existing package names; GitHub ownership alone
does not establish npm ownership. Authenticate using npm's supported login or
publishing-token workflow; never put credentials in this repository.

After review, an authenticated maintainer can publish the prepared archives:

```sh
node scripts/publish-packages.mjs --publish
```

For interactive publication, use a current npm client and complete its browser
2FA challenge. The first release was blocked by npm 10.9.8 with an `E403` 2FA
error despite an authenticated account with 2FA enabled; npm 12.2.0 correctly
opened browser verification. Use it temporarily without a global upgrade:

```sh
npm exec --yes --registry=https://registry.npmjs.org --package=npm@12.2.0 -- node scripts/publish-packages.mjs --publish
```

npm 12.2.0 requires Node.js 22.22.2+, 24.15.0+, or 26+. Keep the terminal
running while approving the browser prompts; each package may require approval.
After npm accepts a publication, registry processing can take a few minutes.
Wait for all dependencies to become available before testing the initializer.

The [release workflow](../.github/workflows/release-packages.yml) uses the
public npm registry. A manual run prepares and uploads archives by default.
Its explicit `publish` input, or a `simulator-v<version>` tag, enables publication
using the repository's `NPM_TOKEN` secret. GitHub Actions publications include
provenance via its OIDC permission. The workflow installs elan and tests a clean
Lean build before packing the final artifacts. Do not trigger publication
before npm authentication and scope ownership are configured.

For subsequent releases, update every listed package version, including
`lean/package.json` and the initializer, together. The initializer pins all
simulator dependencies to its own version. Update template dependency examples
and this document, run `pnpm install --lockfile-only`, then validate and repack.
A release tag must match every package version. Existing npm versions cannot
be replaced; publish a new version for a changed release.
