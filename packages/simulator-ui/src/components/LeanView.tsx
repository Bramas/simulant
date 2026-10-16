/**
 * The generated Lean model of an experiment, as `simulant lean` writes it, beside the model
 * view's `.sim` sources. A gutter says what each region translates; clicking a region shows its
 * source, and `focus` (from the sources) highlights the regions that translate a declaration or
 * a line. The library components the model imports follow, folded.
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from 'solid-js';
import type { LeanBlock, LeanDescription, SourceRef } from '@bramas/simulant-core/types/project';
import { leanModuleName } from '@bramas/simulant-lean-gen/names';
import { tokenizeLean } from './highlight';

export interface LeanViewProps {
  lean: LeanDescription;
  /** The simulation's name: `simulant lean -p <simulation>` names the module after it. */
  simulation: string;
  /** How a reference reads (`algo1.sim:32`). */
  refLabel: (ref: SourceRef) => string;
  onShowSource: (ref: SourceRef) => void;
  /** Regions to highlight: those translating this declaration (and line); `seq` repeats a request. */
  focus?: SourceRef & { seq: number };
}

const matches = (b: { refs: SourceRef[] }, f: SourceRef) =>
  b.refs.some(r => r.source === f.source && (f.line === undefined || r.line === f.line));

export function LeanView(props: LeanViewProps) {
  const module = () => leanModuleName(props.simulation);
  const path = () => `lean/Generated/${module()}/Model.lean`;
  /** The text as the CLI writes it for this simulation (the module is named after the simulation). */
  const rename = (text: string) => text.split(`Generated.${props.lean.module}`).join(`Generated.${module()}`);

  const download = (text: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div class="mv-lean">
      <section class="sim-card mv-section">
        <h3>
          Lean model <span class="sim-muted mv-lean-path">{path()}</span>
          <span class="sim-spacer" style={{ flex: 1 }} />
          <Show when={'text' in props.lean}>
            <button class="sim-ghost" onClick={() => 'text' in props.lean && download(rename(props.lean.text), 'Model.lean')}>Download</button>
          </Show>
        </h3>
        <p class="mv-note">
          Generated from the same compiled experiment as the simulation and the checks, by <code>simulant lean -p {props.simulation}</code>.
          The rounds, executions, fairness and <code>Correct</code> are defined once, by hand, in the semantic core (<code>lean/Simulant/</code>);
          proofs go in <code>Proofs/</code>. The gutter says what each part translates: click a part to see its source, or a declaration's
          {' '}<em>Lean</em> button to find its translation.
        </p>
      </section>
      <Show when={'text' in props.lean ? props.lean : undefined} fallback={
        <section class="sim-card mv-section mv-caveats">
          <h3>No Lean translation</h3>
          <p class="mv-note">{(props.lean as { error: string }).error}</p>
        </section>
      }>
        {lean => (
          <>
            <LeanFile text={rename(lean().text)} blocks={lean().blocks} {...props} />
            <For each={lean().library}>
              {lib => {
                const [open, setOpen] = createSignal(false);
                return (
                  <section class="algorithm-viewer mv-source mv-defs">
                    <button class="mv-defs-head" onClick={() => setOpen(v => !v)} aria-expanded={open()}>
                      <span class="mv-fold">{open() ? '▾' : '▸'}</span>
                      <span class="algorithm-caption">{lib.module}</span>
                      <span class="sim-muted">imported: generated from the standard library, shared by every model that uses it</span>
                    </button>
                    <Show when={open()}>
                      <LeanFile text={lib.text} blocks={[{ line: 1, endLine: lib.text.split('\n').length, label: 'library component', refs: lib.refs }]} {...props} />
                    </Show>
                  </section>
                );
              }}
            </For>
          </>
        )}
      </Show>
    </div>
  );
}

function LeanFile(p: { text: string; blocks: LeanBlock[] } & LeanViewProps): JSX.Element {
  const lines = createMemo(() => tokenizeLean(p.text.split('\n').map((text, i) => ({ number: i + 1, text }))));
  /** For each line, the smallest region containing it (a case of the step, rather than the step). */
  const innermost = createMemo(() => {
    const out: (number | undefined)[] = [];
    p.blocks.forEach((b, i) => {
      for (let l = b.line; l <= b.endLine; l++) {
        const cur = out[l];
        if (cur === undefined || p.blocks[cur].endLine - p.blocks[cur].line > b.endLine - b.line) out[l] = i;
      }
    });
    return out;
  });
  const starts = createMemo(() => {
    const out = new Map<number, LeanBlock[]>();
    for (const b of p.blocks) out.set(b.line, [...(out.get(b.line) ?? []), b]);
    return out;
  });
  const [hovered, setHovered] = createSignal<number | undefined>();
  const focused = createMemo(() => p.focus ? new Set(p.blocks.flatMap((b, i) => matches(b, p.focus!) ? [i] : [])) : new Set<number>());
  const [flash, setFlash] = createSignal(false);
  let body: HTMLDivElement | undefined;
  createEffect(on(() => p.focus?.seq, () => {
    const first = [...focused()].map(i => p.blocks[i]).sort((a, b) => a.line - b.line)[0];
    if (!first) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
    body?.querySelector(`[data-line-number="${first.line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, { defer: true }));

  const lit = (line: number) => {
    const i = innermost()[line];
    if (i === undefined) return '';
    if (flash() && [...focused()].some(f => p.blocks[f].line <= line && line <= p.blocks[f].endLine)) return ' mv-flash-line';
    return hovered() === i ? ' mv-lean-hover' : '';
  };

  return (
    <div class="algorithm-viewer mv-source mv-lean-file">
      <div class="algorithm-body" ref={body} onMouseLeave={() => setHovered(undefined)}>
        <For each={lines()}>
          {line => {
            const block = () => innermost()[line.number];
            const show = () => {
              const b = block();
              if (b !== undefined && p.blocks[b].refs[0]) p.onShowSource(p.blocks[b].refs[0]);
            };
            return (
              <div class={`algorithm-line mv-lean-line${lit(line.number)}${block() !== undefined && p.blocks[block()!].refs.length ? ' mv-linked' : ''}`}
                data-line-number={line.number} onMouseEnter={() => setHovered(block())} onClick={show}>
                <span class="mv-gutter">
                  <For each={starts().get(line.number) ?? []}>
                    {b => (
                      <span class="mv-gutter-item" title={b.refs.map(p.refLabel).join(', ')}>
                        {b.label}
                        <For each={b.refs.slice(0, 1)}>{r => <span class="mv-gutter-ref">{p.refLabel(r)}</span>}</For>
                      </span>
                    )}
                  </For>
                </span>
                <span class="line-number">{line.number}</span>
                <span class="line-content">
                  <For each={line.tokens}>{t => t.kind ? <span class={`tok-${t.kind}`}>{t.text}</span> : t.text}</For>
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
