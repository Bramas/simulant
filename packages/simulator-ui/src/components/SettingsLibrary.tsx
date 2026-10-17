/**
 * The settings a page can start from: the project's presets (read-only) and the settings saved
 * in this browser. Each shows its parameters and the length of its path; it can be loaded or
 * shared as a link, and saved settings can be deleted. The current settings are saved by name.
 */
import { For, Show, createSignal } from 'solid-js';
import type { PredefinedSetting } from '@bramas/simulant-core/types/project';
import { Icon } from './Icon';

export type SavedSetting = { name: string; settings: any; path?: number[] };

export interface SettingsLibraryProps {
  presets: PredefinedSetting[];
  saved: SavedSetting[];
  /** The current settings (with defaults filled in), to mark the entries that match them. */
  current: Record<string, unknown>;
  onLoad: (s: SavedSetting) => void;
  onShare: (s: SavedSetting) => void;
  onDelete: (name: string) => void;
  /** Saves the current settings and path under a name. */
  onSave: (name: string) => void;
}

/** `N=10 · site=3`; long values are shortened. */
function summary(settings: any): string {
  if (!settings || typeof settings !== 'object') return '';
  return Object.entries(settings).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${s.length > 24 ? s.slice(0, 22) + '…' : s}`;
  }).join(' · ');
}

const same = (a: any, b: Record<string, unknown>) =>
  !!a && Object.keys(b).every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));

export function SettingsLibrary(props: SettingsLibraryProps) {
  const [name, setName] = createSignal('');
  const save = (e: Event) => {
    e.preventDefault();
    const n = name().trim();
    if (!n) return;
    props.onSave(n);
    setName('');
  };

  const Entry = (p: { s: SavedSetting; deletable: boolean }) => (
    <li class={`sim-entry${same(p.s.settings, props.current) ? ' sim-entry-current' : ''}`}>
      <div class="sim-entry-text">
        <span class="sim-entry-name">{p.s.name}</span>
        <span class="sim-muted">
          <Show when={same(p.s.settings, props.current)}><span class="sim-entry-badge">current · </span></Show>
          {summary(p.s.settings)}
          <Show when={p.s.path && p.s.path.length > 1}> · {p.s.path!.length - 1} steps</Show>
        </span>
      </div>
      <div class="sim-entry-actions">
        <button class="sim-btn sim-sm" onClick={() => props.onLoad(p.s)}>Load</button>
        <button class="sim-ghost sim-icon sim-sm" aria-label="Copy a link to these settings" title="Copy a link to these settings" onClick={() => props.onShare(p.s)}><Icon name="link" size={14} /></button>
        <Show when={p.deletable}>
          <button class="sim-ghost sim-icon sim-sm sim-danger" aria-label={`Delete ${p.s.name}`} title="Delete" onClick={() => props.onDelete(p.s.name)}><Icon name="trash" size={14} /></button>
        </Show>
      </div>
    </li>
  );

  return (
    <div class="sim-library">
      <Show when={props.presets.length > 0}>
        <h4>Presets</h4>
        <ul class="sim-entries">
          <For each={props.presets}>{(s) => <Entry s={s} deletable={false} />}</For>
        </ul>
      </Show>
      <h4>Saved in this browser</h4>
      <Show when={props.saved.length > 0} fallback={<p class="sim-library-empty">Nothing saved yet: name the current settings and path below to keep them.</p>}>
        <ul class="sim-entries">
          <For each={props.saved}>{(s) => <Entry s={s} deletable={true} />}</For>
        </ul>
      </Show>
      <form class="sim-save" onSubmit={save}>
        <input type="text" placeholder="Name the current settings and path" value={name()} onInput={e => setName(e.currentTarget.value)} aria-label="Name of the saved settings" />
        <button type="submit" class="sim-primary" disabled={!name().trim()}><Icon name="bookmark" size={14} /> Save</button>
      </form>
    </div>
  );
}
