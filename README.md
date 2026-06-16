# Simulant

Monorepo for the reusable simulant simulator core, reusable simulator UI, and public research projects.

See [PUBLICATION.md](./PUBLICATION.md) for the versioning strategy used when publishing paper code.

## Layout

```text
apps/public-site/        public landing page and documentation site
packages/core/           reusable simulator core package
packages/simulator-ui/   reusable simulator interface components
projects/                project and paper packages
projects/black-hole-search/
                          one package for the black-hole-search paper
projects/black-hole-search/web/
                          web page for the black-hole-search paper
```

Each project has its own `package.json`; a project can also keep its generated page in a `web/` subfolder. During active development it can depend on local workspace packages with:

```json
"@bramas/simulant-core": "workspace:*",
"@bramas/simulant-ui": "workspace:*"
```

For a frozen paper artifact, replace those dependencies with published versions, Git tag URLs, or archived source references.

`workspace:*` is only for local development against the current checkout. It does not pin an old local version if `packages/core` is later bumped and changed.

## Working From Private Projects

For private paper projects, use the latest published simulator packages by default:

```json
"@bramas/simulant-core": "0.1.0",
"@bramas/simulant-ui": "0.1.0"
```

Because the packages are published on GitHub Packages, private projects also need an `.npmrc` entry:

```ini
@bramas:registry=https://npm.pkg.github.com
```

For CI or private machines that need authentication to install from GitHub Packages, add a token with `read:packages`:

```ini
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

When you want to develop a private project and the simulator at the same time, do not publish a temporary package version. Point the private project to your local checkout instead:

```json
"@bramas/simulant-core": "link:../simulant/packages/core",
"@bramas/simulant-ui": "link:../simulant/packages/simulator-ui"
```

Then run `pnpm install` in the private project. Changes made in the local `simulant` checkout are immediately used by that private project. When the paper is ready to freeze, switch those `link:` dependencies back to exact published versions.

If two private projects need two different simulator states at the same time, use two local simulator clones, for example `simulant-paper-a/` and `simulant-paper-b/`, and link each private project to the clone it needs.

## Setup

```bash
pnpm install
```

## Scripts

```bash
pnpm dev      # run the black-hole-search simulator page locally
pnpm build    # generate the full public static site in dist/
```

The black-hole-search web page runs on [http://localhost:3000](http://localhost:3000).

## Public Site

The public site source lives in `apps/public-site/`. It is a small Solid/Vite app that can contain landing-page content, simulator documentation, and links to published project pages.

The root build is orchestrated by `scripts/build-public-site.mjs`. It builds every public project listed in `apps/public-site/src/public-projects.mjs`, then builds the public site into `dist/`:

```text
dist/index.html                    landing page
dist/black-hole-search/            black-hole-search simulator page
```

GitHub Pages deployment is configured in `.github/workflows/pages.yml`. On GitHub, set the repository Pages source to **GitHub Actions**; after that, every push to `main` will build `dist/` and publish it.

## Package Releases

`.github/workflows/release-packages.yml` publishes the two reusable simulator packages to GitHub Packages:

- `@bramas/simulant-core`
- `@bramas/simulant-ui`

It runs manually from GitHub Actions or when pushing a tag matching `simulator-v*`. Before tagging a release, bump the package versions in `packages/core/package.json` and `packages/simulator-ui/package.json`.

After a package release, a paper project can freeze its simulator dependency by replacing workspace dependencies with exact versions:

```json
"@bramas/simulant-core": "0.1.0",
"@bramas/simulant-ui": "0.1.0"
```

For GitHub Packages, the package scope must match the GitHub owner or organization. Since the repository is `github.com/bramas/simulant`, the published package names use the `@bramas` scope.
