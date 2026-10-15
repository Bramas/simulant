#!/usr/bin/env node

// Each runtime loads TypeScript registries and `.sim` experiments through its own hooks.
if (process.versions.bun) {
  await import('../../vite-plugin/src/bun-register.mjs');
} else {
  const { register } = await import('tsx/esm/api');
  const { register: registerHooks } = await import('node:module');
  register();
  registerHooks('../../vite-plugin/src/node-hooks.ts', import.meta.url);
}
await import('../src/cli.ts');
