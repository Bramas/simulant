# npm distribution and project creation

The first public npm release of the runtime packages and initializer was
`0.1.0`. Their package manifests record the version being prepared. Use the
archive test below to verify each release locally before publishing.

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

All runtime packages share one release version:

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

Prepare the next version from the repository root:

```sh
pnpm release:version patch --dry-run
pnpm release:version patch
# Also accepts minor, major, or an explicit stable version such as 0.2.0
```

The command updates only the explicit public package list, including Lean and
the initializer, plus release dependencies in the initializer template. It
preserves `workspace:*` links, private projects, and the private root manifest.
It runs `pnpm install --lockfile-only --ignore-scripts`; if that fails, the
manifests and lockfile are restored. A dry run writes nothing. Inconsistent
package versions, malformed versions and non-increasing versions are rejected
before any changes. Review the resulting diff before committing. The command
does not commit, create tags, push, pack, or publish.

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
publishing anything and never repacks sources during publication. Every public
archive includes a package README; archive acceptance checks that it is shipped.

## Resuming a partial release

The GitHub workflow publishes with `--skip-published`. After validating all
local archives, it checks each exact package name and version on the public npm
registry and publishes only the missing versions, in dependency order. An
existing version is skipped without comparing or replacing its archive. Only
HTTP 404 means a version is missing; authentication, network and registry errors
abort the checks before any package is published.

To preview or resume an interrupted release locally:

```sh
node scripts/publish-packages.mjs --dry-run --skip-published
node scripts/publish-packages.mjs --publish --skip-published
```

All versions already present is a successful no-op. Omitting `--skip-published`
preserves strict publication of the complete list. Keep the prepared release
version when recovering from a partial publication; fix the affected package's
trusted-publisher settings and start a new workflow on `main` with `publish`
enabled. A new workflow run is needed to pick up script changes committed after
the failed run. Existing published versions remain immutable.

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

The [release workflow](../.github/workflows/release-packages.yml) uses npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) with OIDC on
a GitHub-hosted runner, without an `NPM_TOKEN` secret. Configure each public
package on npm to trust owner `Bramas`, repository `simulant`, and workflow
filename `release-packages.yml`, with direct `npm publish` allowed. Leave the
environment name empty unless the workflow is also changed to use that
environment. npm requires a first successful publication within two days of
creating a trusted publisher; recreate an expired configuration if necessary.

The workflow installs npm 12.2.0 on Node 24 for trusted publishing support and
uses `id-token: write`; npm handles OIDC authentication and provenance. A manual
run prepares and uploads archives by default. Its explicit `publish` input,
or pushing a `simulator-v<version>` tag, enables publication. An ordinary
branch push does not trigger the package release workflow. It validates the
workspace and tests the exact packed archives, including a clean Lean build,
before publishing them.

Do not add `registry-url` or `scope` to `setup-node` for this public-only
workflow. Its v4 authentication setup writes a token-based `.npmrc` and a
dummy `NODE_AUTH_TOKEN`. The publish step uses an empty user configuration
and no token instead; verbose npm logging reports OIDC token-exchange errors
that npm otherwise hides behind a fallback authentication failure. Successful
provenance signing alone does not establish authorization to publish to npm.

If publication fails before the first package is accepted, verify the trusted
publisher's exact owner, repository, workflow filename and optional environment,
and ensure direct `npm publish` is allowed. Retry by manually running the fixed
workflow on `main` with `publish` enabled, retaining the same package version.
Re-running an older failed run uses the old workflow, so it does not apply a
workflow fix committed later. Do not move an existing release tag.

After reviewing and committing the version changes, push that commit and its
matching tag, for example for a prepared `0.1.1` release:

```sh
git push origin HEAD
git tag simulator-v0.1.1
git push origin simulator-v0.1.1
```

A release tag must match every package version. Existing npm versions cannot
be replaced; prepare a new version for a changed release. Regenerate archives
after a version change; publication rejects stale archives.
