# Publication Strategy

This repository is intended to expose the reusable simulator core and the public research projects that can be shared with papers.

## Repository Layout

- `packages/core` contains the reusable simulator core: execution engine, non-determinism helpers, reusable models, and shared types.
- `packages/simulator-ui` contains reusable Solid components for the simulator interface.
- `projects` contains project-specific packages.
- `projects/black-hole-search` is one package for the black-hole-search paper: algorithms plus its web page.
- `projects/black-hole-search/web` contains the web page source for that paper.

Private or unpublished research projects should live in separate private repositories, or remain outside this repository, and depend on tagged versions of `@bramas/simulant-core` and `@bramas/simulant-ui`. Local-only folders such as `projects/private/` and `private-projects/` are ignored by Git.

My recommendation is:

- Keep this repository public and focused on the reusable simulator plus already-public paper artifacts.
- Keep active unpublished papers in private repositories.
- In private repositories, depend on released simulator packages when stability matters, or on a Git branch/tag while the simulator API is still moving.
- Move a private project into this repository only when the paper/code is ready to be public.

Avoid using a private branch of the public repository for long-lived private research: it is too easy to push or merge the wrong branch, and GitHub Pages/workflows are harder to reason about. A private mirror of the full repository can work, but it tends to drift. A private project repository with package dependencies is usually cleaner.

## Private Project Development

By default, private projects should depend on released package versions:

```json
"@bramas/simulant-core": "0.1.0",
"@bramas/simulant-ui": "0.1.0"
```

That is the reproducible mode. It is the right choice once a paper artifact must keep working against a known simulator version.

During active development, a private project can link to a local simulator checkout:

```json
"@bramas/simulant-core": "link:../simulant/packages/core",
"@bramas/simulant-ui": "link:../simulant/packages/simulator-ui"
```

This keeps one local source of truth for simulator edits without publishing temporary versions. After changing the dependencies, run `pnpm install` in the private project. If the project uses Vite, restart the dev server if dependency changes are not picked up automatically.

For two private projects that need different simulator changes at the same time, use two local clones:

```text
simulant-paper-a/      simulator checkout for paper A
simulant-paper-b/      simulator checkout for paper B
private-paper-a/       links to ../simulant-paper-a/packages/*
private-paper-b/       links to ../simulant-paper-b/packages/*
```

When a paper becomes public, publish or tag the simulator version it uses, replace `link:` dependencies with exact versions, move the project under `projects/`, and add it to `apps/public-site/src/public-projects.mjs`.

## Versioning Policy

When a paper relies on this simulator, create a Git tag for the exact state used by the paper:

```bash
git tag paper-black-hole-search-v1
git push origin paper-black-hole-search-v1
```

Use semantic versioning for the simulator core:

- Patch version: bug fixes that do not change behavior intentionally.
- Minor version: new compatible features.
- Major version: breaking changes that may require project updates.

Each public paper project should document the `@bramas/simulant-core` and `@bramas/simulant-ui` versions, tags, or commits that were used to produce its results and web page. During active development a project can use `"workspace:*"` in its own package manifest; once frozen for a paper, replace that with published versions, Git tag URLs, or archived DOI-backed sources.

Important: `workspace:*` always means "use the local package currently present in this checkout". It cannot keep one project on local `@bramas/simulant-core@0.1.0` while the workspace package has moved to `0.2.0`. To keep an old project buildable after breaking core changes, either:

- checkout the repository tag used by that paper; or
- publish/archive `@bramas/simulant-core@0.1.0` and make the project depend on that exact external version instead of `workspace:*`.

The same rule applies to `@bramas/simulant-ui`.

## Public vs Private Projects

Public paper projects can be grouped in this repository when they are meant to be shared together. Projects that are not yet published, contain private data, or depend on unstable experiments should stay in private repositories.

Recommended structure for future work:

```text
simulant/        public simulator core and public paper projects
private-project-x/                private repo, depends on released simulator packages
private-project-y/                private repo, can track a simulator branch during active work
article-project-z/                moved public when the paper/code is ready
```
