/**
 * The simulator page, as a desktop application that fills the window. The top bar picks the
 * project and the view. The simulation: the transport (rounds, playback, the verdict, the
 * adversary's choices, then the path) above a workbench whose center always shows the current
 * configuration; an activity bar shows or hides the panels around it (settings and saved
 * settings on the left, the algorithm and the state on the right), resized by splitters. The
 * graph view puts the configuration graph in the center, beside the same settings. The model
 * (`#model`): the experiment's semantics and the declarations it is built from, as written, to
 * compare with the paper. A status bar sums up the experiment.
 */
import { batch, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component, type JSX } from 'solid-js';
import type { AgentRenderInfo, ExecutionLike, ProjectType, PredefinedSetting } from '@bramas/simulant-core/types/project';
import { ConfigGraphGenerator } from './components/ConfigGraphGenerator';
import { formValues, GenericEditor } from './components/GenericEditor';
import { AlgorithmViewer } from './components/AlgorithmViewer';
import { StateInspector } from './components/StateInspector';
import { ModelView } from './components/ModelView';
import { SettingsLibrary, type SavedSetting } from './components/SettingsLibrary';
import { BranchPicker, type Branch } from './components/BranchPicker';
import { Icon, Logo, type IconName } from './components/Icon';
import { Splitter } from './components/Splitter';
import { createSystemDark, renderTheme } from './components/theme';
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
const PANELS_KEY = 'simulant-panels';
const RANDOM_KEY = 'simulant-random-branch';
const SIZES_KEY = 'simulant-panel-sizes';

const DOCKS_KEY = 'simulant-panel-docks';
const WEIGHTS_KEY = 'simulant-panel-weights';

/** The panels around the configuration, each shown or hidden from the activity bar. */
type PanelId = 'settings' | 'library' | 'algorithm' | 'state';
const PANEL_IDS: PanelId[] = ['settings', 'library', 'algorithm', 'state'];
const PANEL_TITLE: Record<PanelId, string> = { settings: 'Settings', library: 'Saved settings', algorithm: 'Algorithm', state: 'State' };
const DEFAULT_PANELS: Record<PanelId, boolean> = { settings: true, library: true, algorithm: true, state: true };
/** The panels the graph view shows beside the graph (the graph follows the settings). */
const GRAPH_PANELS = new Set<PanelId>(['settings', 'library']);
/** Panels that take only the height they need in a side bar. */
const COMPACT_PANELS = new Set<PanelId>(['settings']);

/**
 * Where panels go: the side bars, or below the configuration. Algorithms are long, so by default
 * the algorithm has the right side bar to itself and the state sits below the configuration.
 */
export type Dock = 'left' | 'right' | 'bottom';
const DOCKS: Dock[] = ['left', 'right', 'bottom'];
const DOCK_LABEL: Record<Dock, string> = { left: 'Left side bar', right: 'Right side bar', bottom: 'Below the configuration' };
const DOCK_ICON: Record<Dock, IconName> = { left: 'dockLeft', right: 'dockRight', bottom: 'dockBottom' };
const DEFAULT_DOCKS: Record<Dock, PanelId[]> = { left: ['settings', 'library'], right: ['algorithm'], bottom: ['state'] };
/** Widths of the side bars, in pixels, and the share of the center below the configuration. */
const DEFAULT_SIZES = { left: 300, right: 540, bottom: 0.34 };

/** Stored docks, with every panel exactly once (panels added later go to their default dock). */
function normalizeDocks(stored: any): Record<Dock, PanelId[]> {
  const seen = new Set<PanelId>();
  const out = { left: [], right: [], bottom: [] } as Record<Dock, PanelId[]>;
  for (const dock of DOCKS) {
    for (const id of Array.isArray(stored?.[dock]) ? stored[dock] : []) {
      if (PANEL_IDS.includes(id) && !seen.has(id)) { seen.add(id); out[dock].push(id); }
    }
  }
  for (const dock of DOCKS) for (const id of DEFAULT_DOCKS[dock]) if (!seen.has(id)) out[dock].push(id);
  return out;
}
type View = 'simulation' | 'graph' | 'model';
const VIEW_HASH: Record<View, string> = { simulation: '', graph: '#graph', model: '#model' };
/** Steps per second while playing. */
const SPEEDS = [1, 2, 4, 8];
/** Beyond this length, the path's stops are not judged one by one. */
const JUDGED_PATH = 400;

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

/** `N=6 · site=2`, for the status bar. */
const settingsSummary = (settings: Record<string, unknown>) =>
  Object.entries(settings).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `${k}=${s.length > 18 ? s.slice(0, 16) + '…' : s}`;
  }).join(' · ');

/**
 * Where the stage draws the configuration: centered, with room around the ring for labels and
 * up to four agents stacked on a node (the default ring stacks them outwards).
 */
const geometry = (size: { w: number; h: number }) => ({
  cx: size.w / 2,
  cy: size.h / 2,
  r: Math.max(40, Math.min(size.w, size.h) / 2 - 68),
});

type PanelControls = { dock?: Dock; onMove?: (dock: Dock) => void; onClose?: () => void; onDragStart?: (e: PointerEvent) => void };

/** A panel's dock menu ("Move to…") and the button that hides it. */
function PanelActions(props: { title: string } & PanelControls) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  const onPointer = (e: PointerEvent) => { if (!root?.contains(e.target as Node)) setOpen(false); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
  createEffect(() => {
    if (!open()) return;
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    onCleanup(() => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    });
  });
  return (
    <>
      <Show when={props.onMove}>
        <div class="sim-popover-anchor" ref={root}>
          <button class="sim-ghost sim-icon sim-sm" onClick={() => setOpen(v => !v)} aria-label={`Move ${props.title.toLowerCase()}`} aria-haspopup="menu" aria-expanded={open()} title="Move this panel (or drag its title bar)">
            <Icon name={props.dock ? DOCK_ICON[props.dock] : 'dock'} size={14} />
          </button>
          <Show when={open()}>
            <div class="sim-menu" role="menu" aria-label={`Move ${props.title.toLowerCase()} to`}>
              <div class="sim-menu-label">Move to</div>
              <For each={DOCKS}>
                {dock => (
                  <button role="menuitemradio" aria-checked={props.dock === dock} class={`sim-menu-item${props.dock === dock ? ' sim-menu-current' : ''}`} onClick={() => { setOpen(false); props.onMove!(dock); }}>
                    <Icon name={DOCK_ICON[dock]} size={15} /> {DOCK_LABEL[dock]}
                    <Show when={props.dock === dock}><Icon name="check" size={14} class="sim-menu-check" /></Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={props.onClose}>
        <button class="sim-ghost sim-icon sim-sm" onClick={() => props.onClose!()} aria-label={`Hide ${props.title.toLowerCase()}`} title="Hide this panel">
          <Icon name="close" size={14} />
        </button>
      </Show>
    </>
  );
}

/** A panel's title bar: its name, what it shows, its actions; it drags the panel to another dock. */
function PanelHead(props: { icon: IconName; title: string; sub?: string; children?: JSX.Element } & PanelControls) {
  return (
    <div class={`sim-panel-head${props.onDragStart ? ' sim-panel-head-draggable' : ''}`} onPointerDown={e => props.onDragStart?.(e)}>
      <Icon name={props.icon} />
      <h2 class="sim-panel-title">{props.title}</h2>
      <Show when={props.sub}><span class="sim-panel-sub">{props.sub}</span></Show>
      <span class="sim-spacer" />
      {props.children}
      <PanelActions title={props.title} dock={props.dock} onMove={props.onMove} onClose={props.onClose} />
    </div>
  );
}

/** A button of the activity bar: shows or hides a panel. */
function ActivityButton(props: { icon: IconName; label: string; active: boolean; onClick: () => void }) {
  return (
    <button class={`sim-activity-btn${props.active ? ' sim-active' : ''}`} aria-pressed={props.active} aria-label={props.label} title={props.label} onClick={() => props.onClick()}>
      <Icon name={props.icon} size={18} />
    </button>
  );
}

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
  const [selectedAgent, setSelectedAgent] = createSignal<number | null>(null);
  const [playing, setPlaying] = createSignal(false);
  // Past the end of the path, a step takes the first branch, or a random one (remembered).
  const [randomBranch, setRandomBranch] = createSignal<boolean>(readStorage(RANDOM_KEY) === true);
  const toggleRandomBranch = () => {
    setRandomBranch(r => !r);
    writeStorage(RANDOM_KEY, randomBranch());
  };
  const [speed, setSpeed] = createSignal(2);
  // The view, in the URL's hash so that a link can open the graph or the model.
  const viewOfHash = (): View => window.location.hash === '#model' ? 'model' : window.location.hash === '#graph' ? 'graph' : 'simulation';
  const [view, setView] = createSignal<View>(viewOfHash());
  const showView = (v: View) => {
    setView(v);
    setPlaying(false);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${VIEW_HASH[v]}`);
  };
  const onHash = () => setView(viewOfHash());
  window.addEventListener('hashchange', onHash);
  onCleanup(() => window.removeEventListener('hashchange', onHash));

  // The panels shown, and their sizes (remembered).
  const [panels, setPanels] = createSignal<Record<PanelId, boolean>>({ ...DEFAULT_PANELS, ...readStorage(PANELS_KEY) });
  const togglePanel = (id: PanelId) => setPanels(p => {
    const next = { ...p, [id]: !p[id] };
    writeStorage(PANELS_KEY, next);
    return next;
  });
  const stored = { ...DEFAULT_SIZES, ...readStorage(SIZES_KEY) };
  const [sizes, setSizes] = createSignal(stored.bottom > 0 && stored.bottom < 1 ? stored : { ...stored, bottom: DEFAULT_SIZES.bottom });
  const resize = (key: keyof typeof DEFAULT_SIZES, value: number) => setSizes(s => ({ ...s, [key]: value }));
  const saveSizes = () => writeStorage(SIZES_KEY, sizes());
  const resetSize = (key: keyof typeof DEFAULT_SIZES) => { resize(key, DEFAULT_SIZES[key]); saveSizes(); };
  const [showKeys, setShowKeys] = createSignal(false);
  const [setupLog, setSetupLog] = createSignal('');
  const [toast, setToast] = createSignal('');
  let canvas: HTMLCanvasElement | undefined;
  let stage: HTMLDivElement | undefined;
  let track: HTMLDivElement | undefined;
  let workbench: HTMLDivElement | undefined;
  let center: HTMLElement | undefined;
  let leftBar: HTMLElement | undefined;
  let rightBar: HTMLElement | undefined;

  const goTo = (path: number[], index = 0) => batch(() => {
    setExecutionPath(path.length ? path : [0]);
    setIndexInPath(Math.min(index, Math.max(0, path.length - 1)));
    setSelectedAgent(null);
    setPlaying(false);
  });

  // Theme: the system's, unless the user picked one (remembered).
  const systemDark = createSystemDark();
  const [theme, setTheme] = createSignal<'light' | 'dark' | null>(readStorage(THEME_KEY));
  const dark = () => (theme() ?? (systemDark() ? 'dark' : 'light')) === 'dark';
  // Applied at once, not in an effect: the drawing colors are read from the applied theme.
  const applyTheme = (t: 'light' | 'dark' | null) => {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  };
  applyTheme(theme());
  const toggleTheme = () => {
    const next = dark() ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
    writeStorage(THEME_KEY, next);
  };
  /** The colors drawings use, after the theme's tokens apply. */
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));
  const drawTheme = createMemo(() => (mounted(), renderTheme(stage, dark())));

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

  /** The verdict at each stop of the path, to mark where the task holds or fails. */
  const pathVerdicts = createMemo(() => {
    redrawTick();
    const { execution, baseModel } = startedProject();
    const judge = Projects[project()].verdict;
    const path = executionPath();
    if (!execution || !judge || path.length > JUDGED_PATH) return [];
    try {
      return path.map((_, i) => judge(execution.get(path.slice(0, i + 1)), baseModel).verdict);
    } catch {
      return [];
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
        verdict: verdict && withVerdicts && count <= 200 ? verdict(execution.get([...parent, i]), baseModel).verdict : undefined,
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
    draw(ctx, c, baseModel, { centerX: size / 2, centerY: size / 2, radius: size * 0.34, nodeRadius: 4, agentRadius: 4, showNodeLabels: false, theme: drawTheme() });
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

  // The stage follows the size of its panel.
  const [stageSize, setStageSize] = createSignal({ w: 500, h: 300 });
  onMount(() => {
    if (!stage) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      // A hidden stage (the model view) keeps its last size.
      if (width > 0 && height > 0) setStageSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });

  /** Where the agents are drawn, for hit tests and the selection's halo. */
  const agentsAt = (): AgentRenderInfo[] => {
    const c = config();
    const baseModel = startedProject().baseModel;
    const current = Projects[project()];
    if (!c || !baseModel || !current.getAgentsRenderInfo) return [];
    const { cx, cy, r } = geometry(stageSize());
    try {
      return current.getAgentsRenderInfo(c, baseModel, cx, cy, r);
    } catch (err) {
      console.error('Error locating the agents:', err);
      return [];
    }
  };

  // Drawing, at the screen's resolution (renderers draw in CSS pixels), then the selection.
  createEffect(() => {
    redrawTick();
    const c = config();
    const baseModel = startedProject().baseModel;
    const size = stageSize();
    const colors = drawTheme();
    const selected = selectedAgent();
    if (!canvas || !c || !baseModel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== size.w * ratio || canvas.height !== size.h * ratio) {
      canvas.width = size.w * ratio;
      canvas.height = size.h * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { cx, cy, r } = geometry(size);
    try {
      Projects[project()].drawConfig?.(ctx, c, baseModel, { centerX: cx, centerY: cy, radius: r, showNodeLabels: true, theme: colors });
    } catch (e) {
      console.error('Error drawing config:', e);
    }
    const halo = selected !== null ? agentsAt().find(a => a.agentId === selected) : undefined;
    if (halo) {
      ctx.save();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(halo.position.x, halo.position.y, 12, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(halo.position.x, halo.position.y, 15, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  });

  const hitAt = (e: MouseEvent) => {
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    return agentsAt().find(a => Math.hypot(x - a.position.x, y - a.position.y) <= 10);
  };
  // Clicking an agent selects it in the state inspector; hovering names it.
  const handleCanvasClick = (e: MouseEvent) => setSelectedAgent(hitAt(e)?.agentId ?? null);
  const [hover, setHover] = createSignal<AgentRenderInfo | undefined>();
  // Agents move between configurations: the tooltip waits for the pointer to move again.
  createEffect(() => { config(); setHover(undefined); });
  const hovered = createMemo(() => {
    const h = hover();
    const agent = h && inspected()?.agents.find(a => a.id === h.agentId);
    return h && { at: h.position, name: agent?.name ?? `agent ${h.agentId}`, agent };
  });

  // Navigation
  const atEnd = () => indexInPath() === executionPath().length - 1 && childCount() === 0;
  const onNext = () => {
    if (!canExplore()) return;
    if (indexInPath() < executionPath().length - 1) {
      setIndexInPath(i => i + 1);
    } else if (childCount() > 0) {
      const execution = startedProject().execution!;
      const choice = randomBranch() ? Math.min(execution.getRandomChildIndex(currentPath()), childCount() - 1) : 0;
      batch(() => {
        setExecutionPath(p => [...p, choice]);
        setIndexInPath(i => i + 1);
      });
    }
  };
  const step = (index: number) => {
    setPlaying(false);
    if (canExplore()) setIndexInPath(Math.max(0, Math.min(index, executionPath().length - 1)));
  };
  const onPrevious = () => step(indexInPath() - 1);
  const setChoice = (index: number) => {
    if (!canExplore()) return;
    setPlaying(false);
    // A different choice at this step: the steps after it no longer apply.
    setExecutionPath([...executionPath().slice(0, indexInPath()), index]);
  };
  const togglePlay = () => {
    if (playing()) setPlaying(false);
    else if (canExplore() && !atEnd()) setPlaying(true);
  };
  // Playing steps forward (taking the first branch past the path) until the execution ends.
  createEffect(() => {
    if (!playing()) return;
    const timer = setInterval(() => {
      if (!canExplore() || atEnd()) setPlaying(false);
      else onNext();
    }, 1000 / speed());
    onCleanup(() => clearInterval(timer));
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowKeys(false);
      if (!pickingBranch()) setSelectedAgent(null);
    }
    if (shownView() !== 'simulation' || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { setPlaying(false); onNext(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { onPrevious(); e.preventDefault(); }
    else if (e.key === 'Home') { step(0); e.preventDefault(); }
    else if (e.key === 'End') { step(executionPath().length - 1); e.preventDefault(); }
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { togglePlay(); e.preventDefault(); }
    else if (e.key === '?') setShowKeys(v => !v);
    else if (e.key === 'r' || e.key === 'R') toggleRandomBranch();
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));
  // The shortcuts close on a click elsewhere.
  let shortcuts: HTMLDivElement | undefined;
  const onPointer = (e: PointerEvent) => {
    if (showKeys() && !shortcuts?.contains(e.target as Node)) setShowKeys(false);
  };
  window.addEventListener('pointerdown', onPointer);
  onCleanup(() => window.removeEventListener('pointerdown', onPointer));

  // The current stop of the path stays in view.
  createEffect(() => {
    indexInPath();
    executionPath();
    queueMicrotask(() => {
      const current = track?.querySelector<HTMLElement>('.sim-current');
      if (!track || !current) return;
      const left = current.offsetLeft - track.offsetLeft, right = left + current.offsetWidth;
      if (left < track.scrollLeft + 8) track.scrollLeft = left - 24;
      else if (right > track.scrollLeft + track.clientWidth - 16) track.scrollLeft = right - track.clientWidth + 40;
    });
  });

  // The side bars leave the configuration at least this wide.
  const STAGE_MIN = 320;
  const workbenchWidth = () => workbench?.getBoundingClientRect().width ?? window.innerWidth;
  /** A side bar's width as shown: narrow windows shrink the side bars below their remembered widths. */
  const barWidth = (bar: HTMLElement | undefined) => bar?.getBoundingClientRect().width ?? 0;
  const resizeLeft = (w: number) => resize('left', Math.round(Math.max(220, Math.min(w, 600, workbenchWidth() - STAGE_MIN - barWidth(rightBar)))));
  const resizeRight = (w: number) => resize('right', Math.round(Math.max(280, Math.min(w, workbenchWidth() - STAGE_MIN - barWidth(leftBar)))));
  const centerHeight = () => center?.getBoundingClientRect().height || 600;
  const resizeBottom = (h: number) => resize('bottom', Math.max(0.15, Math.min(h / centerHeight(), 0.7)));

  // Where each panel is docked, in order, and how panels sharing a dock divide it (remembered).
  const [docks, setDocks] = createSignal(normalizeDocks(readStorage(DOCKS_KEY)));
  const dockOf = (id: PanelId) => DOCKS.find(d => docks()[d].includes(id))!;
  const movePanel = (id: PanelId, dock: Dock, index?: number) => {
    setDocks(d => {
      const next = { left: d.left.filter(x => x !== id), right: d.right.filter(x => x !== id), bottom: d.bottom.filter(x => x !== id) };
      next[dock].splice(index ?? next[dock].length, 0, id);
      writeStorage(DOCKS_KEY, next);
      return next;
    });
    if (!panels()[id]) togglePanel(id);
  };
  const resetLayout = () => {
    batch(() => {
      setPanels({ ...DEFAULT_PANELS });
      setDocks(normalizeDocks(null));
      setWeights({});
      setSizes({ ...DEFAULT_SIZES });
    });
    writeStorage(PANELS_KEY, null);
    writeStorage(DOCKS_KEY, null);
    writeStorage(WEIGHTS_KEY, null);
    saveSizes();
  };
  const [weights, setWeights] = createSignal<Partial<Record<PanelId, number>>>(readStorage(WEIGHTS_KEY) ?? {});
  const weightOf = (id: PanelId) => weights()[id] ?? 1;
  const saveWeights = () => writeStorage(WEIGHTS_KEY, weights());
  const panelElement = (id: PanelId) => workbench?.querySelector<HTMLElement>(`[data-panel="${id}"]`);
  const extent = (id: PanelId, dock: Dock) => {
    const box = panelElement(id)?.getBoundingClientRect();
    return box ? (dock === 'bottom' ? box.width : box.height) : 0;
  };
  /** Gives `first` (and takes from `second`, its neighbor) so that `first` measures `size`. */
  const splitPanels = (first: PanelId, second: PanelId, dock: Dock, size: number) => {
    const both = extent(first, dock) + extent(second, dock);
    if (both <= 0) return;
    const share = Math.max(100, Math.min(size, both - 100)) / both;
    const total = weightOf(first) + weightOf(second);
    setWeights(w => ({ ...w, [first]: share * total, [second]: (1 - share) * total }));
  };

  /** Panels the current view shows: the simulation shows them all, the graph only the settings. */
  const panelShown = (id: PanelId) => panels()[id] && (shownView() === 'simulation' || (shownView() === 'graph' && GRAPH_PANELS.has(id)));
  const dockShown = (dock: Dock) => shownView() !== 'model' && docks()[dock].some(panelShown);

  // Dragging a panel by its title bar onto a dock: the left or right side bar, or below the configuration.
  type Drop = { dock: Dock; index: number };
  const [dragging, setDragging] = createSignal<{ id: PanelId; x: number; y: number; drop?: Drop } | null>(null);
  /** The drop zones, in page coordinates: strips on the sides, and the bottom of the center. */
  const dropZones = (): Record<Dock, { left: number; top: number; width: number; height: number }> | undefined => {
    const box = workbench?.getBoundingClientRect();
    if (!box) return undefined;
    const side = Math.min(320, box.width * 0.24);
    return {
      left: { left: box.left, top: box.top, width: side, height: box.height },
      right: { left: box.right - side, top: box.top, width: side, height: box.height },
      bottom: { left: box.left + side, top: box.top + box.height * 0.5, width: box.width - 2 * side, height: box.height * 0.5 },
    };
  };
  const dropAt = (id: PanelId, x: number, y: number): Drop | undefined => {
    const zones = dropZones();
    const dock = zones && DOCKS.find(d => x >= zones[d].left && x <= zones[d].left + zones[d].width && y >= zones[d].top && y <= zones[d].top + zones[d].height);
    if (!dock) return undefined;
    // Before the first panel of the dock whose middle is past the pointer.
    const others = docks()[dock].filter(p => p !== id);
    const before = others.find(p => {
      const box = panelShown(p) ? panelElement(p)?.getBoundingClientRect() : undefined;
      return box && (dock === 'bottom' ? x < box.left + box.width / 2 : y < box.top + box.height / 2);
    });
    return { dock, index: before ? others.indexOf(before) : others.length };
  };
  const startPanelDrag = (id: PanelId, e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, a')) return;
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      if (!dragging() && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
      document.documentElement.classList.add('sim-dragging-panel');
      setDragging({ id, x: ev.clientX, y: ev.clientY, drop: dropAt(id, ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.documentElement.classList.remove('sim-dragging-panel');
      const drop = ev.type === 'pointerup' ? dragging()?.drop : undefined;
      setDragging(null);
      if (drop) movePanel(id, drop.dock, drop.index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

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
  const share = () => copy(`${shareLink(effectiveSettings(), currentPath())}${VIEW_HASH[shownView()]}`);

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

  const hasGraph = () => !!Projects[project()].executionStatusChecker;
  /** The view shown: the one asked for, when this project has it. */
  const shownView = (): View => view() === 'model' && description() ? 'model' : view() === 'graph' && hasGraph() ? 'graph' : 'simulation';
  // The graph stays mounted once opened, so that switching views keeps it.
  const [graphOpened, setGraphOpened] = createSignal(false);
  createEffect(() => { if (shownView() === 'graph') setGraphOpened(true); });


  const chooseProject = (name: string) => batch(() => {
    setProjectUserSettings(null);
    goTo([0]);
    setProject(name);
  });

  const branchIndex = () => currentPath().at(-1)!;

  /** Each panel's content; the docks place them. Moving a panel to another dock recreates it. */
  const head = (id: PanelId) => ({ dock: dockOf(id), onMove: (dock: Dock) => movePanel(id, dock), onClose: () => togglePanel(id), onDragStart: (e: PointerEvent) => startPanelDrag(id, e) });
  const panelContent: Record<PanelId, () => JSX.Element> = {
    settings: () => (
      <section class="sim-panel sim-settings">
        <PanelHead icon="sliders" title="Settings" {...head('settings')}>
          <button class="sim-ghost sim-sm" onClick={() => batch(() => { setProjectUserSettings(null); goTo([0]); })} disabled={!projectUserSettings()} title="Reset the settings to the experiment's defaults">
            <Icon name="reset" size={14} /> <span class="sim-btn-label">Reset</span>
          </button>
        </PanelHead>
        <div class="sim-panel-body">
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
            <div class="sim-feedback sim-settings-error" role="alert">
              <Icon name="alert" />
              <div>
                <strong>These settings do not start an execution</strong>
                <mark>{setupLog()}</mark>
              </div>
            </div>
          </Show>
          <Show when={!setupLog() && settingsWarnings().length > 0}>
            <div class="sim-feedback sim-settings-warning" role="alert">
              <Icon name="alert" />
              <div>
                <strong>Initial settings warning</strong>
                <For each={settingsWarnings()}>{warning => <span>{warning}</span>}</For>
                <span class="sim-muted">You can still explore this execution. Checks over the declared domains do not cover settings outside them.</span>
              </div>
            </div>
          </Show>
        </div>
      </section>
    ),
    library: () => (
      <section class="sim-panel sim-library-panel">
        <PanelHead icon="bookmark" title="Saved settings" {...head('library')} />
        <div class="sim-panel-body">
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
        </div>
      </section>
    ),
    algorithm: () => (
      <Show when={config() && algorithmViewInfo()} fallback={
        <section class="sim-panel">
          <PanelHead icon="file" title="Algorithm" {...head('algorithm')} />
          <div class="sim-stage-empty"><Icon name="file" size={28} /><span>No algorithm to show.</span></div>
        </section>
      }>
        {info => (
          <AlgorithmViewer
            source={info().source}
            agents={info().agents}
            onHeadPointerDown={e => startPanelDrag('algorithm', e)}
            highlighted={inspected()?.agents.find(a => a.id === selectedAgent())?.name ?? null}
            onSelectAgent={name => setSelectedAgent(inspected()?.agents.find(a => a.name === name)?.id ?? null)}
            actions={<PanelActions title="Algorithm" {...head('algorithm')} />}
          />
        )}
      </Show>
    ),
    state: () => (
      <section class="sim-panel sim-inspector-panel">
        <PanelHead icon="inspect" title="State" sub="world, agents and parameters" {...head('state')} />
        <div class="sim-panel-body">
          <Show when={inspected()} fallback={<p class="sim-muted">No state to inspect.</p>}>
            {state => <StateInspector state={state()} selected={selectedAgent()} onSelect={setSelectedAgent} onClearSelection={() => setSelectedAgent(null)} />}
          </Show>
        </div>
      </section>
    ),
  };

  /** A dock's panels in order, the hidden ones kept mounted, with splitters between neighbors that share the space. */
  const DockPanels = (p: { dock: Dock }) => (
    <For each={docks()[p.dock]}>
      {(id, i) => {
        const fills = (x: PanelId) => p.dock === 'bottom' || !COMPACT_PANELS.has(x);
        const previous = () => docks()[p.dock].slice(0, i()).filter(panelShown).at(-1);
        return (
          <>
            <Show when={panelShown(id) && previous() && fills(id) && fills(previous()!) && previous()} keyed>
              {prev => (
                <Splitter
                  orientation={p.dock === 'bottom' ? 'vertical' : 'horizontal'}
                  value={extent(prev, p.dock)}
                  onChange={size => splitPanels(prev, id, p.dock, size)}
                  onCommit={saveWeights}
                  onReset={() => { setWeights(w => ({ ...w, [prev]: 1, [id]: 1 })); saveWeights(); }}
                  label={`Resize ${PANEL_TITLE[prev].toLowerCase()} and ${PANEL_TITLE[id].toLowerCase()}`}
                />
              )}
            </Show>
            <div
              class={`sim-slot${dragging()?.id === id ? ' sim-slot-dragged' : ''}`}
              data-panel={id}
              hidden={!panelShown(id)}
              // Grow factors below 1 would leave part of the dock empty (a lone panel of weight 0.6
              // takes 60% of it): scaled up, they keep their ratios and always fill the dock.
              style={{ flex: fills(id) ? `${weightOf(id) * 100} 1 0` : '0 1 auto' }}
            >
              {panelContent[id]()}
            </div>
          </>
        );
      }}
    </For>
  );

  return (
    <div class={`sim-app sim-view-${shownView()}`}>
      <header class="sim-topbar">
        <div class="sim-brand">
          <Logo />
          <span class="sim-brand-name">Simulant</span>
          <span class="sim-brand-sep">/</span>
          <h1>{props.title ?? 'Simulator'}</h1>
        </div>
        <div class="sim-project">
          <select value={project()} onChange={(e) => chooseProject(e.currentTarget.value)} aria-label="Simulation" title="Simulation">
            <For each={projectKeys}>{(p) => <option value={p}>{p}</option>}</For>
          </select>
        </div>
        <div class="sim-tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={shownView() === 'simulation'} class={shownView() === 'simulation' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => showView('simulation')} title="Step through an execution">
            <Icon name="play" size={13} /> <span class="sim-tab-label">Simulation</span>
          </button>
          <Show when={hasGraph()}>
            <button role="tab" aria-selected={shownView() === 'graph'} class={shownView() === 'graph' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => showView('graph')} title="Every execution from these settings, round by round">
              <Icon name="graph" size={13} /> <span class="sim-tab-label">Graph</span>
            </button>
          </Show>
          <Show when={description()}>
            <button role="tab" aria-selected={shownView() === 'model'} class={shownView() === 'model' ? 'sim-tab sim-tab-current' : 'sim-tab'} onClick={() => showView('model')} title="The model and the experiment, as defined">
              <Icon name="layers" size={13} /> <span class="sim-tab-label">Model</span>
            </button>
          </Show>
        </div>
        <span class="sim-spacer" />
        <div class="sim-topbar-actions">
          <button class="sim-btn" onClick={share} title={shownView() === 'simulation' ? 'Copy a link to these settings and this path' : 'Copy a link that opens this view'}>
            <Icon name="link" /> <span class="sim-share-label">Share</span>
          </button>
          <div class="sim-popover-anchor" ref={shortcuts}>
            <button class="sim-ghost sim-icon" onClick={() => setShowKeys(v => !v)} aria-label="Keyboard shortcuts" aria-expanded={showKeys()} title="Keyboard shortcuts (?)">
              <Icon name="keyboard" />
            </button>
            <Show when={showKeys()}>
              <div class="sim-shortcuts" role="dialog" aria-label="Keyboard shortcuts">
                <h4>Keyboard shortcuts</h4>
                <dl>
                  <dt><kbd>→</kbd></dt><dd>Next step</dd>
                  <dt><kbd>←</kbd></dt><dd>Previous step</dd>
                  <dt><kbd>Home</kbd><kbd>End</kbd></dt><dd>First / last step of the path</dd>
                  <dt><kbd>Space</kbd></dt><dd>Play / pause</dd>
                  <dt><kbd>R</kbd></dt><dd>Random or first branch for new steps</dd>
                  <dt><kbd>Esc</kbd></dt><dd>Clear the selected agent</dd>
                  <dt><kbd>?</kbd></dt><dd>Show these shortcuts</dd>
                </dl>
              </div>
            </Show>
          </div>
          <button class="sim-ghost sim-icon theme-toggle" onClick={toggleTheme} aria-label={dark() ? 'Light theme' : 'Dark theme'} title={dark() ? 'Light theme' : 'Dark theme'}>
            <Icon name={dark() ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      <Show when={updateNotice()}>
        {notice => (
          <div class={`sim-banner${notice().outOfDate ? ' sim-error' : ''}`} role="status">
            <Icon name={notice().outOfDate ? 'alert' : 'info'} />
            <div class="sim-banner-body">
              <strong>{notice().outOfDate ? 'Out of date: the sources do not compile; showing the last version that did.' : 'Sources updated; the execution restarted.'}</strong>
              <Show when={notice().text}><pre>{notice().text}</pre></Show>
            </div>
            <Show when={!notice().outOfDate}>
              <button class="sim-ghost sim-icon sim-sm" onClick={() => setUpdateNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
            </Show>
          </div>
        )}
      </Show>

      <div class="sim-shell" hidden={shownView() === 'model'}>
        <nav class="sim-activity" aria-label="Panels">
          <ActivityButton icon="sliders" label="Settings" active={panels().settings} onClick={() => togglePanel('settings')} />
          <ActivityButton icon="bookmark" label="Saved settings" active={panels().library} onClick={() => togglePanel('library')} />
          <Show when={shownView() === 'simulation'}>
            <span class="sim-activity-sep" />
            <ActivityButton icon="file" label="Algorithm" active={panels().algorithm} onClick={() => togglePanel('algorithm')} />
            <ActivityButton icon="inspect" label="State" active={panels().state} onClick={() => togglePanel('state')} />
          </Show>
          <span class="sim-spacer" />
          <ActivityButton icon="dock" label="Reset the panel layout" active={false} onClick={resetLayout} />
          <Show when={hasGraph()}>
            <ActivityButton
              icon="graph"
              label={shownView() === 'graph' ? 'Back to the simulation' : 'Configuration graph'}
              active={shownView() === 'graph'}
              onClick={() => showView(shownView() === 'graph' ? 'simulation' : 'graph')}
            />
          </Show>
        </nav>

        <div class="sim-main">
          <div class="sim-transport-bar" hidden={shownView() !== 'simulation'}>
            <section class="sim-transport" aria-label="Execution">
              <div class="sim-transport-row">
                <div class="sim-group">
                  <button class="sim-ghost sim-icon" onClick={() => step(0)} disabled={indexInPath() === 0 || !canExplore()} aria-label="First step" title="First step (Home)"><Icon name="first" /></button>
                  <button class="sim-btn sim-icon" onClick={onPrevious} disabled={indexInPath() === 0 || !canExplore()} aria-label="Previous step" title="Previous step (←)"><Icon name="previous" /></button>
                  <div class="sim-round" title={`Round ${indexInPath()} of the path's ${executionPath().length - 1}`}>
                    <span class="sim-round-label">Round</span>
                    <span class="sim-round-value">{indexInPath()}</span>
                    <span class="sim-round-total">/ {executionPath().length - 1}</span>
                  </div>
                  <button class="sim-btn sim-icon" onClick={() => { setPlaying(false); onNext(); }} disabled={!canExplore() || atEnd()} aria-label="Next step" title="Next step (→)"><Icon name="next" /></button>
                  <button class="sim-ghost sim-icon" onClick={() => step(executionPath().length - 1)} disabled={indexInPath() === executionPath().length - 1 || !canExplore()} aria-label="Last step" title="Last step of the path (End)"><Icon name="last" /></button>
                </div>
                <span class="sim-divider" />
                <div class="sim-group">
                  <button class={`${playing() ? 'sim-btn' : 'sim-primary'} sim-play`} onClick={togglePlay} disabled={!playing() && (!canExplore() || atEnd())} aria-label={playing() ? 'Pause' : 'Play'} title={playing() ? 'Pause (Space)' : 'Play: step forward until the execution ends (Space)'}>
                    <Icon name={playing() ? 'pause' : 'play'} />
                  </button>
                  <label class="sim-speed" title="Playback speed">
                    <select value={speed()} onChange={e => setSpeed(Number(e.currentTarget.value))} aria-label="Playback speed">
                      <For each={SPEEDS}>{s => <option value={s}>{s} step{s > 1 ? 's' : ''}/s</option>}</For>
                    </select>
                  </label>
                </div>
                <span class="sim-divider" />
                <div class="sim-group">
                  <Show when={verdict()}>
                    {v => <span class={`sim-chip sim-verdict sim-${v().status}`} title={v().title}>Task: {v().text}</span>}
                  </Show>
                  <Show when={config() && childCount() === 0}>
                    <span class="sim-chip sim-verdict" title="No successor: the execution ends here">End of execution</span>
                  </Show>
                </div>
                <span class="sim-divider" />
                <div class="sim-group sim-branches">
                  <button
                    class={`sim-ghost sim-icon sim-toggle${randomBranch() ? ' sim-toggle-on' : ''}`}
                    onClick={toggleRandomBranch}
                    aria-pressed={randomBranch()}
                    aria-label="Random branch for new steps"
                    title={randomBranch()
                      ? 'New steps take a random branch (R): click to take the first branch'
                      : 'New steps take the first branch (R): click to take a random branch'}
                  >
                    <Icon name="dice" />
                  </button>
                  <Show when={branches().length > 1}>
                    <Icon name="branch" />
                    <span class="sim-branch">Branch {branchIndex()} <span class="sim-branch-of">of {branches().length}</span></span>
                    <button class="sim-ghost sim-icon sim-sm" onClick={() => setChoice((branchIndex() + branches().length - 1) % branches().length)} disabled={!canExplore()} aria-label="Previous branch" title="Previous branch"><Icon name="previous" size={14} /></button>
                    <button class="sim-ghost sim-icon sim-sm" onClick={() => setChoice((branchIndex() + 1) % branches().length)} disabled={!canExplore()} aria-label="Next branch" title="Next branch"><Icon name="next" size={14} /></button>
                    <span class="sim-step-label sim-branch-label" title={branches()[branchIndex()]?.label}>{branches()[branchIndex()]?.short || '(first options)'}</span>
                    <button class="sim-btn sim-sm" onClick={() => setPickingBranch(true)} disabled={!canExplore()} title="See every branch of this step and pick one">
                      <Icon name="grid" size={14} /> All branches
                    </button>
                  </Show>
                </div>
              </div>
              <div class="sim-timeline">
                <span class="sim-timeline-label">Path</span>
                <div class="sim-track" ref={track}>
                  <For each={executionPath()}>
                    {(choice, i) => (
                      <>
                        <Show when={i() > 0}><span class="sim-track-sep" /></Show>
                        <button
                          class={`sim-step${i() === indexInPath() ? ' sim-current' : ''}${i() > indexInPath() ? ' sim-future' : ''}`}
                          data-verdict={pathVerdicts()[i()]}
                          onClick={() => step(i())}
                          title={`Round ${i()}: ${stepLabel(i())}${pathVerdicts()[i()] ? ` (task: ${VERDICT_TEXT[pathVerdicts()[i()]]})` : ''}`}
                        >
                          {choice}
                        </button>
                      </>
                    )}
                  </For>
                </div>
                <Show when={indexInPath() > 0 && stepLabel(indexInPath())}>
                  <span class="sim-step-label" title={stepLabel(indexInPath())}>last step: {stepLabel(indexInPath())}</span>
                </Show>
              </div>
            </section>
          </div>

          <div class="sim-workbench" ref={workbench}>
            <aside class="sim-sidebar sim-dock" ref={leftBar} hidden={!dockShown('left')} style={{ 'flex-basis': `${sizes().left}px` }} aria-label={DOCK_LABEL.left}>
              <DockPanels dock="left" />
            </aside>
            <Show when={dockShown('left')}>
              <Splitter orientation="vertical" value={barWidth(leftBar)} onChange={resizeLeft} onCommit={saveSizes} onReset={() => resetSize('left')} label="Resize the left side bar" />
            </Show>

            <main class="sim-center" ref={center}>
              <section class="sim-panel sim-stage-panel" hidden={shownView() !== 'simulation'}>
                <PanelHead icon="ring" title="Configuration" sub={`round ${indexInPath()} · ${settingsSummary(effectiveSettings())}`} />
                <div class="sim-stage" ref={stage}>
                  <canvas
                    ref={canvas}
                    class={`sim-canvas${hover() ? ' sim-over-agent' : ''}`}
                    style={{ width: `${stageSize().w}px`, height: `${stageSize().h}px` }}
                    onClick={handleCanvasClick}
                    onMouseMove={e => setHover(hitAt(e))}
                    onMouseLeave={() => setHover(undefined)}
                  />
                  <Show when={hovered()}>
                    {h => (
                      <div class="sim-stage-tip" style={{ left: `${h().at.x}px`, top: `${h().at.y}px` }}>
                        <strong>{h().name}</strong>
                        <Show when={h().agent}>{a => <span> · node {String(a().value.position)}{a().status !== 'correct' ? ` · ${a().status === 'hidden' ? 'gone' : 'faulty'}` : ''}</span>}</Show>
                      </div>
                    )}
                  </Show>
                  <Show when={!config()}>
                    <div class="sim-stage-empty">
                      <Icon name="ring" size={28} />
                      <span>No configuration to show.</span>
                      <span class="sim-muted">The current settings do not start an execution: see the settings below.</span>
                    </div>
                  </Show>
                  <Show when={config() && Projects[project()].getAgentsRenderInfo}>
                    <div class="sim-stage-overlay">
                      <span class="sim-stage-badge">
                        {selectedAgent() !== null
                          ? `${inspected()?.agents.find(a => a.id === selectedAgent())?.name ?? 'Agent'} selected · Esc to clear`
                          : 'Click an agent to inspect it'}
                      </span>
                    </div>
                  </Show>
                </div>
              </section>
              <Show when={graphOpened() && hasGraph()}>
                <section class="sim-panel sim-graph-panel" hidden={shownView() !== 'graph'}>
                  <PanelHead icon="graph" title="Configuration graph" sub="every execution from these settings, round by round">
                    <button class="sim-ghost sim-sm" onClick={() => showView('simulation')}><Icon name="previous" size={14} /> Back to the simulation</button>
                  </PanelHead>
                  <Show when={!updateNotice()?.outOfDate && projectRevision() + 1} keyed fallback={
                    <div class="sim-stage-empty"><Icon name="alert" size={28} /><span>The sources do not compile: the graph waits until they do.</span></div>
                  }>
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
                      theme={drawTheme()}
                      onOpen={(settings, path) => batch(() => {
                        setProjectUserSettings(settings);
                        goTo(path, path.length - 1);
                        showView('simulation');
                      })}
                      configRadius={50}
                      horizontalSpacing={140}
                      verticalSpacing={150}
                    />
                  </Show>
                </section>
              </Show>
              <Show when={dockShown('bottom')}>
                <Splitter orientation="horizontal" direction={-1} value={sizes().bottom * centerHeight()} onChange={resizeBottom} onCommit={saveSizes} onReset={() => resetSize('bottom')} label="Resize the panels below the configuration" />
              </Show>
              <div class="sim-dock sim-dock-bottom" hidden={!dockShown('bottom')} style={{ flex: `0 0 ${sizes().bottom * 100}%` }} aria-label={DOCK_LABEL.bottom}>
                <DockPanels dock="bottom" />
              </div>
            </main>

            <Show when={dockShown('right')}>
              <Splitter orientation="vertical" direction={-1} value={barWidth(rightBar)} onChange={resizeRight} onCommit={saveSizes} onReset={() => resetSize('right')} label="Resize the right side bar" />
            </Show>
            <aside class="sim-sidebar sim-dock" ref={rightBar} hidden={!dockShown('right')} style={{ 'flex-basis': `${sizes().right}px` }} aria-label={DOCK_LABEL.right}>
              <DockPanels dock="right" />
            </aside>

            <Show when={dragging()}>
              {d => (
                <>
                  <div class="sim-dropzones" aria-hidden="true">
                    <For each={DOCKS}>
                      {dock => {
                        const zone = () => {
                          const z = dropZones()?.[dock], box = workbench?.getBoundingClientRect();
                          return z && box ? { left: `${z.left - box.left}px`, top: `${z.top - box.top}px`, width: `${z.width}px`, height: `${z.height}px` } : {};
                        };
                        return (
                          <div class={`sim-dropzone${d().drop?.dock === dock ? ' sim-dropzone-active' : ''}`} style={zone()}>
                            <Icon name={DOCK_ICON[dock]} size={20} />
                            <span>{DOCK_LABEL[dock]}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                  <div class="sim-drag-ghost" style={{ left: `${d().x}px`, top: `${d().y}px` }}>
                    <Icon name="grip" size={14} /> {PANEL_TITLE[d().id]}
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>

      <Show when={shownView() === 'model' && description()}>
        {d => (
          <div class="sim-model-page">
            <ModelView description={d()} simulation={project()} onCopyLink={() => copy(`${shareLink(effectiveSettings(), currentPath())}#model`)} />
          </div>
        )}
      </Show>

      <footer class="sim-statusbar">
        <span class="sim-status-item" title={updateNotice()?.outOfDate ? 'The sources do not compile' : 'Up to date'}>
          <span class={`sim-status-dot${updateNotice()?.outOfDate || setupLog() ? ' sim-stale' : ''}`} />
          <span class="sim-status-mono">{project()}</span>
        </span>
        <span class="sim-status-item sim-status-mono sim-status-hide-sm">{settingsSummary(effectiveSettings())}</span>
        <span class="sim-status-item sim-status-hide-sm">
          <Icon name="branch" /> {childCount()} successor{childCount() === 1 ? '' : 's'}
        </span>
        <Show when={description()} fallback={<span class="sim-spacer" />}>
          {d => (
            <button class="sim-status-model" onClick={() => showView('model')} title="Show the model and the experiment as defined">
              <Icon name="layers" /> <span>{d().summary.join(' · ')}</span>
            </button>
          )}
        </Show>
        <span class="sim-status-keys">
          <kbd>←</kbd><kbd>→</kbd> step · <kbd>Space</kbd> play · <kbd>?</kbd> help
        </span>
      </footer>

      <Show when={pickingBranch() && branches().length > 1}>
        <BranchPicker
          branches={branches()}
          current={branchIndex()}
          draw={Projects[project()].drawConfig ? drawBranch : undefined}
          onPick={i => { setChoice(i); setPickingBranch(false); }}
          onClose={() => setPickingBranch(false)}
        />
      </Show>

      <Show when={toast()}>
        <div class="sim-toast" role="status"><Icon name="check" />{toast()}</div>
      </Show>
    </div>
  );
};

export default SimulatorApp;
