/** The interface's icons: inline strokes on a 24-unit grid, in the current text color. */
import type { JSX } from 'solid-js';

const PATHS = {
  first: () => <><path d="M18 19 9 12l9-7z" /><path d="M6 5v14" /></>,
  last: () => <><path d="m6 5 9 7-9 7z" /><path d="M18 5v14" /></>,
  previous: () => <path d="m15 18-6-6 6-6" />,
  next: () => <path d="m9 18 6-6-6-6" />,
  play: () => <path d="M7 4.5v15l12-7.5z" />,
  pause: () => <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  link: () => <><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3" /><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" /></>,
  sun: () => <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: () => <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />,
  grid: () => <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  branch: () => <><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7.5v9" /><path d="M18 10c0 4-6 3.5-11 7" /></>,
  close: () => <path d="M6 6l12 12M18 6 6 18" />,
  trash: () => <><path d="M4.5 7h15" /><path d="M9.5 7V4.8h5V7" /><path d="M6.5 7l.9 12.2h9.2L17.5 7" /></>,
  download: () => <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></>,
  reset: () => <><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  keyboard: () => <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></>,
  file: () => <><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5" /></>,
  sliders: () => <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  bookmark: () => <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z" />,
  graph: () => <><circle cx="12" cy="5" r="2.2" /><circle cx="5.5" cy="18.5" r="2.2" /><circle cx="18.5" cy="18.5" r="2.2" /><path d="M10.8 6.9 6.7 16.6M13.2 6.9l4.1 9.7" /></>,
  ring: () => <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="4.5" r="2" fill="currentColor" /><circle cx="18.5" cy="15.8" r="1.4" /><circle cx="5.5" cy="15.8" r="1.4" /></>,
  layers: () => <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5" /><path d="m3.5 16 8.5 4.5 8.5-4.5" /></>,
  chevronDown: () => <path d="m6 9 6 6 6-6" />,
  chevronRight: () => <path d="m9 6 6 6-6 6" />,
  check: () => <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: () => <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  info: () => <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8h.01" /></>,
  minus: () => <path d="M5 12h14" />,
  plus: () => <path d="M12 5v14M5 12h14" />,
  fit: () => <><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" /></>,
  inspect: () => <><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="17.5" cy="16.5" r="2.5" /><path d="m19.3 18.3 1.7 1.7" /></>,
  stop: () => <rect x="6" y="6" width="12" height="12" rx="2" />,
  dock: () => <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14 4.5v15" /></>,
  dockLeft: () => <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /><path d="M5.5 8h1.5M5.5 11h1.5" /></>,
  dockRight: () => <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M15 4.5v15" /><path d="M17 8h1.5M17 11h1.5" /></>,
  dockBottom: () => <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 14h17" /><path d="M7 17h4" /></>,
  dice: () => <><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="8.6" cy="8.6" r="1.25" fill="currentColor" stroke="none" /><circle cx="15.4" cy="8.6" r="1.25" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="8.6" cy="15.4" r="1.25" fill="currentColor" stroke="none" /><circle cx="15.4" cy="15.4" r="1.25" fill="currentColor" stroke="none" /></>,
  grip: () => <><circle cx="9" cy="6" r="1.2" fill="currentColor" /><circle cx="15" cy="6" r="1.2" fill="currentColor" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" /><circle cx="9" cy="18" r="1.2" fill="currentColor" /><circle cx="15" cy="18" r="1.2" fill="currentColor" /></>,
} satisfies Record<string, () => JSX.Element>;

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={`sim-svg${props.class ? ` ${props.class}` : ''}`}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[props.name]()}
    </svg>
  );
}

/** The Simulant mark: agents on a ring. */
export function Logo() {
  return (
    <svg class="sim-logo" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35" />
      <circle cx="12" cy="4" r="3" fill="var(--sim-accent)" />
      <circle cx="18.9" cy="16" r="2.2" fill="currentColor" />
      <circle cx="5.1" cy="16" r="2.2" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
