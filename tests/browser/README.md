# Browser acceptance

Run `pnpm test:browser` to exercise the simulator in headless Chromium with
Playwright. This suite is separate from `pnpm test` and starts and closes its
own Vite servers. Source-edit checks run against a temporary copy of the public
starter project; the original model and renderer are preserved.

The suite uses a locally installed `playwright` or `playwright-core` Node
package, or the Node API bundled with Python's `playwright` installation.
To use a different installation, set `SIMULANT_PLAYWRIGHT_MODULE` to its module
name or absolute package directory. The matching Chromium browser must already
be installed. In the Codex sandbox used for this repository, launching Chromium
and binding localhost require running this command outside the sandbox.

Assertions cover rendering, forward/back navigation, presets, advisory initial-settings
domain warnings (including edits and shared links), agent selection,
branch selection, panel docking, the step explanation card, configuration-graph workers, semantic source updates,
line-only updates, renderer updates, pausing navigation on invalid source,
and diagnostics/recovery after both invalid saves and first-load errors.
Hot updates must keep the same browser document.

Run the stand-up project regressions with:

```bash
node --import tsx --test --test-name-pattern='stand-up (visibility|main)' tests/browser/ui.test.ts
```

They check minimum-radius and initial-gap warnings, attribution to φ, stepping outside the declared bounds, correction of the settings, and console-free inline validation errors. The algorithm checks open named rule guards from `main` and verify that the chosen move or stay statement is highlighted in each of the three algorithms.
