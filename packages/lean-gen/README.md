# @bramas/simulant-lean-gen

Translate compiled Simulant experiments to Lean 4. The generator emits the
composed model, algorithm, initial configurations, parameter domains, task and
statements to prove, using the semantic library in `@bramas/simulant-lean`.

## Generate from a project

The CLI manages output files, the Lean toolchain and library dependencies:

```sh
npx simulant lean
npx simulant lean --build
```

Run these commands in a Simulant project. Use `-p <simulation>` when several
simulations are registered. Install elan separately to compile the Lean output.
Generated files live under `lean/Generated/`; hand-written proofs belong in
`lean/Proofs/` and are preserved on regeneration.

## Generator API

```sh
npm install @bramas/simulant-lean-gen @bramas/simulant-lang
```

```ts
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { generateModel } from '@bramas/simulant-lean-gen/model';

const compiled = compile(loadProgram('src/main.sim'));
const experiment = compiled.experiments.cautiousPair?.experiment;
if (!experiment) throw new Error('Check the compiler diagnostics');

const lean = generateModel(experiment, 'Generated.CautiousPair');
console.log(lean);
```

`generateMappedModel` also returns source-region metadata for the simulator's
Lean viewer. Other subpaths expose component translation, library generation,
proof checks and interpreter/Lean differential checks. There is no root import.

Generating or compiling a model does not prove its correctness statement.
The generator supports a documented subset of the IR and rejects unsupported
constructs rather than silently weakening the model.

[Lean guarantees and limits](https://github.com/Bramas/simulant/blob/main/docs/architecture.md#lean-guarantees-and-limits)
· [Source](https://github.com/Bramas/simulant/tree/main/packages/lean-gen)

Licensed under CeCILL-B; see `LICENCE.txt`.
