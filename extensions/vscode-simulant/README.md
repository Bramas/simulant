# Simulant for VS Code

Editor support for Simulant `.sim` models, algorithms, tasks and experiments. Requires VS Code 1.91 or newer.

## Install

From the Simulant repository:

```bash
pnpm install
pnpm editor:package
code --install-extension extensions/vscode-simulant/dist/simulant.vsix
```

Alternatively, use **Extensions: Install from VSIX…** in VS Code and select that file. Open a `.sim` file; its language mode should be **Simulant**. The extension includes its server and standard library, so using the installed extension does not require a Node or pnpm installation in the project.

For development, run `pnpm editor:build` and launch **Simulant extension** from the repository's Run and Debug panel (F5). The launch task builds the extension and opens the starter project in a separate Extension Development Host.

Packaging emits a self-contained VSIX; the build also produces a separate `dist/language-service.mjs` browser bundle. Generated files stay in `dist/`; rebuilding clears that directory.

## Features

- Syntax highlighting for declarations, types, activation statements, constructors, strings, attributes, Unicode operators and nested comments.
- Snippets for imports, definitions, components, algorithms, tasks and experiments; comment toggling, bracket pairing and indentation support.
- Live compiler diagnostics for open files and their imports, including unsaved buffers. Syntax and type errors use the same frontend as the simulator.
- Completion of imported declarations, local names, builtins, enum constructors, typed record members and import paths.
- Hover signatures, definition navigation, references, rename, document and workspace symbols, folding and signature help.

The server automatically uses a library at `packages/stdlib/sim/` or `node_modules/@bramas/simulant-stdlib/sim/` in an opened workspace. Otherwise it uses the bundled library. Override this with the window setting **Simulant: Stdlib Path** (`simulant.stdlibPath`); relative paths use the first workspace folder. Changing it restarts the server. **Simulant: Restart Language Server** also restarts it; `simulant.trace.server` enables protocol tracing in the output channel.

Diagnostics report compiler validation, which elaborates and typechecks experiments and the definitions they use. An unused declaration can therefore have a semantic error that is not reported until an experiment uses it. The language server does not run the simulator or prove Lean theorems.

Navigation is based on parsed declarations and lexical scopes. Incomplete declarations still allow navigation to complete declarations and imports. Hover shows declared signatures rather than full inferred types. Typed record fields are navigable, but field rename is disabled until uses through composed agent/world types can be resolved completely. Experiment parameters are also protected because components can read their names implicitly. Fixed schema keys and the `main` entry point cannot be renamed. An ambiguous unqualified enum constructor has no guessed definition; qualify it to navigate or rename safely. Standard-library declarations are protected from rename.

Project references and rename include unopened `.sim` files under the workspace folders, excluding symlinks and generated/dependency directories. Files outside those folders participate when opened or imported, but unopened dependents outside the workspace are not searched. Rename uses document versions for open files and rejects detected name conflicts.

## Language-service architecture

The extension follows the [VS Code language client/server architecture](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide). Its Node server implements the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) over IPC for VS Code and supports `--stdio` for other clients:

```bash
node extensions/vscode-simulant/dist/server.cjs --stdio
```

`packages/language-service/` contains the shared editor features. It imports the language frontend and LSP data types, with no Node filesystem or VS Code dependency. `packages/language-server/` supplies source storage, workspace discovery and the protocol transport. The build also emits `dist/language-service.mjs`, an ES module bundled for a browser.

A web editor can preload project and standard-library source files into a map and call that same service, directly or in a worker:

```ts
import { LanguageService } from './language-service.mjs';

const stdlib = 'memory:///stdlib/';
const files = new Map<string, string>(); // preload project and library .sim sources
const service = new LanguageService({
  read: uri => files.get(uri),
  resolve: (from, spec) => spec.startsWith('std/')
    ? new URL(spec.slice(4), stdlib).href
    : new URL(spec, from).href,
  files: () => files.keys(),
}, stdlib);

service.setDocument('memory:///project/main.sim', editorText, documentVersion);
const analysis = service.analyze('memory:///project/main.sim');
const suggestions = service.completion('memory:///project/main.sim', position);
// analysis.experiments contains successfully compiled IR for a future simulator adapter.
```

Positions and returned ranges follow LSP's zero-based UTF-16 convention. An editor adapter converts them to its own marker and completion formats. Updating or closing an open buffer invalidates dependency analyses; after changing preloaded files, call `service.invalidate()`. This provides the analysis layer for a future web editor; the current simulator does not yet embed an editor.

## Verification

`pnpm test` includes language-service tests, the real TextMate grammar engine, a bundled stdio server exercised through LSP, and a browser bundle with virtual sources. `pnpm typecheck` covers the service, server and VS Code client. `pnpm editor:package` builds a self-contained VSIX. `test/host.cjs` is an optional Extension Development Host smoke-test runner for activation, completion, navigation, rename and live diagnostics.
