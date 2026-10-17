/**
 * The page's theme, for what is drawn on canvases: renderers receive these colors (read from the
 * stylesheet's tokens) so that drawings follow the light or dark theme.
 */
import { createSignal, onCleanup } from 'solid-js';
import type { RenderTheme } from '@bramas/simulant-core/types/project';

export type { RenderTheme } from '@bramas/simulant-core/types/project';

/** Whether the system prefers dark colors, following its changes. */
export function createSystemDark() {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
  const [dark, setDark] = createSignal(!!query?.matches);
  const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
  query?.addEventListener?.('change', onChange);
  onCleanup(() => query?.removeEventListener?.('change', onChange));
  return dark;
}

/** The drawing colors under `element` (the stylesheet's tokens), for the given theme. */
export function renderTheme(element: Element | undefined, dark: boolean): RenderTheme {
  const css = element ? getComputedStyle(element) : undefined;
  const token = (name: string, light: string, darkValue: string) => css?.getPropertyValue(name).trim() || (dark ? darkValue : light);
  return {
    dark,
    background: token('--sim-stage', '#ffffff', '#121214'),
    foreground: token('--sim-text', '#18181b', '#ececee'),
    muted: token('--sim-stage-muted', '#71717a', '#909098'),
    line: token('--sim-stage-line', '#a1a1aa', '#4c4c53'),
    accent: token('--sim-accent', '#5b62c9', '#8b90ec'),
    danger: token('--sim-failure', '#d1242f', '#f85149'),
  };
}
