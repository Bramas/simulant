/**
 * The algorithm's `.sim` source, as written, with a cursor on each agent's line: the statement
 * that decided its last step (or its program counter). An agent inside a procedure is also marked,
 * more lightly, on the lines of the calls that led there. Below, the definitions the algorithm
 * uses, folded to their signatures (a click on a function name opens one); an agent is marked
 * (↩) on the lines its last step returned from. Clicking a cursor explains that agent's last
 * step (its view, and each definition it called with its arguments and result) in a card
 * anchored under that cursor: it covers the code without moving it, and follows the agent's line
 * while stepping.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { AgentExecutionState, AlgorithmSource, TraceCall } from '@bramas/simulant-core/types/project';
import { tokenizeAll, type Line } from './highlight';
import { Icon } from './Icon';
import './AlgorithmViewer.css';

export type { AgentExecutionState, AlgorithmSource } from '@bramas/simulant-core/types/project';

export interface AlgorithmViewerProps {
  source: AlgorithmSource;
  agents?: AgentExecutionState[];
  /** Buttons for the header's end (the page's panel controls). */
  actions?: JSX.Element;
  /** A press on the header (the page drags the panel from there). */
  onHeadPointerDown?: (e: PointerEvent) => void;
  /** The agent selected elsewhere (by name): its cursors are emphasized. */
  highlighted?: string | null;
  /** Called with the agent's name when one of its cursors is clicked. */
  onSelectAgent?: (name: string) => void;
}

type Mark = { agent: AgentExecutionState; kind: 'at' | 'call' | 'return' };
const SHORT = 48;
const shorten = (s: string) => s.length > SHORT ? s.slice(0, SHORT - 1) + '…' : s;

export function AlgorithmViewer(props: AlgorithmViewerProps) {
  const definitions = () => props.source.definitions ?? [];
  const defNames = createMemo(() => new Set(definitions().map(d => d.name)));
  const procedures = createMemo(() => {
    const out = new Set(['main', ...defNames()]);
    for (const l of props.source.lines) {
      const m = /^\s*def\s+(\w+)/.exec(l.text);
      if (m) out.add(m[1]);
    }
    return out;
  });
  const lines = createMemo(() => tokenizeAll(props.source.lines, procedures()));
  const defLines = createMemo(() => definitions().map(d => ({ ...d, tokens: tokenizeAll(d.lines, procedures()) })));

  /** The line an agent is shown at: the statement that decided its last step, or its program counter. */
  const lineOf = (a: AgentExecutionState) => a.explanation?.line ?? a.line;

  const mainMarks = createMemo(() => {
    const out = new Map<number, Mark[]>();
    const add = (line: number, m: Mark) => out.set(line, [...(out.get(line) ?? []), m]);
    for (const a of props.agents ?? []) {
      add(lineOf(a), { agent: a, kind: 'at' });
      for (const c of new Set(a.calls ?? [])) add(c, { agent: a, kind: 'call' });
    }
    return out;
  });
  /** Per definition and line, the agents whose last step returned from that line (once per agent). */
  const defMarks = createMemo(() => {
    const out = new Map<string, Map<number, Mark[]>>();
    for (const a of props.agents ?? []) {
      const seen = new Set<string>();
      const walk = (calls: TraceCall[]) => {
        for (const c of calls) {
          const key = `${c.fn}:${c.line}`;
          if (c.line !== undefined && !seen.has(key)) {
            seen.add(key);
            const lines = out.get(c.fn) ?? new Map<number, Mark[]>();
            lines.set(c.line, [...(lines.get(c.line) ?? []), { agent: a, kind: 'return' }]);
            out.set(c.fn, lines);
          }
          walk(c.calls);
        }
      };
      walk(a.explanation?.calls ?? []);
    }
    return out;
  });

  // Folding, the selected agent, and the line to flash after a jump: kept while stepping.
  const [open, setOpen] = createSignal<Set<string>>(new Set());
  // The whole group of definitions is folded at first.
  const [defsOpen, setDefsOpen] = createSignal(false);
  // By name: an agent's index is its place in the configuration, which can change between steps.
  const [selected, setSelected] = createSignal<string | undefined>();
  /** The cursor the explanation is anchored to (`data-marker`). */
  const [anchor, setAnchor] = createSignal<string | undefined>();
  const [flash, setFlash] = createSignal<string | undefined>();
  const defElements = new Map<string, HTMLElement>();
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(flashTimer));
  const toggle = (name: string) => setOpen(o => { const n = new Set(o); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  /** Opens a definition and scrolls to it (and to a line of it). */
  const jump = (name: string, line?: number) => {
    if (!defNames().has(name)) return;
    setDefsOpen(true);
    setOpen(o => new Set(o).add(name));
    setFlash(line !== undefined ? `${name}:${line}` : name);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setFlash(undefined), 1600);
    queueMicrotask(() => {
      const el = defElements.get(name);
      const target = line !== undefined ? el?.querySelector(`[data-line-number="${line}"]`) : el;
      (target ?? el)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };
  const selectedAgent = createMemo(() => (props.agents ?? []).find(a => a.agentId === selected()));
  const markerKey = (m: Mark, def: string | undefined, line: number) => `${m.kind}-${m.agent.agentId}-${def ?? 'main'}-${line}`;
  const markerAt = (key: string) => scroller?.querySelector<HTMLElement>(`[data-marker="${CSS.escape(key)}"]`);
  /** Opens (or closes, from the same cursor) an agent's explanation, under the cursor `key`. */
  const select = (a: AgentExecutionState, key?: string) => {
    const same = selected() === a.agentId && (key === undefined || key === anchor());
    setSelected(same ? undefined : a.agentId);
    setAnchor(same ? undefined : key);
    reveal = !same;
    if (!same) props.onSelectAgent?.(a.agentId);
  };
  const close = () => { setSelected(undefined); setAnchor(undefined); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  // The agents' lines stay in view while stepping: scroll to the first one when it is hidden.
  let scroller: HTMLDivElement | undefined;
  createEffect(() => {
    mainMarks();
    queueMicrotask(() => {
      const line = scroller?.querySelector<HTMLElement>('.algorithm-body > .algorithm-line.highlighted');
      if (!scroller || !line) return;
      const view = scroller.getBoundingClientRect(), box = line.getBoundingClientRect();
      if (box.top < view.top + 8 || box.bottom > view.bottom - 8) {
        scroller.scrollTop += box.top - view.top - view.height / 3;
      }
    });
  });

  // The explanation's card: under its cursor (the agent's current line when that cursor is gone),
  // in the scrolling content, so that it scrolls with the code.
  let card: HTMLDivElement | undefined;
  let reveal = false;
  const [place, setPlace] = createSignal<{ top: number; left: number; width: number; arrow: number } | undefined>();
  const reposition = () => {
    const a = selectedAgent();
    if (!scroller || !a) return setPlace(undefined);
    const marker = (anchor() && markerAt(anchor()!)) || markerAt(`at-${a.agentId}-main-${lineOf(a)}`);
    if (!marker) return setPlace(undefined);
    const view = scroller.getBoundingClientRect(), box = marker.getBoundingClientRect();
    const x = box.left + box.width / 2 - view.left + scroller.scrollLeft;
    const width = Math.max(240, Math.min(400, scroller.clientWidth - 16));
    const left = Math.max(scroller.scrollLeft + 8, Math.min(x - 48, scroller.scrollLeft + scroller.clientWidth - width - 8));
    setPlace({ top: box.bottom - view.top + scroller.scrollTop + 6, left, width, arrow: x - left });
    // When opened by a click, the card is scrolled into view.
    if (reveal) queueMicrotask(() => {
      reveal = false;
      if (!card || !scroller) return;
      const c = card.getBoundingClientRect(), v = scroller.getBoundingClientRect();
      if (c.bottom > v.bottom - 8) scroller.scrollTop += Math.min(c.bottom - v.bottom + 8, c.top - v.top - 40);
    });
  };
  createEffect(() => {
    selected(); anchor(); mainMarks(); defMarks(); defsOpen(); open();
    queueMicrotask(reposition);
  });
  onMount(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(() => reposition());
    observer.observe(scroller);
    onCleanup(() => observer.disconnect());
  });

  const Code = (p: { lines: Line[]; marks: Map<number, Mark[]>; def?: string }): JSX.Element => (
    <For each={p.lines}>
      {(line) => {
        const marks = () => p.marks.get(line.number) ?? [];
        const classes = () => [
          'algorithm-line',
          marks().some(m => m.kind === 'at') ? 'highlighted' : marks().some(m => m.kind === 'return') ? 'returned' : marks().length ? 'calling' : '',
          p.def && flash() === `${p.def}:${line.number}` ? 'flash' : '',
        ].filter(Boolean).join(' ');
        return (
          <div class={classes()} data-line-number={line.number}>
            <span class="line-number">{line.number}</span>
            <span class="line-content">
              <For each={line.tokens}>
                {(t) => t.kind === 'function' && defNames().has(t.text)
                  ? <span class="tok-function tok-link" onClick={() => jump(t.text)} title={`Show the definition of ${t.text}`}>{t.text}</span>
                  : t.kind ? <span class={`tok-${t.kind}`}>{t.text}</span> : t.text}
              </For>
            </span>
            <Show when={marks().length > 0}>
              <span class="agent-markers">
                <For each={marks()}>
                  {(m) => (
                    <span
                      class={`agent-marker${m.kind === 'call' ? ' call-marker' : m.kind === 'return' ? ' return-marker' : ''}${selected() === m.agent.agentId || props.highlighted === m.agent.agentId ? ' selected' : ''}`}
                      style={{ '--agent': m.agent.color }}
                      data-marker={markerKey(m, p.def, line.number)}
                      title={m.kind === 'at' ? `${m.agent.agentId} is at this line: click to explain its last step`
                        : m.kind === 'call' ? `${m.agent.agentId} is inside the procedure called here`
                        : `${m.agent.agentId}'s last step returned from this line: click to explain it`}
                      onClick={() => select(m.agent, markerKey(m, p.def, line.number))}
                    >
                      {m.kind === 'at' ? '◀' : m.kind === 'call' ? '◁' : '↩'} {m.agent.agentId}
                    </span>
                  )}
                </For>
              </span>
            </Show>
          </div>
        );
      }}
    </For>
  );

  const CallTree = (p: { calls: TraceCall[]; depth: number }): JSX.Element => (
    <ul class="ex-calls">
      <For each={p.calls}>
        {(c) => {
          const [expanded, setExpanded] = createSignal(false);
          return (
            <li>
              <div class="ex-call">
                <span class="ex-toggle" onClick={() => setExpanded(v => !v)}>{c.calls.length ? (expanded() ? '▾' : '▸') : ''}</span>
                <span class="tok-function tok-link" onClick={() => jump(c.fn, c.line)}>{c.fn}</span>
                <span class="ex-args" title={c.args.join(', ')}>({c.args.map(shorten).join(', ')})</span>
                <span class="ex-eq">=</span>
                <span class="ex-result" title={c.result}>{shorten(c.result)}</span>
                <Show when={c.line !== undefined}>
                  <span class="ex-line" onClick={() => jump(c.fn, c.line)} title="Show where it returned">↩ {c.line}</span>
                </Show>
              </div>
              <Show when={expanded() && c.calls.length}>
                <CallTree calls={c.calls} depth={p.depth + 1} />
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );

  return (
    <div class="algorithm-viewer">
      <div class={`algorithm-header${props.onHeadPointerDown ? ' algorithm-header-draggable' : ''}`} onPointerDown={e => props.onHeadPointerDown?.(e)}>
        <Icon name="file" />
        <Show when={props.source.file}>
          <span class="algorithm-file">{props.source.file!.split('/').pop()}</span>
          <Icon name="chevronRight" size={12} class="algorithm-crumb" />
        </Show>
        <h3 class="algorithm-caption">{props.source.name}</h3>
        <span class="sim-spacer" />
        <div class="algorithm-agents" aria-label="Agents">
          <For each={props.agents ?? []}>
            {(a) => (
              <button
                onPointerDown={e => e.stopPropagation()}
                class={`algorithm-agent${selected() === a.agentId || props.highlighted === a.agentId ? ' selected' : ''}`}
                style={{ '--agent': a.color }}
                onClick={() => {
                  // The card opens under the agent's cursor, scrolled into view.
                  const key = `at-${a.agentId}-main-${lineOf(a)}`;
                  select(a, key);
                  queueMicrotask(() => markerAt(key)?.closest('.algorithm-line')?.scrollIntoView({ block: 'nearest' }));
                }}
                title={`${a.agentId}: line ${lineOf(a)}. Click to explain its last step`}
                aria-pressed={selected() === a.agentId}
              >
                <span class="algorithm-agent-dot" />{a.agentId}<span class="algorithm-agent-line">{lineOf(a)}</span>
              </button>
            )}
          </For>
        </div>
        {props.actions}
      </div>

      <div class="algorithm-scroll" ref={scroller}>
        <div class="algorithm-body">
          <Code lines={lines()} marks={mainMarks()} />
        </div>

        <Show when={defLines().length > 0}>
          <div class="algorithm-defs">
            <div class="defs-title" onClick={() => setDefsOpen(v => !v)} title={defsOpen() ? 'Fold the definitions' : 'Show the definitions'}>
              <Icon name="chevronRight" size={13} class={defsOpen() ? 'defs-chevron open' : 'defs-chevron'} /> Definitions <span class="sim-muted">{defLines().length} · a click on a function name opens its definition</span>
            </div>
            <Show when={defsOpen()}>
              <For each={defLines()}>
                {(d) => {
                  const marks = () => defMarks().get(d.name) ?? new Map<number, Mark[]>();
                  const agents = () => [...new Map([...marks().values()].flat().map(m => [m.agent.index, m.agent])).values()];
                  return (
                    <div class={`def${flash() === d.name ? ' flash' : ''}`} ref={el => defElements.set(d.name, el)}>
                      <Show when={open().has(d.name)} fallback={
                        <div class="algorithm-line def-folded" onClick={() => toggle(d.name)} title="Show the definition">
                          <span class="line-number">▸</span>
                          <span class="line-content">
                            <For each={d.tokens[0]?.tokens ?? []}>{(t) => t.kind ? <span class={`tok-${t.kind}`}>{t.text}</span> : t.text}</For>
                          </span>
                          <Show when={agents().length}>
                            <span class="agent-markers">
                              <For each={agents()}>{(a) => <span class="agent-marker return-marker" style={{ '--agent': a.color }}>↩ {a.agentId}</span>}</For>
                            </span>
                          </Show>
                        </div>
                      }>
                        <div class="def-open">
                          <div class="def-fold" onClick={() => toggle(d.name)} title="Fold">▾ {d.name}</div>
                          <Code lines={d.tokens} marks={marks()} def={d.name} />
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>

        <Show when={selectedAgent() && place()}>
          <div
            ref={card}
            class="ex-card"
            role="dialog"
            aria-label={`Last step of ${selectedAgent()!.agentId}`}
            style={{ top: `${place()!.top}px`, left: `${place()!.left}px`, width: `${place()!.width}px`, '--arrow': `${place()!.arrow}px`, '--agent': selectedAgent()!.color }}
          >
            <div class="ex-head">
              <span class="ex-agent"><span class="algorithm-agent-dot" />{selectedAgent()!.agentId}</span>
              <span class="ex-title">Last step</span>
              <span class="sim-spacer" />
              <button class="sim-ghost sim-icon sim-sm" onClick={close} aria-label="Close the explanation" title="Close (Esc)"><Icon name="close" size={14} /></button>
            </div>
            <Show when={selectedAgent()!.explanation} fallback={<p class="ex-none">No decision in the last step: the agent was not activated, or this is the initial configuration.</p>}>
              {e => (
                <>
                  <div class="ex-meta">
                    <span><span class="tok-action">move</span> {e().move}</span>
                    <Show when={e().line !== undefined}><span>decided at line {e().line}</span></Show>
                    <span>frame: {e().frame}</span>
                  </div>
                  <div class="ex-section">
                    <h4>Look</h4>
                    <div class="ex-look-wrap">
                      <table class="ex-look">
                        <thead>
                          <tr>
                            <th>location</th><th>position</th><th>neighbors</th>
                            <For each={Object.keys(e().locations[0]?.sensors ?? {})}>{name => <th class="si-key">{name}</th>}</For>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={e().locations}>
                            {(l, i) => (
                              <tr classList={{ 'ex-here': l.here }}>
                                <td>ℓ{i()}{l.here ? ' (here)' : ''}</td>
                                <td>{l.position}</td>
                                <td>{l.neighbors.map(n => `ℓ${n}`).join(', ')}</td>
                                <For each={Object.values(l.sensors)}>{v => <td class="ex-result">{v}</td>}</For>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                    <p class="ex-note">The algorithm sees locations, their order and the sensors; positions are shown for reading.</p>
                  </div>
                  <Show when={Object.keys(e().view).length}>
                    <div class="ex-section">
                      <h4>Sensors</h4>
                      <dl class="ex-view">
                        <For each={Object.entries(e().view)}>
                          {([k, v]) => <><dt class="si-key">{k}</dt><dd class="ex-result">{v}</dd></>}
                        </For>
                      </dl>
                    </div>
                  </Show>
                  <div class="ex-section">
                    <h4>Calls</h4>
                    <Show when={e().calls.length} fallback={<p class="ex-none">No definition was called.</p>}>
                      <CallTree calls={e().calls} depth={0} />
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
