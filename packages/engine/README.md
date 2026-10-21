# @bramas/simulant-engine

Interpreter and state-graph explorer for compiled Simulant experiments. The
engine generates initial configurations and successors, evaluates task
verdicts, explores executions, and produces replayable counterexamples.

For most projects, create a simulator project and use `npx simulant check-all`:

```sh
npm create @bramas/simulant@latest my-project
```

## Programmatic checks

```sh
npm install @bramas/simulant-engine @bramas/simulant-lang
```

```ts
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { checkSetting } from '@bramas/simulant-engine/check';

const compiled = compile(loadProgram('src/main.sim'));
const experiment = compiled.experiments.cautiousPair?.experiment;
if (!experiment) throw new Error('Check the compiler diagnostics');

const result = await checkSetting(experiment, { N: 6, site: 2 });
console.log(result.status, result.reason);
```

`System` from `@bramas/simulant-engine/system` provides `initial()`,
`successors(config)`, `verdict(config)`, `decisionsOf(config, agent)` and step
explanations; `space.ts` builds graph spaces, views and their presentations under
the declared frames. `parameterValues` enumerates declared settings;
`parameterDomainViolations` checks domain membership for a concrete setting
without enumerating their Cartesian product. `checkSettings` shares state graphs
among settings with the same instantiated model (the values of the space's
parameters and of the observation radius).

Checks return `success`, `failure`, or `incomplete` when an exploration limit
prevents a conclusion. Successful bounded checks do not prove correctness for
all sizes. SSYNC and sequential exploration account for activation fairness;
FSYNC considers every permitted execution.

This package uses subpath exports; it has no root import.

[Semantics](https://github.com/Bramas/simulant/blob/main/docs/ir.md)
· [Architecture](https://github.com/Bramas/simulant/blob/main/docs/architecture.md)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/engine)

Licensed under CeCILL-B; see `LICENCE.txt`.
