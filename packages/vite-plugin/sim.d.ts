/** `import * as m from './file.sim'` (compiled by the Vite plugin, or the Node hooks). */
declare module '*.sim' {
  import type { SimModule } from '@bramas/simulant-vite-plugin/module';
  export const experiments: SimModule['experiments'];
  export const failed: SimModule['failed'];
  export const diagnostics: SimModule['diagnostics'];
  export const sources: SimModule['sources'];
  export const lean: NonNullable<SimModule['lean']>;
  export const revision: SimModule['revision'];
  export const subscribe: NonNullable<SimModule['subscribe']>;
}
