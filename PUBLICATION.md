# Publication Strategy

This repository is intended to expose the reusable simulator core and the public research projects that can be shared with papers.

## Repository Layout

- `packages/core` contains the reusable simulator core: execution engine, non-determinism helpers, reusable models, and shared types.
- `packages/simulator-ui` contains reusable Solid components for the simulator interface.
- `projects` contains project-specific packages.
- `projects/black-hole-search` is one package for the black-hole-search paper: algorithms plus its web page.
- `projects/black-hole-search/web` contains the web page source for that paper.

Private or unpublished research projects should live in separate private repositories, or remain outside this repository, and depend on tagged versions of `@mobile-entities/core` and `@mobile-entities/simulator-ui`. Local-only folders such as `projects/private/` and `private-projects/` are ignored by Git.

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

Each public paper project should document the `@mobile-entities/core` and `@mobile-entities/simulator-ui` versions, tags, or commits that were used to produce its results and web page. During active development a project can use `"workspace:*"` in its own package manifest; once frozen for a paper, replace that with published versions, Git tag URLs, or archived DOI-backed sources.

Important: `workspace:*` always means "use the local package currently present in this checkout". It cannot keep one project on local `@mobile-entities/core@0.1.0` while the workspace package has moved to `0.2.0`. To keep an old project buildable after breaking core changes, either:

- checkout the repository tag used by that paper; or
- publish/archive `@mobile-entities/core@0.1.0` and make the project depend on that exact external version instead of `workspace:*`.

The same rule applies to `@mobile-entities/simulator-ui`.

## Public vs Private Projects

Public paper projects can be grouped in this repository when they are meant to be shared together. Projects that are not yet published, contain private data, or depend on unstable experiments should stay in private repositories.

Recommended structure for future work:

```text
mobile-entities-simulator/        public simulator core and public paper projects
private-project-x/                private, depends on a simulator tag or branch
article-project-y/                public if it belongs to another paper/release
```
