/**
 * The branches of a step: the configurations the adversary's choices lead to. A window lists
 * them all, each with a drawing of its configuration, its verdict and what distinguishes it, to
 * pick one.
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { ExecutionStatus } from '@bramas/simulant-core/types/project';
import './BranchPicker.css';

export type Branch = {
  index: number;
  /** The step's witness, every choice of the round ("a0: as is; a1: mirrored; no crash"). */
  label: string;
  /** Only the choices that differ between the branches ("a1: mirrored"). */
  short: string;
  verdict?: ExecutionStatus;
};

export { distinguishing } from '../sim/branches';

const VERDICT_TEXT = { success: 'success', failure: 'failure', inProgress: 'not yet' } as const;

export interface BranchPickerProps {
  branches: Branch[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
  /** Draws the configuration of a branch in a canvas of the given size (CSS pixels). */
  draw?: (index: number, ctx: CanvasRenderingContext2D, size: number) => void;
}

const THUMB = 150;

export function BranchPicker(props: BranchPickerProps) {
  const [filter, setFilter] = createSignal('');
  const shown = createMemo(() => {
    const f = filter().trim().toLowerCase();
    return f ? props.branches.filter(b => `${b.index} ${b.label}`.toLowerCase().includes(f)) : props.branches;
  });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const Thumb = (p: { index: number }) => {
    let canvas: HTMLCanvasElement | undefined;
    onMount(() => {
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !props.draw) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.height = THUMB * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      try {
        props.draw(p.index, ctx, THUMB);
      } catch (e) {
        console.error('Error drawing a branch:', e);
      }
    });
    return <canvas ref={canvas} class="bp-thumb" style={{ width: `${THUMB}px`, height: `${THUMB}px` }} />;
  };

  return (
    <div class="bp-backdrop" onClick={e => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="bp-window" role="dialog" aria-modal="true" aria-label="Branches">
        <div class="bp-header">
          <h3>{props.branches.length} branches at this step</h3>
          <Show when={props.branches.length > 8}>
            <input type="search" placeholder="Filter (index or choice)" value={filter()} onInput={e => setFilter(e.currentTarget.value)} aria-label="Filter the branches" />
          </Show>
          <span style={{ flex: 1 }} />
          <button class="sim-ghost sim-icon" onClick={props.onClose} title="Close (Esc)">✕</button>
        </div>
        <p class="sim-muted bp-help">Each branch is one way the adversary can play this round; only the choices that differ between branches and are not the first option are listed.</p>
        <div class="bp-grid">
          <For each={shown()} fallback={<p class="sim-muted">No branch matches.</p>}>
            {b => (
              <button class={`bp-branch${b.index === props.current ? ' bp-current' : ''}`} onClick={() => props.onPick(b.index)} title={b.label}>
                <Show when={props.draw}><Thumb index={b.index} /></Show>
                <span class="bp-caption">
                  <strong>Branch {b.index}</strong>
                  <Show when={b.verdict}>{v => <span class={`sim-chip sim-${v()}`}>{VERDICT_TEXT[v()]}</span>}</Show>
                </span>
                <span class="bp-label">{b.short || b.label || '(no choice)'}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
