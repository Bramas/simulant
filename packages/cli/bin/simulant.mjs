#!/usr/bin/env node

// Each runtime loads TypeScript registries and `.sim` experiments through its own hooks.
if (process.versions.bun) {
  await import('@bramas/simulant-vite-plugin/bun-register');
} else {
  const { register } = await import('tsx/esm/api');
  const { register: registerHooks } = await import('node:module');
  register();
  registerHooks('@bramas/simulant-vite-plugin/node-hooks', import.meta.url);
}
await import('../src/cli.ts');
