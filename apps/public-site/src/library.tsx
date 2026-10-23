import { createMemo, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';

import { builtinOptions } from './builder';
import { Code, Footer, highlight, Nav, Prose } from './layout';
import { goalText, signature, type Entry, type Kind } from './stdlib';
import { library } from './stdlib-sources';
import './site.css';

const sections: { kind: Kind[]; id: string; title: string; lead: string }[] = [
  { kind: ['model'], id: 'models', title: 'Model families', lead: 'A model fixes the space, the observation, the frames, the sensors, memory, the scheduler and components. A family builds one from its arguments.' },
  { kind: ['space'], id: 'spaces', title: 'Spaces', lead: 'Graphs: positions and, for each, its ordered neighbors (its ports). An agent sees part of the space through its observation.' },
  { kind: ['component'], id: 'components', title: 'Components', lead: 'A component owns world and agent fields, raises flags, adds actions, and acts at the hook points of each step.' },
  { kind: ['scheduler'], id: 'schedulers', title: 'Schedulers', lead: 'A scheduler chooses, at each step, the agents that take the next event of their Look-Compute-Move cycle; it says how the cycle is cut into atomic events, and which executions count.' },
  { kind: ['sensor'], id: 'sensors', title: 'Sensors', lead: 'Everything an algorithm knows comes from the sensors of its model.' },
  { kind: ['task'], id: 'tasks', title: 'Tasks', lead: 'A task gives each configuration a verdict; its goal says which executions solve it.' },
  { kind: ['type', 'definition'], id: 'types', title: 'Types and definitions', lead: 'Enumerations used as arguments of the pieces above.' },
  { kind: ['algorithm', 'experiment'], id: 'examples', title: 'Examples', lead: 'Small algorithms and experiments illustrating the language.' },
];

const builtins = [
  { type: 'Space', options: [
    { value: 'Graphs.Dynamic space k', label: 'Dynamic', detail: 'The space, where the adversary removes at most k edges at the start of each step.' },
  ] },
  { type: 'Observation', options: [
    { value: 'Observe.radius r', label: 'Radius', detail: 'The r-hop view: the positions at distance at most r, and the edges with an endpoint closer than r.' },
    { value: 'Observe.full', label: 'Full', detail: 'Every position and edge (finite spaces).' },
  ] },
  { type: 'Frames', options: [
    ...builtinOptions.Frames.filter((o) => !o.value.startsWith('Frames.portPermutations')),
    { value: 'Frames.portPermutations .perLook / .perRobot', label: 'Port permutations', detail: 'The ports through a permutation chosen at each Look, or fixed per robot (among := .all or .symmetries).' },
  ] },
  { type: 'Memory', options: builtinOptions.Memory },
  { type: 'Instant', options: builtinOptions.Instant },
  { type: 'Fairness', options: builtinOptions.Fairness },
  { type: 'Symmetries', options: builtinOptions.Symmetries },
];

const anchor = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '-');
const builderLink = (e: Entry) =>
  e.kind === 'model' ? `../builder/#model=${e.name}`
    : e.kind === 'component' ? `../builder/#component=${e.name}`
      : e.kind === 'task' ? `../builder/#task=${e.name}`
        : undefined;

function Facts(props: { entry: Entry }) {
  const e = props.entry;
  const fields = (fs?: { name: string; type: string }[]) => fs?.map((f) => `${f.name} : ${f.type}`);
  const rows: [string, string[] | undefined][] = [
    ['Reads parameters', e.reads?.map((r) => `param ${r.name} : ${r.type}`)],
    ['Needs components', e.requires],
    ['Includes', e.includes],
    ['World fields', fields(e.world?.length && e.kind === 'component' ? e.world : undefined)],
    ['Agent fields', fields(e.agent)],
    ['Fields', fields(e.kind === 'type' ? e.world : undefined)],
    ['Flags', e.flags],
    ['Actions', e.actions],
    ['Hooks', e.hooks],
    ['Implements', e.implements ? [e.implements] : undefined],
    ['Reads from agents', e.outputs],
    ['Goal', e.goal ? [goalText[e.goal] ?? e.goal] : undefined],
    ['Events', e.events ? [e.events] : undefined],
    ['Fairness', e.fairness ? [e.fairness] : undefined],
    ['Symmetries', e.attrs.filter((a) => a.startsWith('equivariant')).map((a) => a.replace('equivariant ', ''))],
  ];
  const shown = rows.filter(([, values]) => values?.length);
  return (
    <Show when={shown.length}>
      <dl class="facts">
        <For each={shown}>
          {([label, values]) => (
            <>
              <dt>{label}</dt>
              <dd><For each={values}>{(v) => <code>{v}</code>}</For></dd>
            </>
          )}
        </For>
      </dl>
    </Show>
  );
}

function Card(props: { entry: Entry }) {
  const e = props.entry;
  const link = builderLink(e);
  return (
    <article class="entry" id={anchor(e.name)}>
      <header>
        <h3><a href={`#${anchor(e.name)}`}>{e.name}</a></h3>
        <span class="entry-module">{e.module}</span>
      </header>
      <pre class="signature"><code>{highlight(signature(e))}</code></pre>
      <Show when={e.doc}>{(doc) => <div class="entry-doc"><Prose text={doc()} /></div>}</Show>
      <Facts entry={e} />
      <div class="entry-actions">
        <details>
          <summary>Source</summary>
          <Code code={e.source} />
        </details>
        <Show when={link}>{(href) => <a class="text-link" href={href()}>Use in the builder →</a>}</Show>
      </div>
    </article>
  );
}

function Library() {
  const [query, setQuery] = createSignal('');
  const matches = (e: Entry) => {
    const q = query().trim().toLowerCase();
    return !q || `${e.name} ${e.doc ?? ''}`.toLowerCase().includes(q);
  };
  const grouped = createMemo(() =>
    sections.map((s) => ({ ...s, entries: library.entries.filter((e) => s.kind.includes(e.kind) && matches(e)) })));

  return (
    <>
      <Nav page="library" root="../" />
      <header class="page-header">
        <p class="eyebrow">Reference</p>
        <h1>Standard library</h1>
        <p class="lead">
          The models, components, sensors and tasks every project can import, read from their <code>.sim</code> sources.
          Pick some in the <a href="../builder/">model builder</a> to start an experiment.
        </p>
        <Code code={'import "std/models.sim"   -- model families, with the spaces, sensors, components and tasks they use'} />
      </header>

      <div class="docs-layout">
        <aside class="toc" aria-label="Library contents">
          <input
            class="search"
            type="search"
            placeholder="Filter by name or text"
            aria-label="Filter the library"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <For each={grouped()}>
            {(s) => (
              <Show when={s.entries.length}>
                <a class="toc-section" href={`#${s.id}`}>{s.title}</a>
                <ul>
                  <For each={s.entries}>{(e) => <li><a href={`#${anchor(e.name)}`}>{e.name}</a></li>}</For>
                </ul>
              </Show>
            )}
          </For>
          <a class="toc-section" href="#builtins">Built in</a>
        </aside>

        <main class="docs-main">
          <For each={grouped()}>
            {(s) => (
              <Show when={s.entries.length}>
                <section class="docs-section" id={s.id}>
                  <h2>{s.title}</h2>
                  <p class="section-lead">{s.lead}</p>
                  <For each={s.entries}>{(e) => <Card entry={e} />}</For>
                </section>
              </Show>
            )}
          </For>
          <Show when={grouped().every((s) => !s.entries.length)}>
            <p class="empty">Nothing in the library matches “{query()}”.</p>
          </Show>

          <section class="docs-section" id="builtins">
            <h2>Built in</h2>
            <p class="section-lead">
              Observations, frames, memory, symmetry reduction, dynamic spaces and the step itself (its events and pending decisions) are implemented by the semantic core. Model families take them as arguments.
            </p>
            <For each={builtins}>
              {(b) => (
                <article class="entry">
                  <header><h3>{b.type}</h3></header>
                  <dl class="facts wide">
                    <For each={b.options}>
                      {(o) => (
                        <>
                          <dt><code>{o.value}</code></dt>
                          <dd>{o.detail}</dd>
                        </>
                      )}
                    </For>
                  </dl>
                </article>
              )}
            </For>
          </section>
        </main>
      </div>
      <Footer />
    </>
  );
}

render(() => <Library />, document.getElementById('root')!);
