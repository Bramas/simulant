#!/usr/bin/env node

// Load the CLI and consumers' TypeScript registries without a global tsx installation.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
