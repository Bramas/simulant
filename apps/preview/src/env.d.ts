/// <reference types="vite/client" />
declare module 'simulant-entry' {
  import type { SimModule } from '@bramas/simulant-vite-plugin/module';
  export const experiments: SimModule['experiments'];
  export const failed: SimModule['failed'];
  export const diagnostics: SimModule['diagnostics'];
  export const sources: SimModule['sources'];
  export const revision: SimModule['revision'];
  export const subscribe: NonNullable<SimModule['subscribe']>;
}
