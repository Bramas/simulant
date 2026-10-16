# @bramas/simulant-core

Shared project interfaces and configuration-graph traversal for Simulant.
These contracts connect the simulator interface, project adapters, graph
workers and CLI. Simulation semantics and exploration are implemented in
`@bramas/simulant-engine`.

## Use in a project

```sh
npm install @bramas/simulant-core
```

```ts
import type { ProjectType } from '@bramas/simulant-core/types/project';
import type { EditorSchema } from '@bramas/simulant-core/types/editor-schema';
```

`ProjectType` describes project setup, the execution tree, rendering, settings,
verdicts and optional checks. `EditorSchema` describes the settings form.
Most `.sim` projects obtain their implementation through `simProject` from
`@bramas/simulant-ui/sim/project` rather than implementing the interface manually.

`@bramas/simulant-core/lib/config-graph` provides bounded configuration-graph
traversal for the UI and its worker. The package has no root import; use the
`types/*` and `lib/*` subpaths.

For a complete standalone project:

```sh
npm create @bramas/simulant@latest my-project
```

[Architecture](https://github.com/Bramas/simulant/blob/main/docs/architecture.md)
· [Starter project](https://github.com/Bramas/simulant/tree/main/projects/starter)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/core)

Licensed under CeCILL-B; see `LICENCE.txt`.
