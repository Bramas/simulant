/**
 * The model view: the experiment's semantics in words (left) beside the declarations it is built
 * from, as written in their files (right), so that a reader can check them against the paper.
 * Each fact links to the declarations it comes from; the step lists, phase by phase, which
 * components act and what the adversary chooses. Definitions, which can be many, are grouped
 * and folded below the other declarations; a reference or a click on a name opens one. In place
 * of the facts, the generated Lean model (LeanView), linked to the same sources both ways.
 */
import { For, Show, batch, createMemo, createSignal, onCleanup, type JSX } from 'solid-js';
import type { ModelDescription, SourceExcerpt, SourceRef } from '@bramas/simulant-core/types/project';
import { tokenizeAll } from './highlight';
import { displayPath } from '../sim/describe';
import { LeanView } from './LeanView';
import './AlgorithmViewer.css';
import './ModelView.css';

export interface ModelViewProps {
  description: ModelDescription;
  /** The simulation's name (the Lean module is named after it). */
  simulation: string;
  /** Copies a link that opens this view. */
  onCopyLink?: () => void;
}

const KIND_LABEL: Record<SourceExcerpt['kind'], string> = {
  experiment: 'experiment', model: 'model', space: 'space', component: 'component', scheduler: 'scheduler', sensor: 'sensor',
  algorithm: 'algorithm', task: 'task', goal: 'goal', definition: 'definition',
};

const keyOf = (s: SourceExcerpt) => `${s.kind} ${s.name}`;
/** A definition folded: its first line after the doc comment and attributes. */
const signature = (s: SourceExcerpt) => (s.lines.find(l => /^def\s/.test(l.text)) ?? s.lines[0])?.text.replace(/\s*:=\s*$/, '') ?? s.name;
const range = (s: SourceExcerpt) => s.lines.length ? `${s.lines[0].number}–${s.lines[s.lines.length - 1].number}` : '';

export function ModelView(props: ModelViewProps) {
  const d = () => props.description;
  const defNames = createMemo(() => new Set(d().sources.filter(s => s.kind === 'definition').map(s => s.name)));
  const excerpts = createMemo(() => d().sources.map(s => ({ ...s, key: keyOf(s), tokens: tokenizeAll(s.lines, defNames()) })));
  const byKey = createMemo(() => new Map(excerpts().map(s => [s.key, s])));
  const declarations = createMemo(() => excerpts().filter(s => s.kind !== 'definition'));
  /** Definitions in file order, as a reader of the files meets them. */
  const definitions = createMemo(() => excerpts().filter(s => s.kind === 'definition').sort((a, b) =>
    a.file === b.file ? (a.lines[0]?.number ?? 0) - (b.lines[0]?.number ?? 0) : (a.file ?? '') < (b.file ?? '') ? -1 : 1));

  // The group of definitions is folded at first, and so is each definition in it.
  const [defsOpen, setDefsOpen] = createSignal(false);
  const [openDefs, setOpenDefs] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal('');
  const shownDefs = createMemo(() => definitions().filter(s => s.name.toLowerCase().includes(filter().trim().toLowerCase())));
  const toggleDef = (key: string) => setOpenDefs(o => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  let defsGroup: HTMLElement | undefined;
  // The declaration (and line) a reference opened, highlighted for a moment.
  const [flash, setFlash] = createSignal<SourceRef | undefined>();
  const elements = new Map<string, HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const show = (ref: SourceRef) => {
    const target = byKey().get(ref.source);
    if (target?.kind === 'definition') batch(() => {
      setDefsOpen(true);
      setOpenDefs(o => new Set(o).add(ref.source));
      if (!target.name.toLowerCase().includes(filter().trim().toLowerCase())) setFilter('');
    });
    const el = elements.get(ref.source);
    const line = ref.line !== undefined ? el?.querySelector(`[data-line-number="${ref.line}"]`) : undefined;
    (line ?? el)?.scrollIntoView({ block: line ? 'center' : 'start', behavior: 'smooth' });
    setFlash(ref);
    clearTimeout(timer);
    timer = setTimeout(() => setFlash(undefined), 1600);
  };
  const flashed = (source: string, line?: number) => flash()?.source === source && flash()?.line === line;

  // The Lean model instead of the facts, and what in the sources it translates.
  const [mode, setMode] = createSignal<'summary' | 'lean'>('summary');
  const leanBlocks = createMemo(() => {
    const l = d().lean;
    return l && 'blocks' in l ? [...l.blocks, ...l.library.map(x => ({ refs: x.refs }))] : [];
  });
  const leanSources = createMemo(() => new Set(leanBlocks().flatMap(b => b.refs.map(r => r.source))));
  const leanLines = createMemo(() => new Set(leanBlocks().flatMap(b => b.refs.flatMap(r => r.line !== undefined ? [`${r.source}:${r.line}`] : []))));
  const [leanFocus, setLeanFocus] = createSignal<SourceRef & { seq: number }>();
  let seq = 0;
  const toLean = (ref: SourceRef) => setLeanFocus({ ...ref, seq: ++seq });
  const refLabel = (r: SourceRef) => {
    const s = byKey().get(r.source);
    return s ? `${s.file ? displayPath(s.file) : s.name}:${r.line ?? s.lines[0]?.number}` : r.source;
  };

  const openDefinitions = () => {
    setDefsOpen(true);
    defsGroup?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /**
   * A declaration's lines; a definition's name opens it. Beside the Lean model, a click on a line
   * finds its translation: that statement's, or the declaration's.
   */
  const Code = (p: { excerpt: ReturnType<typeof excerpts>[number] }): JSX.Element => (
    <div class="algorithm-body">
      <For each={p.excerpt.tokens}>
        {line => (
          <div
            class={`algorithm-line${flashed(p.excerpt.key, line.number) ? ' mv-flash-line' : ''}${mode() === 'lean' && leanSources().has(p.excerpt.key) ? ' mv-to-lean' : ''}${mode() === 'lean' && leanLines().has(`${p.excerpt.key}:${line.number}`) ? ' mv-to-lean-line' : ''}`}
            data-line-number={line.number}
            title={mode() === 'lean' && leanSources().has(p.excerpt.key) ? 'Show its translation in Lean' : undefined}
            onClick={e => {
              if (mode() !== 'lean' || !leanSources().has(p.excerpt.key) || (e.target as HTMLElement).classList.contains('tok-link')) return;
              const key = `${p.excerpt.key}:${line.number}`;
              toLean(leanLines().has(key) ? { source: p.excerpt.key, line: line.number } : { source: p.excerpt.key });
            }}
          >
            <span class="line-number">{line.number}</span>
            <span class="line-content">
              <For each={line.tokens}>
                {t => t.kind === 'function' && defNames().has(t.text)
                  ? <span class="tok-function tok-link" onClick={() => show({ source: `definition ${t.text}` })} title={`Show the definition of ${t.text}`}>{t.text}</span>
                  : t.kind ? <span class={`tok-${t.kind}`}>{t.text}</span> : t.text}
              </For>
            </span>
          </div>
        )}
      </For>
    </div>
  );

  const download = () => {
    const blob = new Blob([JSON.stringify(d().ir, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d().experiment}.ir.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const Ref = (p: { at: SourceRef }) => (
    <Show when={byKey().get(p.at.source)}>
      {s => (
        <button class="mv-ref" onClick={() => show(p.at)} title={`Show ${s().name} as written (${s().file ?? ''})`}>
          {s().file ? displayPath(s().file!) : s().name}:{p.at.line ?? s().lines[0]?.number}
        </button>
      )}
    </Show>
  );

  const sections = () => d().sections;
  const Section = (p: { section: ModelDescription['sections'][number] }) => (
    <section class="sim-card mv-section">
      <h3>{p.section.title}</h3>
      <dl class="mv-facts">
        <For each={p.section.facts}>
          {f => (
            <>
              <dt>{f.label}</dt>
              <dd>
                <div class="mv-value">
                  <span class={f.code ? 'mv-code' : 'mv-strong'}>{f.value}</span>
                  <For each={f.refs ?? []}>{r => <Ref at={r} />}</For>
                </div>
                <Show when={f.note}><div class="mv-note">{f.note}</div></Show>
                <Show when={f.details?.length}>
                  <ul class="mv-details"><For each={f.details}>{x => <li>{x}</li>}</For></ul>
                </Show>
              </dd>
            </>
          )}
        </For>
      </dl>
    </section>
  );

  return (
    <div class="model-view">
      <section class="sim-card mv-intro">
        <div class="mv-intro-head">
          <h2>{d().experiment}</h2>
          <div class="mv-chips">
            <For each={d().summary}>{c => <span class="sim-chip">{c}</span>}</For>
          </div>
          <span class="sim-spacer" style={{ flex: 1 }} />
          <Show when={d().lean}>
            <div class="sim-tabs" role="tablist" aria-label="Model view">
              <button role="tab" aria-selected={mode() === 'summary'} class={mode() === 'summary' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => setMode('summary')}>Summary</button>
              <button role="tab" aria-selected={mode() === 'lean'} class={mode() === 'lean' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => setMode('lean')} title="The generated Lean model, linked to the sources">Lean</button>
            </div>
          </Show>
          <Show when={props.onCopyLink}>
            <button class="sim-ghost" onClick={() => props.onCopyLink!()} title="Copy a link that opens this view">Copy link</button>
          </Show>
          <button class="sim-ghost" onClick={download} title="Download the compiled experiment (the IR the simulator, the explorer and the Lean generator use)">Download IR</button>
        </div>
        <Show when={d().about}>
          <div class="mv-about">
            <For each={d().about!.split('\n\n')}>
              {para => <p><For each={para.split('`')}>{(part, i) => i() % 2 ? <code>{part}</code> : part}</For></p>}
            </For>
          </div>
        </Show>
        <p class="sim-muted mv-help">
          The semantics below are derived from the compiled experiment; each reference opens the declaration it comes from, as written.
          <Show when={d().revision}> Sources revision <code>{d().revision}</code>.</Show>
        </p>
      </section>

      <div class={`mv-grid${mode() === 'lean' && d().lean ? ' mv-grid-lean' : ''}`}>
        <Show when={mode() === 'lean' && d().lean}>
          {lean => (
            <div class="mv-column">
              <LeanView lean={lean()} simulation={props.simulation} refLabel={refLabel} onShowSource={show} focus={leanFocus()} />
            </div>
          )}
        </Show>
        <div class="mv-column" style={{ display: mode() === 'lean' && d().lean ? 'none' : undefined }}>
          <For each={sections().slice(0, 2)}>{s => <Section section={s} />}</For>

          <section class="sim-card mv-section">
            <h3>Step <span class="sim-muted">what happens in each step, in order</span></h3>
            <ol class="mv-round">
              <For each={d().step}>
                {p => (
                  <li classList={{ 'mv-idle': p.by?.length === 0 && !p.choices?.length }}>
                    <div class="mv-phase">{p.phase}</div>
                    <div class="mv-phase-body">
                      <div>{p.what}</div>
                      <Show when={p.by?.length || p.choices?.length}>
                        <div class="mv-phase-tags">
                          <For each={p.by ?? []}>{c => <span class="mv-tag" title="Component acting in this phase">{c}</span>}</For>
                          <For each={p.choices ?? []}>{c => <span class="mv-tag mv-adversary" title="Chosen by the adversary: every option is explored">adversary: {c}</span>}</For>
                        </div>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </section>

          <For each={sections().slice(2)}>{s => <Section section={s} />}</For>

          <Show when={d().caveats.length}>
            <section class="sim-card mv-section mv-caveats">
              <h3>What the checks do not cover</h3>
              <ul><For each={d().caveats}>{c => <li>{c}</li>}</For></ul>
            </section>
          </Show>
        </div>

        <div class="mv-sources">
          <nav class="mv-toc" aria-label="Declarations">
            <For each={declarations()}>
              {s => (
                <button class={`mv-toc-item mv-kind-${s.kind}`} onClick={() => show({ source: s.key })} title={`${KIND_LABEL[s.kind]} ${s.name}`}>
                  <span class="mv-kind">{KIND_LABEL[s.kind]}</span>{s.name}
                </button>
              )}
            </For>
            <Show when={definitions().length}>
              <button class="mv-toc-item" onClick={openDefinitions} title="Show the definitions these declarations use">
                <span class="mv-kind">definitions</span>{definitions().length}
              </button>
            </Show>
          </nav>
          <div class="mv-source-list">
            <For each={declarations()} fallback={<p class="sim-muted">The sources of this experiment are not available.</p>}>
              {s => (
                <div class={`algorithm-viewer mv-source${flashed(s.key) ? ' mv-flash' : ''}`} ref={el => elements.set(s.key, el)}>
                  <div class="algorithm-header">
                    <span class={`mv-kind mv-kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                    <h3 class="algorithm-caption">{s.name}</h3>
                    <span class="algorithm-file" title={s.file}>{s.file ? displayPath(s.file) : ''}:{range(s)}</span>
                    <Show when={mode() === 'lean' && leanSources().has(s.key)}>
                      <span class="sim-spacer" style={{ flex: 1 }} />
                      <button class="sim-ghost mv-lean-button" onClick={() => toLean({ source: s.key })} title="Show its translation in Lean">Lean</button>
                    </Show>
                  </div>
                  <Code excerpt={s} />
                </div>
              )}
            </For>

            <Show when={definitions().length}>
              <section class="algorithm-viewer mv-source mv-defs" ref={el => (defsGroup = el)}>
                <button class="mv-defs-head" onClick={() => setDefsOpen(v => !v)} aria-expanded={defsOpen()}>
                  <span class="mv-fold">{defsOpen() ? '▾' : '▸'}</span>
                  <span class="algorithm-caption">Definitions</span>
                  <span class="sim-muted">{definitions().length}, in file order: functions the algorithm, the task and the parameter domains call</span>
                </button>
                <Show when={defsOpen()}>
                  <div class="mv-defs-tools">
                    <input type="search" placeholder="Filter by name" value={filter()} onInput={e => setFilter(e.currentTarget.value)} aria-label="Filter the definitions by name" />
                    <button class="sim-ghost" onClick={() => setOpenDefs(new Set(shownDefs().map(s => s.key)))}>Open all</button>
                    <button class="sim-ghost" onClick={() => setOpenDefs(new Set<string>())} disabled={!openDefs().size}>Fold all</button>
                  </div>
                  <For each={shownDefs()} fallback={<p class="sim-muted mv-defs-none">No definition matches.</p>}>
                    {s => (
                      <div class={`mv-def${flashed(s.key) ? ' mv-flash' : ''}`} ref={el => elements.set(s.key, el)}>
                        <button class="mv-def-head" onClick={() => toggleDef(s.key)} aria-expanded={openDefs().has(s.key)} title={openDefs().has(s.key) ? 'Fold' : 'Show the definition'}>
                          <span class="mv-fold">{openDefs().has(s.key) ? '▾' : '▸'}</span>
                          <span class="mv-def-signature">{signature(s)}</span>
                          <span class="algorithm-file" title={s.file}>{s.file ? displayPath(s.file) : ''}:{range(s)}</span>
                        </button>
                        <Show when={openDefs().has(s.key)}>
                          <Code excerpt={s} />
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              </section>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
