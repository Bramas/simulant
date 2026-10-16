/**
 * The simulator page, in two views. The simulation: an execution of the selected experiment,
 * step by step. The execution toolbar is on top (rounds, the adversary's choices, the path), the
 * configuration and its state on the left, the algorithm on the right, the settings and saved
 * settings below, then the configuration graph. The model (`#model`): the experiment's semantics
 * and the declarations it is built from, as written, to compare with the paper.
 */
import { batch, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import type { ExecutionLike, ProjectType, PredefinedSetting } from '@bramas/simulant-core/types/project';
import { ConfigGraphGenerator } from './components/ConfigGraphGenerator';
import { formValues, GenericEditor } from './components/GenericEditor';
import { AlgorithmViewer } from './components/AlgorithmViewer';
import { StateInspector } from './components/StateInspector';
import { ModelView } from './components/ModelView';
import { SettingsLibrary, type SavedSetting } from './components/SettingsLibrary';
import { BranchPicker, type Branch } from './components/BranchPicker';
import { distinguishing, distinguishingChoices } from './sim/branches';

export type { PredefinedSetting } from '@bramas/simulant-core/types/project';

export interface SimulatorAppProps {
  projects: Record<string, ProjectType<any, any>>;
  title?: string;
  storageKey?: string;
  getPredefinedSettings?: (project: string) => PredefinedSetting[];
  createGraphWorker?: () => Worker;
}

const DEFAULT_STORAGE_KEY = 'project_settings_v2';
const THEME_KEY = 'simulant-theme';
const CANVAS = { width: 500, height: 300 };

// Browser storage may be unavailable (private windows, blocked site data): the page works without it.
function readStorage(key: string): any {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved: nothing else to do.
  }
}

function getSavedSettings(storageKey: string, project: string): SavedSetting[] {
  return (readStorage(storageKey) ?? {})[project] ?? [];
}

function saveSettings(storageKey: string, project: string, name: string, settings: any, path?: number[]) {
  const all = readStorage(storageKey) ?? {};
  const existing: SavedSetting[] = all[project] ?? [];
  let unique = name;
  for (let counter = 1; existing.some(s => s.name === unique); counter++) unique = `${name} (${counter})`;
  all[project] = [...existing, { name: unique, settings, path }];
  writeStorage(storageKey, all);
}

function deleteSettings(storageKey: string, project: string, name: string) {
  const all = readStorage(storageKey) ?? {};
  if (!all[project]) return;
  all[project] = all[project].filter((s: SavedSetting) => s.name !== name);
  writeStorage(storageKey, all);
}

function encodeSettingForUrl(project: string, settings: any, path?: number[]) {
  return btoa(encodeURIComponent(JSON.stringify({ project, settings, path })));
}

function decodeSettingFromUrl(encoded: string) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

/** Whether a key press belongs to a form field rather than to the page's shortcuts. */
const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};

const VERDICT_TEXT = { success: 'success', failure: 'failure', inProgress: 'not yet' } as const;
/** What a configuration's verdict says about the execution, under each goal of the task. */
const VERDICT_TITLE = {
  eventually: {
    success: 'The task is achieved: the execution succeeds here.',
    failure: 'The task fails in this configuration.',
    inProgress: 'The task is not achieved yet.',
  },
  eventuallyAlways: {
    success: 'The task holds in this configuration; the execution succeeds if it keeps holding from some round on.',
    failure: 'The task fails in this configuration.',
    inProgress: 'The task does not hold in this configuration (yet).',
  },
  safety: {
    success: 'No failure in this configuration.',
    failure: 'The task fails in this configuration.',
    inProgress: 'No failure in this configuration.',
  },
} as const;

export const SimulatorApp: Component<SimulatorAppProps> = (props) => {
  const Projects = props.projects;
  const projectKeys = Object.keys(Projects);
  const storageKey = props.storageKey ?? DEFAULT_STORAGE_KEY;
  const getPredefinedSettings = props.getPredefinedSettings ?? (() => []);

  const [project, setProject] = createSignal(projectKeys[0]);
  const [projectUserSettings, setProjectUserSettings] = createSignal<any>(null);
  // The path in the execution tree: [initial configuration, child index, child index, ...].
  const [executionPath, setExecutionPath] = createSignal<number[]>([0]);
  const [indexInPath, setIndexInPath] = createSignal(0);
  const [selectedAgent, setSelectedAgent] = createSignal<any>(null);
  // The view, in the URL's hash so that a link can open the model.
  const viewOfHash = () => window.location.hash === '#model' ? 'model' as const : 'simulation' as const;
  const [view, setView] = createSignal(viewOfHash());
  const showView = (v: 'simulation' | 'model') => {
    setView(v);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${v === 'model' ? '#model' : ''}`);
  };
  const onHash = () => setView(viewOfHash());
  window.addEventListener('hashchange', onHash);
  onCleanup(() => window.removeEventListener('hashchange', onHash));
  const [showConfigGraph, setShowConfigGraph] = createSignal(false);
  const [setupLog, setSetupLog] = createSignal('');
  const [toast, setToast] = createSignal('');
  let canvas: HTMLCanvasElement | undefined;

  const goTo = (path: number[], index = 0) => batch(() => {
    setExecutionPath(path.length ? path : [0]);
    setIndexInPath(Math.min(index, Math.max(0, path.length - 1)));
    setSelectedAgent(null);
  });

  // Theme: the system's, unless the user picked one (remembered).
  const systemDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = createSignal<'light' | 'dark' | null>(readStorage(THEME_KEY));
  const dark = () => (theme() ?? (systemDark() ? 'dark' : 'light')) === 'dark';
  createEffect(() => {
    const t = theme();
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  });
  const toggleTheme = () => {
    const next = dark() ? 'light' : 'dark';
    setTheme(next);
    writeStorage(THEME_KEY, next);
  };

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(''), 2500);
  };
  onCleanup(() => clearTimeout(toastTimer));

  // Development updates of the sources (plan, Section 6.7): `projectRevision` restarts the
  // project, `redrawTick` redraws the current configuration, `updateNotice` says what happened.
  const [projectRevision, setProjectRevision] = createSignal(0);
  const [redrawTick, setRedrawTick] = createSignal(0);
  const [updateNotice, setUpdateNotice] = createSignal<{ outOfDate: boolean; text: string } | null>(null);
  createEffect(() => {
    const current = Projects[project()];
    setUpdateNotice(null);
    if (!current.subscribe) return;
    const unsubscribe = current.subscribe(update => {
      if (update.kind === 'redraw') {
        setUpdateNotice(n => n?.outOfDate ? null : n);
        setRedrawTick(t => t + 1);
      } else if (update.kind === 'failed') {
        setUpdateNotice({ outOfDate: true, text: update.diagnostics.join('\n') });
      } else {
        const { settings, notes } = update.adjust(projectUserSettings());
        batch(() => {
          setUpdateNotice(notes.length ? { outOfDate: false, text: notes.join('\n') } : null);
          setProjectUserSettings(settings);
          goTo([0]);
          setProjectRevision(r => r + 1);
        });
      }
    });
    onCleanup(unsubscribe);
  });

  const startedProject = createMemo(() => {
    projectRevision();
    try {
      const current = Projects[project()];
      const baseModel = current.setup(projectUserSettings());
      setSetupLog('');
      return { baseModel, execution: current.execute(baseModel) };
    } catch (e) {
      console.error('Project setup failed:', e);
      setSetupLog(e instanceof Error ? e.message : String(e));
      return { baseModel: null, execution: null };
    }
  });

  const canExplore = createMemo(() => !updateNotice()?.outOfDate && !!startedProject().execution);
  const currentPath = () => executionPath().slice(0, indexInPath() + 1);

  const config = createMemo(() => {
    const { execution } = startedProject();
    if (!execution) return null;
    try {
      return execution.get(currentPath());
    } catch (e) {
      console.error('Error getting config at path', executionPath(), e);
      return null;
    }
  });

  // The settings the execution runs: the form's defaults, overridden by the user's.
  const editorSchema = createMemo(() => (projectRevision(), Projects[project()].editorSchema));
  const effectiveSettings = createMemo(() => {
    const schema = editorSchema();
    return schema ? formValues(schema, projectUserSettings()) : projectUserSettings() ?? {};
  });

  const settingsWarnings = createMemo(() => {
    projectRevision();
    try {
      return Projects[project()].settingsWarnings?.(projectUserSettings()) ?? [];
    } catch (e) {
      return [`Could not check initial settings: ${e instanceof Error ? e.message : String(e)}`];
    }
  });

  /** The task's verdict on the current configuration, with what it means under the task's goal. */
  const verdict = createMemo(() => {
    redrawTick();
    const c = config();
    const { execution, baseModel } = startedProject();
    const current = Projects[project()];
    if (!c || !execution) return undefined;
    try {
      if (current.verdict) {
        const { verdict: v, goal } = current.verdict(c, baseModel);
        return { status: v, text: VERDICT_TEXT[v], title: VERDICT_TITLE[goal][v] };
      }
      const path = currentPath();
      const v = current.executionStatusChecker?.(c, baseModel, path.map((_, i) => execution.get(path.slice(0, i + 1))));
      return v && { status: v, text: VERDICT_TEXT[v], title: "The task's verdict on this configuration" };
    } catch {
      return undefined;
    }
  });

  const childCount = createMemo(() => {
    const { execution } = startedProject();
    if (!execution || !config()) return 0;
    try {
      return execution.getChildrenCount(currentPath());
    } catch {
      return 0;
    }
  });

  /** The branches of the step that leads to `path`: its siblings, with their witnesses. */
  const branchesAt = (path: number[], withVerdicts = true): Branch[] => {
    const { execution, baseModel } = startedProject();
    if (!execution) return [];
    try {
      const count = execution.getSiblingCount(path);
      const parent = path.slice(0, -1);
      const labels = Array.from({ length: count }, (_, i) =>
        parent.length ? execution.getEdgeLabel?.([...parent, i]) || '' : `initial configuration ${i}`);
      const witness = execution.getEdgeWitness;
      const shorts = parent.length && witness
        ? distinguishingChoices(Array.from({ length: count }, (_, i) => witness([...parent, i])))
        : distinguishing(labels);
      const verdict = Projects[project()].verdict;
      return labels.map((label, i) => ({
        index: i, label, short: shorts[i],
        verdict: verdict && withVerdicts && count <= 200 ?verdict(execution.get([...parent, i]), baseModel).verdict : undefined,
      }));
    } catch {
      return [];
    }
  };
  const branches = createMemo(() => (redrawTick(), config() ? branchesAt(currentPath()) : []));
  const [pickingBranch, setPickingBranch] = createSignal(false);
  /** What distinguishes the step to round `i` from the other branches of that round. */
  const stepLabel = (i: number) => {
    if (i === 0) return 'initial configuration';
    const path = executionPath().slice(0, i + 1);
    const b = branchesAt(path, false)[path[i]];
    return b ? b.short : '';
  };
  /** Draws a branch of the current step, small. */
  const drawBranch = (index: number, ctx: CanvasRenderingContext2D, size: number) => {
    const { execution, baseModel } = startedProject();
    const draw = Projects[project()].drawConfig;
    if (!execution || !draw) return;
    const c = execution.get([...currentPath().slice(0, -1), index]);
    draw(ctx, c, baseModel, { centerX: size / 2, centerY: size / 2, radius: size * 0.34, nodeRadius: 4, agentRadius: 4, showNodeLabels: false });
  };

  const inspected = createMemo(() => {
    redrawTick();
    const c = config();
    const model = startedProject().baseModel;
    return c && model ? Projects[project()].inspect?.(c, model) : undefined;
  });

  const algorithmViewInfo = createMemo(() => {
    redrawTick();
    const c = config();
    const info = c ? Projects[project()].getAlgorithmViewInfo?.(c) : undefined;
    if (!info) return undefined;
    // Why each agent took its decision in the step that led here.
    let explanations: ReturnType<NonNullable<ExecutionLike['explain']>> = [];
    try {
      explanations = startedProject().execution?.explain?.(currentPath()) ?? [];
    } catch (e) {
      console.error('Error explaining the step:', e);
    }
    return { ...info, agents: info.agents.map(a => ({ ...a, explanation: a.index !== undefined ? explanations[a.index] : undefined })) };
  });

  // Drawing, at the screen's resolution (renderers draw in CSS pixels).
  createEffect(() => {
    redrawTick();
    const c = config();
    const baseModel = startedProject().baseModel;
    if (!canvas || !c || !baseModel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS.width * ratio) {
      canvas.width = CANVAS.width * ratio;
      canvas.height = CANVAS.height * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    const current = Projects[project()];
    try {
      current.drawConfig?.(ctx, c, baseModel, { centerX: 250, centerY: 150, radius: 100, showNodeLabels: true });
    } catch (e) {
      console.error('Error drawing config:', e);
    }
  });

  // Clicking an agent selects it in the state inspector.
  const handleCanvasClick = (e: MouseEvent) => {
    const c = config();
    const baseModel = startedProject().baseModel;
    const current = Projects[project()];
    if (!canvas || !c || !baseModel || !current.getAgentsRenderInfo) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * CANVAS.width / rect.width;
    const y = (e.clientY - rect.top) * CANVAS.height / rect.height;
    try {
      const hit = current.getAgentsRenderInfo(c, baseModel, 250, 150, 100)
        .find(a => Math.hypot(x - a.position.x, y - a.position.y) <= 10);
      setSelectedAgent(hit ?? null);
    } catch (err) {
      console.error('Error handling canvas click:', err);
    }
  };

  // Navigation
  const onNext = () => {
    if (!canExplore()) return;
    if (indexInPath() < executionPath().length - 1) {
      setIndexInPath(i => i + 1);
    } else if (childCount() > 0) {
      batch(() => {
        setExecutionPath(p => [...p, 0]);
        setIndexInPath(i => i + 1);
      });
    }
  };
  const onPrevious = () => {
    if (canExplore() && indexInPath() > 0) setIndexInPath(i => i - 1);
  };
  const setChoice = (index: number) => {
    if (!canExplore()) return;
    // A different choice at this step: the steps after it no longer apply.
    setExecutionPath([...executionPath().slice(0, indexInPath()), index]);
  };
  const onKey = (e: KeyboardEvent) => {
    if (modelShown() || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { onNext(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { onPrevious(); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  // Settings
  const [savedSettings, setSavedSettings] = createSignal<SavedSetting[]>([]);
  createEffect(() => setSavedSettings(getSavedSettings(storageKey, project())));
  const predefinedSettings = createMemo(() => getPredefinedSettings(project()));

  // Settings saved or shared by an older version of a project may use older parameter names.
  const loadedSettings = (name: string, settings: any) => Projects[name]?.normalizeSettings?.(settings) ?? settings;

  const loadSettings = (s: SavedSetting) => batch(() => {
    setProjectUserSettings(loadedSettings(project(), s.settings));
    goTo(Array.isArray(s.path) ? s.path : [0]);
  });

  const shareLink = (settings: any, path?: number[]) =>
    `${window.location.origin}${window.location.pathname}?shared=${encodeSettingForUrl(project(), settings, path)}`;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copied to the clipboard');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  onMount(() => {
    const shared = new URLSearchParams(window.location.search).get('shared');
    const data = shared && decodeSettingFromUrl(shared);
    if (data && data.project in Projects && data.settings) {
      batch(() => {
        setProject(data.project);
        setProjectUserSettings(loadedSettings(data.project, data.settings));
        const path = Array.isArray(data.path) ? data.path : [0];
        // A shared link opens at the end of its path.
        goTo(path, path.length - 1);
      });
    }
  });

  /** The model view's description of the experiment (redone when the sources change). */
  const description = createMemo(() => {
    projectRevision();
    redrawTick();
    try {
      return Projects[project()].describe?.();
    } catch (e) {
      console.error('Error describing the model:', e);
      return undefined;
    }
  });

  const modelShown = () => view() === 'model' && !!description();

  const chooseProject = (name: string) => batch(() => {
    setProjectUserSettings(null);
    goTo([0]);
    setProject(name);
  });

  return (
    <div class="sim-app">
      <header class="sim-header">
        <h1>{props.title ?? 'Simulant'}</h1>
        <select value={project()} onChange={(e) => chooseProject(e.currentTarget.value)} aria-label="Simulation">
          <For each={projectKeys}>{(p) => <option value={p}>{p}</option>}</For>
        </select>
        <Show when={description()}>
          <div class="sim-tabs" role="tablist">
            <button role="tab" aria-selected={view() === 'simulation'} class={view() === 'simulation' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => showView('simulation')}>Simulation</button>
            <button role="tab" aria-selected={view() === 'model'} class={view() === 'model' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => showView('model')} title="The model and the experiment, as defined">Model</button>
          </div>
        </Show>
        <span class="sim-spacer" />
        <button class="sim-ghost theme-toggle" onClick={toggleTheme} title={dark() ? 'Light theme' : 'Dark theme'}>
          {dark() ? '☀' : '🌙'}
        </button>
      </header>

      <Show when={updateNotice()}>
        {notice => (
          <pre class={`sim-notice${notice().outOfDate ? ' sim-error' : ''}`}>
            {notice().outOfDate ? 'Out of date: the sources do not compile; showing the last version that did.\n' : 'Sources updated; the execution restarted.\n'}
            {notice().text}
          </pre>
        )}
      </Show>
      <Show when={modelShown() && description()}>
        {d => <ModelView description={d()} simulation={project()} onCopyLink={() => copy(`${shareLink(effectiveSettings(), currentPath())}#model`)} />}
      </Show>

      <div class="sim-simulation" style={{ display: modelShown() ? 'none' : undefined }}>
        <Show when={description()}>
          {d => (
            <button class="sim-model-strip" onClick={() => showView('model')} title="Show the model and the experiment as defined">
              <span class="sim-model-strip-label">Model</span>
              <For each={d().summary}>{c => <span class="sim-model-strip-item">{c}</span>}</For>
              <span class="sim-model-strip-more">details →</span>
            </button>
          )}
        </Show>

        <section class="sim-card">
          <div class="sim-toolbar">
            <div class="sim-group">
              <button class="sim-ghost sim-icon" onClick={() => setIndexInPath(0)} disabled={indexInPath() === 0 || !canExplore()} title="First step">«</button>
              <button onClick={onPrevious} disabled={indexInPath() === 0 || !canExplore()} title="Previous step (←)">Previous {'<'}</button>
              <span class="sim-round">Round {indexInPath()}</span>
              <button onClick={onNext} disabled={!canExplore() || (indexInPath() === executionPath().length - 1 && childCount() === 0)} title="Next step (→)">{'>'} Next</button>
              <button class="sim-ghost sim-icon" onClick={() => setIndexInPath(executionPath().length - 1)} disabled={indexInPath() === executionPath().length - 1 || !canExplore()} title="Last step of the path">»</button>
            </div>
            <Show when={verdict()}>
              {v => <span class={`sim-chip sim-${v().status}`} title={v().title}>task: {v().text}</span>}
            </Show>
            <Show when={config() && childCount() === 0}>
              <span class="sim-chip" title="No successor: the execution ends here">end of execution</span>
            </Show>
            <Show when={branches().length > 1}>
              <span class="sim-divider" />
              <div class="sim-group sim-choices">
                <button class="sim-ghost sim-icon" onClick={() => setChoice((currentPath().at(-1)! + branches().length - 1) % branches().length)} disabled={!canExplore()} title="Previous branch">‹</button>
                <span class="sim-branch">Branch {currentPath().at(-1)} ∈ [0, {branches().length - 1}]</span>
                <button class="sim-ghost sim-icon" onClick={() => setChoice((currentPath().at(-1)! + 1) % branches().length)} disabled={!canExplore()} title="Next branch">›</button>
                <span class="sim-step-label sim-branch-label" title={branches()[currentPath().at(-1)!]?.label}>{branches()[currentPath().at(-1)!]?.short}</span>
                <button class="sim-ghost" onClick={() => setPickingBranch(true)} disabled={!canExplore()} title="See every branch of this step and pick one">All branches</button>
              </div>
            </Show>
            <span class="sim-spacer" style={{ flex: 1 }} />
            <button class="sim-ghost" onClick={() => copy(shareLink(effectiveSettings(), currentPath()))} title="Copy a link to these settings and this path">Share</button>
          </div>
          <div class="sim-path">
            <span class="sim-path-label">Path</span>
            <For each={executionPath()}>
              {(step, i) => (
                <button
                  class={`sim-step${i() === indexInPath() ? ' sim-current' : ''}${i() > indexInPath() ? ' sim-future' : ''}`}
                  onClick={() => setIndexInPath(i())}
                  title={`Round ${i()}: ${stepLabel(i())}`}
                >
                  {step}
                </button>
              )}
            </For>
            <Show when={indexInPath() > 0 && stepLabel(indexInPath())}>
              <span class="sim-step-label">last step: {stepLabel(indexInPath())}</span>
            </Show>
          </div>
        </section>

        <div class="sim-main">
          <div class="sim-left">
            <canvas
              ref={canvas}
              class="sim-canvas"
              style={{ width: `${CANVAS.width}px`, height: `${CANVAS.height}px` }}
              onClick={handleCanvasClick}
            />
            <Show when={inspected()}>
              {state => <StateInspector state={state()} selected={selectedAgent()?.agentId ?? null} onClearSelection={() => setSelectedAgent(null)} />}
            </Show>
          </div>
          <Show when={config() && algorithmViewInfo()}>
            {info => <AlgorithmViewer source={info().source} agents={info().agents} />}
          </Show>
        </div>

        <div class="sim-panels">
          <section class="sim-card sim-settings">
            <h3>
              Settings
              <span class="sim-spacer" style={{ flex: 1 }} />
              <button class="sim-ghost" onClick={() => batch(() => { setProjectUserSettings(null); goTo([0]); })} disabled={!projectUserSettings()}>Reset to defaults</button>
            </h3>
            <Show when={editorSchema()} keyed>
              {schema => (
                <GenericEditor
                  schema={schema}
                  value={projectUserSettings()}
                  onInput={(v: any) => batch(() => { setProjectUserSettings(v); goTo([0]); })}
                />
              )}
            </Show>
            <Show when={setupLog()}>
              <div class="sim-notice sim-error sim-settings-feedback" role="alert"><mark>{setupLog()}</mark></div>
            </Show>
            <Show when={!setupLog() && settingsWarnings().length > 0}>
              <div class="sim-notice sim-settings-warning sim-settings-feedback" role="alert">
                <strong>Initial settings warning</strong>
                <For each={settingsWarnings()}>{warning => <div>{warning}</div>}</For>
                <div>You can still explore this execution. Checks over the declared domains do not cover settings outside them.</div>
              </div>
            </Show>
          </section>
          <section class="sim-card">
            <h3>Saved settings</h3>
            <SettingsLibrary
              presets={predefinedSettings()}
              saved={savedSettings()}
              current={effectiveSettings()}
              onLoad={loadSettings}
              onShare={s => copy(shareLink(loadedSettings(project(), s.settings), s.path))}
              onDelete={name => {
                deleteSettings(storageKey, project(), name);
                setSavedSettings(getSavedSettings(storageKey, project()));
              }}
              onSave={name => {
                saveSettings(storageKey, project(), name, effectiveSettings(), currentPath());
                setSavedSettings(getSavedSettings(storageKey, project()));
                notify(`Saved "${name}"`);
              }}
            />
          </section>
        </div>

        <Show when={Projects[project()].executionStatusChecker}>
          <section class="sim-card sim-section">
            <h3>
              Configuration graph
              <span class="sim-muted">every execution from these settings, round by round</span>
              <span class="sim-spacer" style={{ flex: 1 }} />
              <button class={showConfigGraph() ? 'sim-ghost' : ''} onClick={() => setShowConfigGraph(v => !v)}>
                {showConfigGraph() ? 'Hide Configuration Graph' : 'Show Configuration Graph'}
              </button>
            </h3>
            <Show when={showConfigGraph() && !updateNotice()?.outOfDate && projectRevision() + 1} keyed>
              <ConfigGraphGenerator
                revision={Projects[project()].revision?.()}
                settings={effectiveSettings()}
                setup={Projects[project()].setup}
                execute={Projects[project()].execute}
                executionStatusChecker={Projects[project()].executionStatusChecker!}
                drawConfig={Projects[project()].drawConfig}
                projectName={project()}
                createWorker={props.createGraphWorker}
                currentPath={currentPath()}
                onOpen={(settings, path) => batch(() => {
                  setProjectUserSettings(settings);
                  goTo(path, path.length - 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                })}
                configRadius={50}
                horizontalSpacing={140}
                verticalSpacing={150}
              />
            </Show>
          </section>
        </Show>

      </div>

      <Show when={pickingBranch() && branches().length > 1}>
        <BranchPicker
          branches={branches()}
          current={currentPath().at(-1)!}
          draw={Projects[project()].drawConfig ? drawBranch : undefined}
          onPick={i => { setChoice(i); setPickingBranch(false); }}
          onClose={() => setPickingBranch(false)}
        />
      </Show>

      <Show when={toast()}>
        <div class="sim-toast" role="status">{toast()}</div>
      </Show>
    </div>
  );
};

export default SimulatorApp;
