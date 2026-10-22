# Architecture

Simulant defines an experiment once in `.sim` and uses its typed IR for interactive simulation, command-line exploration and Lean generation. The [language reference](sim-language.md) describes accepted syntax; the [IR reference](ir.md) specifies runtime semantics. [Development](development.md) covers verification and known issues.

## Data flow

```text
.sim sources and imports
        │
   parse, elaborate, lower, typecheck
        │
        ▼
   typed IR ───────────────────────► Lean generator
        │                              │
   interpreter ◄── explorer        generated models + hand-written proofs
        │             │
   snapshots       verdicts, witnesses, counterexamples
        │             │
        └──── UI and CLI
```

The frontend records source locations and the import graph. Structured procedures are inlined into a state machine; the program counter and locals retained across activations become explicit private memory. Resume-point names depend on program order rather than source line numbers. Source text, line tables and expression locations are display metadata and do not affect state equality or Lean semantics.

The IR is versioned JSON. A semantic change updates its types and documentation, conformance fixtures, interpreter and Lean generator together. The standard library used by projects is authored in `.sim`. Its [hand-written TypeScript builder counterparts](../packages/stdlib/README.md) construct IR independently for conformance, engine and typechecker tests; they are not generated from `.sim`.

## Packages

| Location | Responsibility |
| --- | --- |
| `packages/lang/` | Parsing, imports, elaboration, lowering, typechecking and IR |
| `packages/language-service/` | Editor features over the frontend and a portable source host |
| `packages/language-server/` | Node source access and LSP transport |
| `extensions/vscode-simulant/` | VS Code client, highlighting, snippets and extension packaging |
| `packages/engine/` | Values, topologies, rounds, successor enumeration, exploration and symmetry reduction |
| `packages/stdlib/sim/` | Sensors, components, model families, tasks and examples |
| `packages/stdlib/test/helpers/` | Hand-written builder counterparts for conformance, engine and typechecker tests |
| `packages/lean-gen/` | Model generation, proof checks and differential tests |
| `packages/vite-plugin/` | `.sim` imports, source watching, diagnostics and snapshot types under Vite and Node |
| `packages/core/` | Shared project types and configuration-graph worker traversal |
| `packages/simulator-ui/` | Execution adapter, snapshots, renderers and SolidJS interface |
| `packages/cli/` | Discovery, checks, graph export, watch mode and Lean generation |
| `packages/create-simulant/` | Dependency-free initializer and a standalone project template |
| `lean/Simulant/` | Lean semantic core, generated component library and hand-written lemmas |
| `apps/preview/` | Minimal development viewer for a `.sim` entry |
| `apps/public-site/` | Public website: landing page, `.sim` guide, standard-library reference and model builder |

Engine behavior belongs in `packages/engine/`; `packages/core/` is shared infrastructure for projects, the UI and the CLI.

## Models and execution

A model specifies a space, an observation, frames, sensors, internal memory, round and components (the design is [core-redesign.md](core-redesign.md)). The space is a graph (or, as an interface for now, a Euclidean space): positions with ordered neighbor lists, which are their ports. Cycles, lines and stars are library spaces written in `.sim`. An agent observes the r-hop view around its position as opaque locations, ordered by a reference ordering and a morphism of its frames (`Frames.isomorphisms`, `Frames.identity`, `Frames.portPermutations`), and learns about each location only through the sensors its algorithm uses. An algorithm never sees positions or parameters: it reads its locations, their neighbors and distances, and its sensors, and moves to a location. A task assigns configuration verdicts and a temporal goal, and reads an agent's answer in the agent's own terms (`C.resolve`, `C.follow`). An experiment binds these definitions to parameter domains, initial conditions and exploration limits. Knowing the space's size is a sensor capability (`spaceSize`), distinct from choosing it as an experiment parameter.

An oblivious model permits no private program counter or local values retained across activations. Persistent storage supplied by components is a separate model capability: sensors expose it and actions update it. Model families compose the same components with different parameters, sensors and frames, so adding crashes or changing the topology reuses the existing black-hole component.

Components own their world fields, agent fields, flags and actions. At each hook point, all components read the same snapshot. Their owned field updates are disjoint, and raised flags merge by logical OR. Hooks cannot write another component's fields or move agents. Flags are never cleared; their visibility and behavior determine `present`, `correct` and whether an agent acts.

The standard round chooses the space state, runs `beforeLook`, chooses activations and morphisms, evaluates sensors and algorithm decisions, runs `beforeMove`, applies movement along edges, and runs `afterMove`. Each activated agent uses one morphism and one sensor environment (one outcome of the sensors' Look-level choices) throughout that activation. Actions such as pebble operations are decisions consumed by component hooks; simultaneous pebble picks are truncated to the pebbles present.

Graph spaces, views, presentations and rounds (`fsync`, `ssync`, `sequential`) are implemented in the semantic core (`packages/engine/src/space.ts`, `system.ts`). In a dynamic space (`Graphs.Dynamic base k`), the missing edges are chosen anew each round and forgotten afterwards. The interpreter's reference ordering is the physical order of the vertices; it can leak information on views without symmetry, which the model view and the CLI's check output say for models under `Frames.isomorphisms`, while Lean quantifies over every lawful ordering. Successors with equal full configurations merge, retaining the first witness and, under SSYNC or sequential scheduling, the union of possible activations for fairness analysis. History-dependent tasks store history in monitor components such as `Monitors.Visited`.

Nondeterministic arguments are evaluated left to right, including both operands of logical expressions. Algorithms cannot introduce adversary choices. Agent references and locations are local to a round and cannot be stored. The current `acts adversary` behavior chooses a move while leaving the agent's public state and memory unchanged.

## State graphs and goals

State keys include positions, flags, component fields, public state, private memory and monitor state. Values are immutable JavaScript data with type-directed canonical string encodings. FSYNC stores anonymous agents sorted; SSYNC and sequential rounds preserve indices because fairness depends on identity.

The explorer builds a breadth-first state graph. Reachable failures yield shortest counterexamples. Liveness is decided using strongly connected components and repeatable cycles, with concrete replayable paths and lasso witnesses. A reached depth or state limit produces `incomplete` unless a counterexample has already been established.

FSYNC considers every permitted execution, with no fairness assumption forcing a black hole to appear or an absent edge to return. A sequential round activates exactly one eligible agent (or idles if none is eligible), while SSYNC permits a nonempty subset. SSYNC and sequential rounds admit executions in which every agent that continues to act is activated infinitely often; the exhaustive explorer excludes starvation cycles. See the [known smoke-check issue](development.md#known-issues) for the first-branch command.

`IdentifyEmergingBlackHole` counts an inactive hole as `success`. With `eventually always .success`, an execution where the hole never activates succeeds; once it activates, identification must eventually persist. The UI displays a configuration's raw task verdict, while an exhaustive check decides the goal over executions.

`check-all` shares graphs among settings with the same instantiated model: the values of the space's parameters and of the observation radius. This is sound because the other parameters only affect initialization (and the components' initial world), and algorithms cannot read parameters, as enforced by the checker. Initial configurations equal up to symmetry merge. `--per-setting` trades additional exploration time for lower peak memory. A `--max-configs`
limit stops parameter enumeration at the requested prefix. Batch grouping appends settings in
place; initial-state and successor deduplication use maps while preserving enumeration order.

Symmetries are derived from the space's automorphisms that the frames keep (all of them under `Frames.isomorphisms`, those preserving the ports under port-based frames) and from equivariance declarations on components and tasks; sensors that read only the Look are equivariant by construction. Automorphisms transform position-valued state and kept port permutations. Custom declarations remain claims: bounded equivariance tests and reduced-versus-unreduced comparisons provide evidence, and a general proof requires appropriate Lean lemmas. `symmetries := none` disables reduction.

## Public website

`apps/public-site/` is a multi-page Vite build into `dist/`, next to the public projects' pages: the landing page, a guide to writing models and algorithms (`guide/`), the standard-library reference (`library/`) and a model builder (`builder/`). The reference and the builder are derived from `packages/stdlib/sim/*.sim`, bundled as text and parsed in the browser by the language's own parser, so they cannot drift from the library: signatures, doc comments, attributes, owned fields, flags, actions, hooks and goals come from the sources. Dependencies are inferred from the syntax (`src/stdlib.ts`): the parameters a component's initializers read with `param`, the components owning the world and agent fields a sensor or task reads, and the agent attributes a task reads (`pub.bh`, outputs such as `claim`). The builder writes a `.sim` file from a model family's own signature and compiles it in the browser with the real frontend; a first compilation, with an algorithm that uses no sensor, tells which sensors the model provides. Only the model-level built-ins (observations, rounds, frames, automorphisms) and the types of task outputs are listed by hand.

The builder also takes the user's own code. A text area holds custom sensors, components, tasks and definitions; the builder inserts it after the imports and reads it with the same `readLibrary` as the standard library (`withCustom` in `src/builder.ts`), so custom components join the component picker, custom sensors the view selector and custom tasks the task list, with the same inferred parameters and requirements. While that text does not parse, the page keeps the last catalog that did, so a half-typed declaration does not empty the pickers. A second text area holds the algorithm's procedures and `main`, initially a skeleton that lists the model's sensors and actions; the builder still writes `Pub`, `output` and `init` from the task's outputs unless that text defines them. The page compiles the whole file after every edit (two compilations take a few milliseconds, so there is no debounce). The generated file records where each text area's lines went (`Region`), so a diagnostic shows its line in the file and its line in the text area, and the file view marks the user's lines and the failing ones. An unclosed bracket in the custom text is only noticed at the generated code after it; the custom text is then parsed alone to point at its own line. The whole draft, custom text included, is the JSON of the `#draft=` hash, so a link restores it; custom code makes such links long, which is accepted for a page whose state must stay shareable without a server.

## Projects and source updates

Projects register an imported `.sim` experiment with `simProject`, which supplies the settings form, execution adapter, checks, source viewer, state inspector and model view. The default renderer follows the space (`renderers/space.ts`): cycles are drawn as rings (dynamic cycles too: a round's missing edges are named by its step label), the infinite line as a window around the agents and the positions the settings and the world name, and other finite graphs on a circle, a vertex adjacent to all others (a star's center) in the middle. Projects can supply drawing functions with agent hit positions; the shared marks (agents, black hole, pebbles) are in `renderers/marks.ts`. The `aliases` option normalizes older parameter names for the UI, CLI, saved settings and shared links.

The simulator warns when initial settings fall outside the experiment's declared parameter domains, including dependent domains evaluated with the current parameter values. A parameter declares an exact finite domain with `in`, a `where` predicate, or both as an intersection. Predicate-only domains express general assumptions without finite sample lists. The interpreter and Lean statements enforce both restrictions when present. Simulator starting values are separate: a bounded search tries matching values, then uses editable typed fallbacks. `simProject` accepts `defaults` overrides in `project.ts`. Its optional `checkSettings` iterable supplies finite checks for domains that cannot be enumerated; those settings are filtered through the model domains and do not affect their meaning or the starting values. The model view identifies checks supplied by the project. The engine checks membership directly rather than enumerating the Cartesian product of settings. Parameters without domains impose no membership restriction. These warnings are advisory: execution and graph exploration stay available so readers can investigate other settings, while the warning makes clear that those runs lie outside the declared domains. Defaults, edits, presets, shared links and semantic source updates all use the same check. Warnings and setup errors appear directly below the settings fields so they stay near the user's edits; a setup error takes precedence over advisory warnings to avoid repeating the same problem. Setup failures are shown inline without logging console errors, since editing incomplete or structurally invalid settings is a normal part of using the form.

The simulator page (`SimulatorApp`) is a desktop-style application that fills the window: panels scroll, the page does not. The top bar picks the project and the view: Simulation, Graph or Model, kept in the URL's hash. In the simulation, the transport (navigation, playback, the verdict, the adversary's branches, and the path as one stop per round marked with its verdict) sits above a workbench whose center always shows the current configuration. A step past the end of the path takes the first branch, or a random one when the transport's dice is pressed (remembered); steps already on the path keep their choices. Around it, an activity bar shows or hides the panels (settings, saved settings, algorithm, state). Each panel is docked in the left side bar, the right side bar, or below the configuration. Dragging its title bar onto a drop zone, or its "Move to" menu, places it elsewhere. Algorithms are usually long, so by default the algorithm has the right side bar to itself and the state sits below the configuration, where a wide panel lays out the world, the agents and the parameters side by side. Splitters resize the docks and the panels sharing one. The panels shown, their docks and their sizes are remembered in the browser, and the activity bar restores the default layout. The configuration stays in view while the settings are edited.

Clicking an agent's cursor in the algorithm explains its last step in a card anchored under that cursor: its Look (each visible location in the Look's order, written `ℓ0`, `ℓ1`, … as in the call traces, with the position behind it, its neighbors and the per-location sensors' values there), the other sensors it read, then the definitions it called. The positions are shown for the reader: the algorithm sees only the locations, their order and the sensors. The card covers the code below it instead of pushing it down, so lines keep their place, and it follows the agent's line while stepping. The algorithm view identifies agents by name, because an agent's index is its place in the configuration and can change between steps. The click also selects the agent on the stage and in the state. The graph view puts the configuration graph in the center, filling it, beside the same settings, since the graph follows them. It stays mounted once opened, so switching views keeps a generated graph. Its selected node shows its drawing in a card, and opening a node returns to the simulation at that path. Below 900 px the shell becomes a scrolling column with the configuration first.

The interface's styles are self-contained: `simulator.css` defines the design tokens of both themes, the base controls and the layout, and each component keeps its own stylesheet that uses those tokens. The page no longer depends on a CSS framework. Pico's element-level defaults had to be overridden in nearly every component, and its button and field styles fought the denser controls of the workbench. `pico.min.css` remains as an empty stylesheet so that existing pages that import it keep building.

Drawings follow the theme. The page passes `options.theme` (background, foreground, muted, line, accent and danger colors, read from the tokens) to `drawConfig`, to the branch thumbnails and to the configuration graph. The default renderers use it, and custom renderers should draw text and marks with it rather than fixed dark colors, which disappear on the dark stage. The stage centers the drawing in its panel and derives its radius (the ring's, or the half-width of a line) from the panel size. Hit tests for clicks and hover tooltips use the same placement, and the page draws the selected agent's halo over the renderer's output.

The model view lets a reader compare an experiment with its paper without reading the toolchain. Its facts are derived from the same compiled IR the simulator, explorer and Lean generator use, not from separate prose, so they cannot drift from what is checked; the declarations beside them are shown as written. The frontend records which declarations an experiment uses (`Experiment.source`), because only elaboration knows which model definitions, components and sensors a model expression reached. Like the algorithm's line table, these locations are display metadata: a line-only edit redraws both views without restarting the execution.

The model view can also show the generated Lean model beside the same sources. The Vite plugin (or the Node hooks) generates it when compiling a `.sim` file, with the generator `simulant lean` uses, so the page shows the file the CLI writes; only the module name differs until the page renames it after the simulation. Generation runs in Node because the library components are elaborated from the standard library on disk. Package exports resolve the compiler and generator; the standard library is located through its installed package, so this also works outside the workspace. Each region of the file carries the part of the experiment it translates (`generateMappedModel`), and each case of the lowered step its program counter, which the line table maps to the statement it resumes after. An experiment the generator refuses (a native algorithm, a definition with choices...) shows the generator's reason instead.

The [VS Code extension](../extensions/vscode-simulant/README.md) uses a language server for diagnostics and editing features. The shared service compiles the same frontend IR and indexes AST declarations/scopes for navigation. Unsaved source overlays cover transitive imports. Its source host and LSP-shaped results are independent of Node and VS Code; a browser bundle allows a future editor adapter to reuse the service without running the simulator. Syntax coloring uses a separate TextMate grammar.

The [stand-up gathering project](../projects/standup-gathering/README.md) runs on the infinite line (`Graphs.Line`) with radius-φ views under `Frames.isomorphisms`, the per-location `occupied` or `colors` sensor, `Faults.CrashAt` and, for its luminous variant, `Storage.Lights 2`. The rules read the view through `Line.window`, the locations from one end of the window to the other, so they need no coordinates. The library light component supports any fixed positive palette size; `none` keeps a light and `some c` requests a color in the palette; the light is an agent field. The project's `paperView` translates the color sets of its two colors to X/Y/Z. Initial-domain assumptions stay in the paper project. Its visibility domain and warning messages share the compiled `requiredVisibility` definition. Visibility bounds belong to φ, while the coordinate domain describes population and parity, so insufficient visibility is attributed to φ. The guards remain evaluable below the declared visibility bounds (down to φ = 0), allowing advisory warnings without setup or indexing errors.

The [starter](../projects/starter/README.md) shows the project layout. Sources, renderers and hand-written proofs belong to the researcher's repository. `projects/private/` is an optional separate Git repository; its code and fixtures stay private. The public build lists its published projects explicitly.

Vite watches every source dependency, including missing imports. The CLI supports Node and Bun. Node uses `tsx` and module hooks; Bun uses native TypeScript
loading and a runtime plugin for `.sim` files. Both loaders use the same compiler, generated
modules and polling watcher. Node also supplies workspace-package fallbacks for uninstalled
dependencies; Bun uses native package resolution. Under either runtime, watch mode
polls files to work reliably on the WSL drive. A semantic edit replaces the experiment and restarts its execution, adjusting compatible settings. A drawing or line-only edit redraws while preserving the execution. Invalid sources retain the last good view with diagnostics and pause navigation. The line-only explanation regression is tracked in [development](development.md#known-issues).

Compiled modules and check results carry source revisions. Superseded checks are cancelled; graph workers reject requests for another revision. `simulant lean` writes `Generated/` and revision metadata, preserves `Proofs/` and existing project build configuration, and requires proofs to be checked again after model changes. It infers a simulation only when the selected project source registers exactly one; otherwise `-p <name>` selects the simulation explicitly, so workspace-wide discovery cannot silently choose a model.

## Lean guarantees and limits

The hand-written Lean core defines nondeterminism, graph spaces and their views, rounds, executions, fairness and goals. Nondeterminism is a list of witness/value pairs; `Step` is membership in the computable round. There is no separate set semantics to reconcile with evaluation.

Library components and model files are generated from the same IR used by the interpreter. Components are generic over the composition: lenses expose their owned state, and classes expose their flags and actions. A composed model supplies the instances and preservation lemmas. Hand-written library lemmas live separately from generated files.

Generated models define `Statement` (correctness over admissible executions and parameter domains) and `NonVacuity` (an initial configuration, successors for reachable configurations and an admissible execution). Building a model does not prove these statements. Existing examples prove non-vacuity and selected invariants, including a lowered black-hole algorithm invariant and rotation equivariance for a cautious-pair composition. Under `Frames.isomorphisms`, the statements quantify over every reference ordering that satisfies its law, so a proof cannot rely on the interpreter's physical ordering.

Proof files may introduce auxiliary definitions, but the proof checks prohibit axioms, `sorry`, `admit`, `native_decide`, `opaque`, implementation overrides and new syntax. For selected claims, `checkProofs` checks the generated statement's type and inspects axioms, allowing only `propext`, `Classical.choice` and `Quot.sound`. CLI `lean --build` scans proof files and runs Lake; it does not automatically select and audit a main correctness theorem.

The TypeScript interpreter and frontend are not verified. Conformance fixtures and bounded differential tests compare successor sets and replay interpreter witnesses in Lean. They support correspondence for tested instances and the translated subset.

Current translation limits include native algorithms, port permutations among the symmetries of generated spaces, subsets of non-agent multisets and multiset equality. Lean represents multisets as lists; order can matter when evaluating a lasso with multiset world state. The lossy-view conformance experiment is explicitly refused. Definitions containing choices are not yet generated. The generic equivariance lemmas cover port-based frames with sensors that read who is at a location; isomorphism frames (which need the law of the reference ordering), conjugated component effects and dynamic space states remain to be generalized.

Extensions should preserve existing definitions and state their relationship to established models through lemmas. Additional topologies, rounds or IR forms require coordinated interpreter, generator, conformance and documentation changes. Alternative interpreter implementations can use the same IR contract if profiling justifies them.

## npm distribution

Runtime packages publish explicit ESM exports and dependencies; cross-package
imports use those exports rather than workspace-relative paths.
`scripts/build-packages.mjs` compiles TypeScript into each package's ignored
`dist/`, adds JavaScript extensions to relative imports and retains Solid JSX
for the consuming Vite Solid plugin. Type exports retain the original source
for editor tooling. The UI's `solid` export condition keeps that JSX out of
Vite's ordinary dependency optimizer. Root installation builds the runtime
packages; rebuild them after source changes with `pnpm packages:build`.

The `.sim` library is the data-only `@bramas/simulant-stdlib` package; its
hand-written TypeScript test helpers remain in the workspace. The Lean
semantic library is the `@bramas/simulant-lean` package in `lean/`. Both resolve
through package metadata, so generated models can use the installed Lean
package without a repository checkout or a precompiled cache. Lake's module
globs explicitly include `Simulant` itself as well as its submodules. Generated
lakefiles compute relative paths from the physical output directory, including
when the caller's temporary directory is reached through a symbolic link.

The initializer copies a minimal standalone template and pins simulator
dependencies to its release version. It does not install dependencies, create
a Git repository or overwrite nonempty directories. The explicit ordered
package list in `scripts/build-packages.mjs` controls packing and publication;
private projects and development-only language-server packages are excluded.
Archives include source licenses, runtime files and required data, with SHA-256
hashes in `release.json`. Publication consumes those exact archives after
validating the complete list and hashes. CI uses `--skip-published` to resume
partial releases: public registry metadata identifies exact versions already
published, which are left untouched; only missing versions are published in
dependency order. Registry checks complete before publication, and errors other
than a missing-version response abort the operation. Package READMEs are shipped
in every public archive and checked during independent installation tests.
The same explicit package list drives
`pnpm release:version`, which prepares a shared stable version and template
dependencies, preserving workspace links and rolling manifests back if the
lockfile update fails. GitHub publication uses npm trusted publishing tied to
the release workflow; Git operations remain separate from version preparation.
See [distribution](distribution.md)
for verification and the release procedure.
