/**
 * Hot-swappable renderers (plan, Section 6.7, drawing-only edits):
 *
 *   export const draw = defineRenderer('algo1', (ctx, snapshot, model, options) => { ... });
 *
 * The returned function is the same across hot updates of the module and
 * calls the newest definition; saving the file redraws the current
 * configuration without restarting the execution. Under Vite, the Simulant
 * plugin makes modules that call `defineRenderer` accept their own updates,
 * so a renderer module should export only renderers.
 */
import type { Snapshot } from '../sim/snapshot';
import type { DrawFunction, Layout, ModelInfo, RenderOptions } from '../sim/types';

export type Renderer = DrawFunction & {
  readonly rendererName: string;
  /** Calls `listener` after each redefinition. */
  subscribe(listener: () => void): () => void;
};

type Entry = { draw: DrawFunction; renderer: Renderer; listeners: Set<() => void> };

const registry: Map<string, Entry> = ((globalThis as any).__simulantRenderers ??= new Map());

/** `S`: the experiment's snapshot type, from `.simulant/types/<experiment>.d.ts`. */
export function defineRenderer<S = Snapshot>(
  name: string,
  typedDraw: (ctx: CanvasRenderingContext2D, snapshot: S, model: ModelInfo, options: RenderOptions) => Layout | void,
): Renderer {
  const draw = typedDraw as unknown as DrawFunction;
  const old = registry.get(name);
  if (old) {
    old.draw = draw;
    for (const listener of old.listeners) listener();
    return old.renderer;
  }
  const listeners = new Set<() => void>();
  const entry: Entry = {
    draw, listeners,
    renderer: Object.assign((...args: Parameters<DrawFunction>) => entry.draw(...args), {
      rendererName: name,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    }),
  };
  registry.set(name, entry);
  return entry.renderer;
}

export function isRenderer(f: unknown): f is Renderer {
  return typeof f === 'function' && typeof (f as Renderer).subscribe === 'function' && typeof (f as Renderer).rendererName === 'string';
}
