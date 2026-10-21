import { createEffect, createMemo, createSignal, For, Index, Match, Show, Switch } from 'solid-js';
import { render } from 'solid-js/web';

import {
  analyze, build, byName, components, isCustom, locate, models, newDraft, sensorArgs, syntaxError, tasks, undeclared, useOf, widget, withCustom,
  type Draft, type Region, type Use,
} from './builder';
import type { SiteDiagnostic } from './compile';
import { Footer, highlight, Nav } from './layout';
import { goalText, type Entry, type Library, type Param } from './stdlib';
import { library, librarySources, sources } from './stdlib-sources';
import './site.css';

const firstSentence = (text = '') => text.replace(/\s+/g, ' ').match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;

/** `#model=…`, `#component=…` and `#task=…` come from the library page; `#draft=…` is a shared builder state. */
function initialDraft(): Draft {
  const hash = new URLSearchParams(location.hash.slice(1));
  const saved = hash.get('draft');
  if (saved) {
    try {
      const draft = JSON.parse(saved) as Draft;
      const lib = withCustom(librarySources, draft.custom ?? '') ?? library;
      if (byName(lib, draft.model)) return { ...newDraft(lib, draft.model), ...draft };
    } catch { /* an outdated or edited link: start afresh */ }
  }
  const model = hash.get('model');
  const draft = newDraft(library, model && byName(library, model) ? model : undefined);
  const task = hash.get('task');
  if (task && byName(library, task)?.kind === 'task') draft.task = task;
  const component = byName(library, hash.get('component') ?? '');
  const list = Object.keys(draft.lists)[0];
  if (component?.kind === 'component' && list && !selectedByFamily(draft).includes(component.name)) {
    draft.lists[list] = [useOf(library, component)];
  }
  return draft;
}

const selectedByFamily = (draft: Draft, lib = library) => byName(lib, draft.model)?.includes ?? [];

const Yours = (props: { entry: Entry }) => <Show when={isCustom(props.entry)}><span class="badge">yours</span></Show>;

function ValueInput(props: { lib: Library; param: Param; value: string; onChange: (value: string) => void; draft?: Draft }) {
  const w = () => widget(props.lib, props.param.type, props.draft);
  return (
    <Switch fallback={
      <input type="text" value={props.value} onInput={(e) => props.onChange(e.currentTarget.value)} aria-label={props.param.name} />
    }>
      <Match when={w().kind === 'select' && w()}>
        {(sel) => (
          <select onChange={(e) => props.onChange(e.currentTarget.value)} aria-label={props.param.name}>
            <For each={(sel() as Extract<ReturnType<typeof widget>, { kind: 'select' }>).options}>
              {(o) => <option value={o.value} title={o.detail} selected={o.value === props.value}>{o.label}</option>}
            </For>
            <Show when={!(sel() as Extract<ReturnType<typeof widget>, { kind: 'select' }>).options.some((o) => o.value === props.value)}>
              <option value={props.value} selected>{props.value}</option>
            </Show>
          </select>
        )}
      </Match>
      <Match when={w().kind === 'nat'}>
        <input type="number" min="0" value={props.value} onInput={(e) => props.onChange(e.currentTarget.value)} aria-label={props.param.name} />
      </Match>
      <Match when={w().kind === 'bool'}>
        <select onChange={(e) => props.onChange(e.currentTarget.value)} aria-label={props.param.name}>
          <option value="false" selected={props.value === 'false'}>false</option>
          <option value="true" selected={props.value === 'true'}>true</option>
        </select>
      </Match>
    </Switch>
  );
}

function SensorInput(props: { lib: Library; value: string; onChange: (value: string) => void; param: Param }) {
  const name = () => props.value.trim().split(/\s+/)[0];
  const args = () => props.value.trim().split(/\s+/).slice(1);
  const sensor = () => byName(props.lib, name());
  const options = () => (widget(props.lib, 'Sensor') as Extract<ReturnType<typeof widget>, { kind: 'sensor' }>).options;
  const set = (sensorName: string, values: string[]) => props.onChange([sensorName, ...values].join(' '));
  return (
    <div class="sensor-input">
      <select
        aria-label={props.param.name}
        onChange={(e) => {
          const next = byName(props.lib, e.currentTarget.value);
          set(e.currentTarget.value, next ? sensorArgs(next).map(() => '1') : []);
        }}
      >
        <For each={options()}>{(s) => <option value={s.name} selected={s.name === name()}>{s.name}{isCustom(s) ? ' (yours)' : ''}</option>}</For>
        <Show when={!options().some((s) => s.name === name())}>
          <option value={name()} selected>{name()}</option>
        </Show>
      </select>
      <Index each={sensor() ? sensorArgs(sensor()!) : []}>
        {(p, i) => (
          <label class="inline-arg">
            {p().name}
            <input type="number" min="0" value={args()[i] ?? '1'} onInput={(e) => set(name(), args().map((a, j) => (j === i ? e.currentTarget.value : a)))} />
          </label>
        )}
      </Index>
      <Show when={sensor()?.doc}><p class="hint">{firstSentence(sensor()!.doc)}</p></Show>
    </div>
  );
}

function ComponentPicker(props: { lib: Library; draft: Draft; list: string; onChange: (uses: Use[]) => void }) {
  const uses = () => props.draft.lists[props.list] ?? [];
  const included = () => selectedByFamily(props.draft, props.lib);
  const available = () => components(props.lib).filter((c) => !included().includes(c.name));
  const toggle = (c: Entry, on: boolean) =>
    props.onChange(on ? [...uses(), useOf(props.lib, c)] : uses().filter((u) => u.name !== c.name));
  const setArg = (name: string, index: number, value: string) =>
    props.onChange(uses().map((u) => (u.name === name ? { ...u, args: u.args.map((a, i) => (i === index ? value : a)) } : u)));

  return (
    <div class="picker">
      <For each={available()}>
        {(c) => {
          const use = () => uses().find((u) => u.name === c.name);
          return (
            <div class="pick" classList={{ on: !!use() }}>
              <label class="pick-head">
                <input type="checkbox" aria-label={c.name} checked={!!use()} onChange={(e) => toggle(c, e.currentTarget.checked)} />
                <code>{c.name}</code>
                <Yours entry={c} />
              </label>
              <p class="hint">{firstSentence(c.doc)}</p>
              <Show when={use() && c.params.length}>
                <div class="pick-args">
                  <Index each={c.params}>
                    {(p, i) => (
                      <label class="inline-arg">
                        {p().name}
                        <ValueInput lib={props.lib} param={p()} value={use()!.args[i]} onChange={(v) => setArg(c.name, i, v)} />
                      </label>
                    )}
                  </Index>
                </div>
              </Show>
              <Show when={c.reads?.length}>
                <p class="hint">Adds <For each={c.reads}>{(r) => <code>param {r.name}</code>}</For></p>
              </Show>
            </div>
          );
        }}
      </For>
      <For each={undeclared(props.lib, uses())}>
        {(u) => (
          <div class="pick on missing">
            <label class="pick-head">
              <input type="checkbox" aria-label={u.name} checked onChange={() => props.onChange(uses().filter((v) => v !== u))} />
              <code>{u.name}</code>
            </label>
            <p class="hint">No longer declared: declare it in your code, or uncheck it.</p>
          </div>
        )}
      </For>
    </div>
  );
}

type Problem = { line: number; column?: number; message: string };

/** Keeps the current line's indentation on Enter, as layout-sensitive code needs. */
function indentOnEnter(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  const area = e.currentTarget;
  const before = area.value.slice(0, area.selectionStart);
  const indent = /[ ]*/.exec(before.slice(before.lastIndexOf('\n') + 1))![0];
  if (!indent) return;
  e.preventDefault();
  const text = `\n${indent}`;
  // `insertText` keeps the browser's undo history; `setRangeText` is the fallback.
  if (!document.execCommand('insertText', false, text)) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** A plain code editor whose line numbers are those the diagnostics give. */
function CodeArea(props: { label: string; value: string; onInput: (value: string) => void; problems: Problem[]; placeholder?: string; minRows?: number }) {
  const rows = () => Math.max(props.minRows ?? 4, props.value.split('\n').length + 1);
  const bad = () => new Set(props.problems.map((p) => p.line));
  return (
    <div class="code-area">
      <div class="editor" classList={{ invalid: props.problems.length > 0 }}>
        <pre class="gutter" aria-hidden="true">
          <For each={Array.from({ length: rows() }, (_, i) => i + 1)}>{(n) => <span classList={{ bad: bad().has(n) }}>{n}{'\n'}</span>}</For>
        </pre>
        <textarea
          aria-label={props.label}
          rows={rows()}
          value={props.value}
          placeholder={props.placeholder}
          spellcheck={false}
          autocapitalize="off"
          autocomplete="off"
          wrap="off"
          onKeyDown={indentOnEnter}
          onInput={(e) => props.onInput(e.currentTarget.value)}
        />
      </div>
      <Show when={props.problems.length}>
        <ul class="diagnostics">
          <For each={props.problems}>{(p) => <li><code>line {p.line}{p.column ? `:${p.column}` : ''}</code> {p.message}</li>}</For>
        </ul>
      </Show>
    </div>
  );
}

const regionLabel: Record<Region['name'], string> = { custom: 'your code', algorithm: 'algorithm' };

/** Where a diagnostic is: its line in the file, and in the text area it came from. */
function place(regions: Region[], d: SiteDiagnostic): string {
  if (d.file !== 'main.sim') return `${d.file}:${d.line}`;
  const mine = locate(regions, d);
  return mine ? `line ${d.line} (${regionLabel[mine.region]}, line ${mine.line})` : `line ${d.line}`;
}

const customPlaceholder = `-- Your own sensors, components, tasks and definitions, e.g.
/-- Whether another robot stands on my node. -/
sensor notAlone (C : Config) (me : Agent) : Bool :=
  C.agents.any fun b => b ≠ me ∧ present b ∧ b.pos = me.pos`;

function Builder() {
  const [draft, setDraft] = createSignal<Draft>(initialDraft());
  const [copied, setCopied] = createSignal(false);
  const update = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  // The library with the user's declarations; while their text does not parse, the last that did.
  const lib = createMemo<Library>((last) => withCustom(librarySources, draft().custom) ?? last, library);
  const family = () => byName(lib(), draft().model);
  const params = () => family()?.params ?? [];
  const analysis = createMemo(() => analyze(lib(), draft()));
  const built = createMemo(() => build(lib(), sources, draft()));

  createEffect(() => {
    history.replaceState(null, '', `#draft=${encodeURIComponent(JSON.stringify(draft()))}`);
  });

  const chooseModel = (model: string) => {
    const fresh = newDraft(lib(), model);
    const d = draft();
    setDraft({ ...fresh, task: d.task, agents: d.agents, placement: d.placement, domains: d.domains, experiment: d.experiment, algorithm: d.algorithm, custom: d.custom, body: d.body });
  };
  // A custom model family whose declaration was removed: fall back to the first one.
  createEffect(() => {
    if (!family()) chooseModel(models(lib())[0].name);
  });

  const problems = (region: Region['name']) => {
    const found = built().compiled.diagnostics.flatMap((d) => {
      const mine = locate(built().regions, d);
      return mine?.region === region ? [{ line: mine.line, column: mine.column, message: d.message }] : [];
    });
    const syntax = region === 'custom' && !found.length && built().compiled.diagnostics.length ? syntaxError(draft().custom) : undefined;
    return syntax ? [syntax] : found;
  };
  const errorLines = () => new Set(built().compiled.diagnostics.filter((d) => d.file === 'main.sim').map((d) => d.line));
  const userLine = (n: number) => built().regions.some((r) => n >= r.start && n < r.start + r.lines);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(built().text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the code can still be selected */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([built().text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${draft().experiment || 'experiment'}.sim` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const slug = () => (draft().experiment || 'experiment').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const registration = () => `export const projects = { '${slug()}': simProject(main, '${draft().experiment}') };`;
  const diagnostics = () => built().compiled.diagnostics;
  const summary = () => {
    const e = built().experiment;
    if (!e) return [];
    const m = e.model;
    return [
      ['Topology', m.topology.kind === 'ring' ? 'static ring of size N' : `dynamic ring, at most ${(m.topology as { k: number }).k} missing edge(s) per round`],
      ['Round', m.round.toUpperCase()],
      ['Memory', m.memory === 'oblivious' ? 'oblivious (no private state across rounds)' : 'persistent'],
      ['Orientation', m.frame.kind === 'common' ? 'common chirality' : m.frame.kind === 'dynamicReflection' ? 'chosen by the adversary at each activation' : `persistent, in ${(m.frame as { field: string }).field}`],
      ['Sensors', m.sensors.map((s) => s.name).join(', ') || 'none'],
      ['Components', m.components.map((c) => c.name).join(', ') || 'none'],
      ['Goal', `${e.task.name}: ${goalText[e.task.goal] ?? e.task.goal}`],
      ['Parameters', e.params.map((p) => p.name).join(', ')],
    ];
  };

  return (
    <>
      <Nav page="builder" root="../" />
      <header class="page-header">
        <p class="eyebrow">Start an experiment</p>
        <h1>Model builder</h1>
        <p class="lead">
          Choose a model family, its components and a task from the <a href="../library/">standard library</a>.
          Add pieces of your own and write the algorithm: the builder writes the <code>.sim</code> file and compiles it in your browser after each edit.
        </p>
      </header>

      <div class="builder">
        <form class="builder-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>1. Model family</legend>
            <div class="choices">
              <For each={models(lib())}>
                {(m) => (
                  <label class="choice" classList={{ on: draft().model === m.name }}>
                    <input type="radio" name="model" aria-label={m.name} checked={draft().model === m.name} onChange={() => chooseModel(m.name)} />
                    <code>{m.name}</code>
                    <Yours entry={m} />
                    <span class="hint">{firstSentence(m.doc)}</span>
                  </label>
                )}
              </For>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. Model arguments</legend>
            <Show when={family()?.includes?.length}>
              <p class="hint">Always includes <For each={family()!.includes}>{(n) => <code>{n}</code>}</For></p>
            </Show>
            <div class="args">
              <For each={params().filter((p) => p.type !== 'List Component')}>
                {(p) => (
                  <label class="arg">
                    <span class="arg-name">{p.name} <small>{p.type}</small></span>
                    <Show
                      when={p.type === 'Sensor'}
                      fallback={<ValueInput lib={lib()} param={p} draft={draft()} value={draft().args[p.name] ?? ''} onChange={(v) => update({ args: { ...draft().args, [p.name]: v } })} />}
                    >
                      <SensorInput lib={lib()} param={p} value={draft().args[p.name] ?? ''} onChange={(v) => update({ args: { ...draft().args, [p.name]: v } })} />
                    </Show>
                  </label>
                )}
              </For>
            </div>
          </fieldset>

          <For each={params().filter((p) => p.type === 'List Component')}>
            {(p) => (
              <fieldset>
                <legend>3. Components <small>({p.name})</small></legend>
                <ComponentPicker lib={lib()} draft={draft()} list={p.name} onChange={(uses) => update({ lists: { ...draft().lists, [p.name]: uses } })} />
                <p class="hint">Components, sensors and tasks declared in <a href="#custom" onClick={(e) => { e.preventDefault(); document.getElementById('custom')?.scrollIntoView({ behavior: 'smooth' }); }}>your code</a> are listed with the library’s.</p>
              </fieldset>
            )}
          </For>

          <fieldset>
            <legend>4. Task</legend>
            <div class="choices">
              <For each={tasks(lib())}>
                {(t) => (
                  <label class="choice" classList={{ on: draft().task === t.name }}>
                    <input type="radio" name="task" aria-label={t.name} checked={draft().task === t.name} onChange={() => update({ task: t.name })} />
                    <code>{t.name}</code>
                    <Yours entry={t} />
                    <span class="hint">{firstSentence(t.doc)}</span>
                  </label>
                )}
              </For>
            </div>
          </fieldset>

          <fieldset>
            <legend>5. Experiment</legend>
            <div class="args">
              <label class="arg">
                <span class="arg-name">Experiment name</span>
                <input type="text" value={draft().experiment} onInput={(e) => update({ experiment: e.currentTarget.value })} />
              </label>
              <label class="arg">
                <span class="arg-name">Algorithm name</span>
                <input type="text" value={draft().algorithm} onInput={(e) => update({ algorithm: e.currentTarget.value })} />
              </label>
              <label class="arg">
                <span class="arg-name">agents</span>
                <input type="text" value={draft().agents} onInput={(e) => update({ agents: e.currentTarget.value })} />
              </label>
              <label class="arg">
                <span class="arg-name">Initial positions</span>
                <select onChange={(e) => update({ placement: e.currentTarget.value as Draft['placement'] })}>
                  <option value="same" selected={draft().placement === 'same'}>All on node 0</option>
                  <option value="spread" selected={draft().placement === 'spread'}>Agent i on node i</option>
                </select>
              </label>
              <For each={analysis().params}>
                {(p) => (
                  <label class="arg">
                    <span class="arg-name">param {p.name} <small>{p.type}</small> in</span>
                    <input
                      type="text"
                      value={p.domain}
                      placeholder="its whole type"
                      onInput={(e) => update({ domains: { ...draft().domains, [p.name]: e.currentTarget.value } })}
                    />
                  </label>
                )}
              </For>
            </div>
            <p class="hint">Parameters come from the topology (<code>N</code>) and from the components that read them.</p>
          </fieldset>

          <fieldset id="custom">
            <legend>6. Your own pieces</legend>
            <p class="hint">
              Sensors, components, tasks and definitions of your own, written as in a <code>.sim</code> file
              (see <a href="../guide/#custom">the guide</a>). They go after the imports, and join the choices above.
            </p>
            <CodeArea label="Your own pieces" value={draft().custom} placeholder={customPlaceholder} minRows={5} problems={problems('custom')} onInput={(custom) => update({ custom })} />
          </fieldset>

          <fieldset id="algorithm">
            <legend>7. Algorithm <small>({draft().algorithm})</small></legend>
            <p class="hint">
              Its procedures and <code>main</code>. The builder writes <code>Pub</code>, <code>output</code> and <code>init</code> for
              the task’s outputs; write your own here to replace them.
            </p>
            <CodeArea label="Algorithm" value={draft().body ?? built().skeleton} minRows={4} problems={problems('algorithm')} onInput={(body) => update({ body })} />
            <Show when={draft().body !== undefined}>
              <p class="hint"><button type="button" onClick={() => update({ body: undefined })}>Reset to the skeleton</button></p>
            </Show>
          </fieldset>
        </form>

        <section class="builder-output" aria-live="polite">
          <div class={`status ${built().experiment ? 'pass' : 'fail'}`}>
            <strong>{built().experiment ? 'Compiles' : `${diagnostics().length} error${diagnostics().length === 1 ? '' : 's'}`}</strong>
            <span>{built().experiment ? 'The experiment type-checks against the standard library.' : 'The compiler rejects this file.'}</span>
          </div>
          <For each={analysis().warnings}>
            {(w) => (
              <div class="notice">
                <span>{w.message}</span>
                <Show when={w.fix}>
                  {(fix) => (
                    <button type="button" onClick={() => {
                      const component = byName(lib(), fix().component)!;
                      update({ lists: { ...draft().lists, [fix().list]: [...(draft().lists[fix().list] ?? []), useOf(lib(), component)] } });
                    }}>Add it</button>
                  )}
                </Show>
              </div>
            )}
          </For>
          <Show when={diagnostics().length}>
            <ul class="diagnostics">
              <For each={diagnostics()}>
                {(d) => <li><code>{place(built().regions, d)}</code> {d.message}</li>}
              </For>
            </ul>
          </Show>
          <div class="code-actions">
            <span>{draft().experiment || 'experiment'}.sim</span>
            <button type="button" onClick={copy}>{copied() ? 'Copied' : 'Copy'}</button>
            <button type="button" onClick={download}>Download</button>
          </div>
          <pre class="code numbered"><code>
            <For each={built().text.split('\n')}>
              {(line, i) => <span class="line" classList={{ mine: userLine(i() + 1), error: errorLines().has(i() + 1) }}>{highlight(line)}{'\n'}</span>}
            </For>
          </code></pre>
          <Show when={summary().length}>
            <dl class="facts summary">
              <For each={summary()}>{([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>}</For>
            </dl>
          </Show>
          <div class="next">
            <h3>Next</h3>
            <ol>
              <li>Create a project: <code>npm create @bramas/simulant@latest my-project</code></li>
              <li>Replace <code>src/main.sim</code> with this file.</li>
              <li>Register the experiment in <code>src/projects.ts</code>:
                <pre class="code"><code>{highlight(registration())}</code></pre>
              </li>
              <li>Run <code>npm run dev</code> and write <code>main</code>; the page reloads on every save. The <a href="../guide/#algorithms">guide</a> explains statements and sensors.</li>
              <li>Check every execution: <code>npx simulant check-all -p {slug()}</code></li>
            </ol>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}

render(() => <Builder />, document.getElementById('root')!);
