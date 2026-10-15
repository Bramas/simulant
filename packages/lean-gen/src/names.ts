/** Lean names of generated files, shared by the CLI and the page (no Node imports). */

/** `black-hole-search-algo1-new` → `BlackHoleSearchAlgo1New`. */
export const leanModuleName = (simulation: string) =>
  simulation.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
