# Black Hole Search

This package groups all black-hole-search projects and the web page that belong to the same paper.

The application and CLI keep the public project names stable:

- `black-hole-search-algo0`
- `black-hole-search-algo1`
- `black-hole-search-algo2`
- `black-hole-search-algo3`
- `black-hole-search-algo4`
- `black-hole-search-algo5`
- `black-hole-search-algo6`

The paper web page lives in `web/`. This package chooses its simulator interface dependency through `package.json`:

```json
"@mobile-entities/simulator-ui": "workspace:*"
```

Before publishing or archiving the paper code, replace workspace dependencies with exact versions or Git tags, then create a repository tag for the exact simulator version used by the experiments.
