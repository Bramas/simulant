/**
 * Lets Node.js import `.sim` files:  node --import tsx --import ./packages/vite-plugin/src/register.ts ...
 * (after tsx, whose hooks load the TypeScript of the compiler).
 */
import { register } from 'node:module';

register('./node-hooks.ts', import.meta.url);
