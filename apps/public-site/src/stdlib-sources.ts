/** The standard library's `.sim` sources, bundled as text, keyed by their import path. */
import { readLibrary } from './stdlib';

const raw = import.meta.glob('../../../packages/stdlib/sim/*.sim', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every module, for compiling drafts (`std/conformance.sim` included, though nothing imports it). */
export const sources: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, text]) => [`std/${path.split('/').pop()}`, text]),
);

/** Conformance fixtures are test experiments, not library pieces. */
export const isPublicModule = (path: string) => path !== 'std/conformance.sim';

/** The modules the reference documents and the builder offers. */
export const librarySources = Object.fromEntries(Object.entries(sources).filter(([path]) => isPublicModule(path)));

export const library = readLibrary(librarySources);
