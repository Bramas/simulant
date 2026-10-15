/**
 * The current configuration, for any project: the world, each agent (position, line, flags,
 * component fields, public state, memory) and the parameters, as trees whose nodes expand. What
 * is expanded is kept while stepping through the execution.
 */
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { InspectedState } from '@bramas/simulant-core/types/project';
import './StateInspector.css';

export interface StateInspectorProps {
  state: InspectedState;
  /** The agent selected on the canvas: shown expanded and highlighted. */
  selected?: number | null;
  onClearSelection?: () => void;
}

const isTree = (v: unknown): v is object => typeof v === 'object' && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);

/** A short one-line form of a value. */
function inline(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${inline(x)}`).join(', ')} }`;
  return String(v);
}
const SHORT = 40;

function Leaf(props: { value: unknown }): JSX.Element {
  const v = props.value;
  const kind = v === null || v === undefined ? 'none' : Array.isArray(v) || typeof v === 'object' ? 'compound' : typeof v;
  return <span class={`si-value si-${kind}`}>{inline(v)}</span>;
}

export function StateInspector(props: StateInspectorProps) {
  // Expanded nodes, by path; the default applies until a node is toggled.
  const [open, setOpen] = createSignal<Record<string, boolean>>({});
  const isOpen = (path: string, byDefault: boolean) => open()[path] ?? byDefault;
  const toggle = (path: string, byDefault: boolean) => setOpen(o => ({ ...o, [path]: !(o[path] ?? byDefault) }));

  function Node(p: { name: string; value: unknown; path: string; depth: number }): JSX.Element {
    const expandable = () => isTree(p.value) && inline(p.value).length > SHORT;
    const byDefault = p.depth === 0;
    return (
      <div class="si-node">
        <Show when={expandable()} fallback={
          <div class="si-row"><span class="si-toggle" /><span class="si-key">{p.name}</span><Leaf value={p.value} /></div>
        }>
          <div class="si-row si-clickable" onClick={() => toggle(p.path, byDefault)}>
            <span class="si-toggle">{isOpen(p.path, byDefault) ? '▾' : '▸'}</span>
            <span class="si-key">{p.name}</span>
            <Show when={!isOpen(p.path, byDefault)}>
              <span class="si-summary">{Array.isArray(p.value) ? `[${(p.value as unknown[]).length}]` : `{${Object.keys(p.value as object).length}}`} {inline(p.value).slice(0, SHORT)}…</span>
            </Show>
          </div>
          <Show when={isOpen(p.path, byDefault)}>
            <div class="si-children">
              <For each={Object.entries(p.value as object)}>
                {([k, v]) => <Node name={k} value={v} path={`${p.path}/${k}`} depth={p.depth + 1} />}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    );
  }

  const Fields = (p: { value: Record<string, unknown>; path: string }) => (
    <For each={Object.entries(p.value)} fallback={<div class="si-empty">nothing</div>}>
      {([k, v]) => <Node name={k} value={v} path={`${p.path}/${k}`} depth={1} />}
    </For>
  );

  return (
    <div class="state-inspector" data-state={JSON.stringify(props.state)}>
      <div class="si-section">
        <h4>World</h4>
        <Fields value={props.state.world} path="world" />
      </div>

      <div class="si-section">
        <h4>
          Agents
          <Show when={props.selected !== null && props.selected !== undefined}>
            <button class="si-clear" onClick={() => props.onClearSelection?.()}>Clear selection</button>
          </Show>
        </h4>
        <For each={props.state.agents}>
          {(agent) => {
            const path = `agent/${agent.id}`;
            const selected = () => props.selected === agent.id;
            const expanded = () => selected() || isOpen(path, false);
            return (
              <div class={`si-agent si-${agent.status}${selected() ? ' si-selected' : ''}`} data-agent={agent.id}>
                <div class="si-row si-clickable" onClick={() => toggle(path, false)}>
                  <span class="si-toggle">{expanded() ? '▾' : '▸'}</span>
                  <span class="si-swatch" style={{ 'background-color': agent.color }} />
                  <span class="si-agent-name">{agent.name}</span>
                  <span class="si-agent-summary">
                    node {String(agent.value.position)}
                    <Show when={agent.value.line !== undefined}> · line {String(agent.value.line)}</Show>
                    <Show when={agent.status !== 'correct'}> · {agent.status === 'hidden' ? 'gone' : 'faulty'}</Show>
                  </span>
                </div>
                <Show when={expanded()}>
                  <div class="si-children"><Fields value={agent.value} path={path} /></div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <div class="si-section">
        <div class="si-row si-clickable" onClick={() => toggle('params', false)}>
          <span class="si-toggle">{isOpen('params', false) ? '▾' : '▸'}</span>
          <h4 class="si-inline">Parameters</h4>
          <Show when={!isOpen('params', false)}><span class="si-summary">{inline(props.state.params)}</span></Show>
        </div>
        <Show when={isOpen('params', false)}>
          <div class="si-children"><Fields value={props.state.params} path="params" /></div>
        </Show>
      </div>
    </div>
  );
}
