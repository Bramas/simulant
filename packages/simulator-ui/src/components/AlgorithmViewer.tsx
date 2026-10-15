/**
 * The algorithm's `.sim` source, as written, with a cursor on each agent's line: the statement
 * that decided its last step (or its program counter). An agent inside a procedure is also marked,
 * more lightly, on the lines of the calls that led there. Below, the definitions the algorithm
 * uses, folded to their signatures (a click on a function name opens one); an agent is marked
 * (↩) on the lines its last step returned from. Clicking a cursor explains that agent's last
 * step: its view, and each definition it called with its arguments and result.
 */
import { For, Show, createMemo, createSignal, onCleanup, type JSX } from 'solid-js';
import type { AgentExecutionState, AlgorithmSource, TraceCall } from '@bramas/simulant-core/types/project';
import { tokenizeAll, type Line } from './highlight';
import './AlgorithmViewer.css';

export type { AgentExecutionState, AlgorithmSource } from '@bramas/simulant-core/types/project';

export interface AlgorithmViewerProps {
  source: AlgorithmSource;
  agents?: AgentExecutionState[];
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
  const [selected, setSelected] = createSignal<number | undefined>();
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
  const selectedAgent = createMemo(() => (props.agents ?? []).find(a => a.index !== undefined && a.index === selected()));

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
                      class={`agent-marker${m.kind === 'call' ? ' call-marker' : m.kind === 'return' ? ' return-marker' : ''}${selected() === m.agent.index ? ' selected' : ''}`}
                      style={{ color: m.agent.color }}
                      title={m.kind === 'at' ? `${m.agent.agentId} is at this line: click to explain its last step`
                        : m.kind === 'call' ? `${m.agent.agentId} is inside the procedure called here`
                        : `${m.agent.agentId}'s last step returned from this line: click to explain it`}
                      onClick={() => setSelected(s => s === m.agent.index ? undefined : m.agent.index)}
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
      <div class="algorithm-header">
        <h3 class="algorithm-caption">{props.source.name}</h3>
        <Show when={props.source.file}>
          <span class="algorithm-file">{props.source.file!.split('/').pop()}</span>
        </Show>
      </div>

      <Show when={selectedAgent()}>
        {a => (
          <div class="ex-panel">
            <div class="ex-head">
              <strong style={{ color: a().color }}>{a().agentId}</strong>
              <Show when={a().explanation} fallback={<span class="sim-muted">did not take a decision in the last step (not activated, or the initial configuration).</span>}>
                {e => (
                  <span>
                    last step: <span class="tok-action">move</span> {e().move}
                    <Show when={e().line !== undefined}> · decided at line {e().line}</Show>
                    <span class="sim-muted"> · frame: {e().frame}</span>
                  </span>
                )}
              </Show>
              <span style={{ flex: 1 }} />
              <button class="sim-ghost sim-icon" onClick={() => setSelected(undefined)} title="Close">✕</button>
            </div>
            <Show when={a().explanation}>
              {e => (
                <>
                  <div class="ex-view">
                    <For each={Object.entries(e().view)}>
                      {([k, v]) => <div><span class="si-key">{k}</span> <span class="ex-result" title={v}>{v}</span></div>}
                    </For>
                  </div>
                  <Show when={e().calls.length} fallback={<p class="sim-muted ex-none">No definition was called.</p>}>
                    <CallTree calls={e().calls} depth={0} />
                  </Show>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>

      <div class="algorithm-body">
        <Code lines={lines()} marks={mainMarks()} />
      </div>

      <Show when={defLines().length > 0}>
        <div class="algorithm-defs">
          <div class="defs-title" onClick={() => setDefsOpen(v => !v)} title={defsOpen() ? 'Fold the definitions' : 'Show the definitions'}>
            {defsOpen() ? '▾' : '▸'} Definitions <span class="sim-muted">({defLines().length}; a click on a function name opens its definition)</span>
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
                          <For each={agents()}>{(a) => <span class="agent-marker return-marker" style={{ color: a.color }}>↩ {a.agentId}</span>}</For>
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
    </div>
  );
}
