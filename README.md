# Mobile Entities

Monorepo for the reusable mobile-entities simulator core, reusable simulator UI, and public research projects.

See [PUBLICATION.md](./PUBLICATION.md) for the versioning strategy used when publishing paper code.

## Layout

```text
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
"@mobile-entities/core": "workspace:*",
"@mobile-entities/simulator-ui": "workspace:*"
```

For a frozen paper artifact, replace those dependencies with published versions, Git tag URLs, or archived source references.

`workspace:*` is only for local development against the current checkout. It does not pin an old local version if `packages/core` is later bumped and changed.

## Setup

```bash
pnpm install
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm cli --help
pnpm convert-algorithms
```

The black-hole-search web page runs on [http://localhost:3000](http://localhost:3000).
