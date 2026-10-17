/**
 * Generates the component library (`lean/Simulant/Library/*.lean`) from the
 * standard library's IR:  npx tsx packages/lean-gen/src/library.ts
 */
import { writeFileSync } from 'node:fs';
import { stdlibElaborator } from '@bramas/simulant-lang/elab/node';
import type { Component } from '@bramas/simulant-lang/ir';
import { resolveComponent } from '@bramas/simulant-lang/standalone';
import { generateComponent } from './component';

/**
 * The library's components, from the `.sim` standard library. Their
 * arguments do not matter: parameters stay symbolic.
 */
export const libraryComponents: Component[] = (() => {
  const elab = stdlibElaborator();
  return ['Hazards.BlackHole .mayEmerge', 'Faults.CrashStop 1', 'Faults.CrashAtNode',
    'Vision.Radius', 'Storage.Lights 3', 'Storage.Pebbles',
    'Frames.PersistentReflection', 'Monitors.Visited'].map(e => resolveComponent(elab.evaluate(e) as Component));
})();

export const libraryNamespace = (name: string) => `Simulant.Library.${name}`;

export function generateLibrary(dir: URL) {
  const names: string[] = [];
  for (const c of libraryComponents) {
    writeFileSync(new URL(`Library/${c.name}.lean`, dir), generateComponent(c, libraryNamespace(c.name)));
    names.push(c.name);
  }
  writeFileSync(new URL('Library.lean', dir), names.map(n => `import Simulant.Library.${n}\n`).join(''));
  return names;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(generateLibrary(new URL('../../../lean/Simulant/', import.meta.url)).join('\n'));
}
