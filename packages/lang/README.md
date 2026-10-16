# @bramas/simulant-lang

Compiler and typed intermediate representation for Simulant, a language for
experiments on mobile entities and distributed algorithms. The compiler parses
`.sim` files, resolves imports, elaborates models and algorithms, lowers
structured procedures, and checks types and model capabilities.

For a complete project with a simulator and CLI:

```sh
npm create @bramas/simulant@latest my-project
```

## Compiler API

```sh
npm install @bramas/simulant-lang
```

```ts
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { compile } from '@bramas/simulant-lang/elab/elaborate';

const result = compile(loadProgram('src/main.sim'));
console.log(result.diagnostics);
console.log(Object.keys(result.experiments));
```

Each entry in `result.experiments` contains diagnostics and, when compilation
succeeds, an `experiment`. `loadProgram` reads sources from disk and resolves
`std/*.sim` imports from the installed standard library. For custom source
storage, construct a `Program` with a source host instead.

Types are exported from `@bramas/simulant-lang/ir`; the independent TypeScript
IR builder is available at `@bramas/simulant-lang/builder`. This package uses
subpath exports; it has no root import. Execution and exploration belong to
`@bramas/simulant-engine`.

[Language reference](https://github.com/Bramas/simulant/blob/main/docs/sim-language.md)
· [IR contract](https://github.com/Bramas/simulant/blob/main/docs/ir.md)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/lang)

Licensed under CeCILL-B; see `LICENCE.txt`.
