import { createMemo, createSignal, onCleanup, onMount, Show, type Component, createEffect, For, Switch, Match } from 'solid-js';
import { execute } from '@bramas/simulant-core/lib/system';
import { Dynamic } from 'solid-js/web';
import { ProjectType } from '@bramas/simulant-core/types/project';
import { ConfigGraphGenerator } from './components/ConfigGraphGenerator';
import { GenericEditor } from './components/GenericEditor';
import { AlgorithmViewer } from './components/AlgorithmViewer';

export type PredefinedSetting = {
  name: string;
  settings: any;
  path?: number[];
};

export interface SimulatorAppProps {
  projects: Record<string, ProjectType<any>>;
  title?: string;
  checker?: Component;
  storageKey?: string;
  getPredefinedSettings?: (project: string) => PredefinedSetting[];
  createGraphWorker?: () => Worker;
}

const DEFAULT_STORAGE_KEY = 'project_settings_v2';

function getSavedSettings(storageKey: string, project: string) {
  const all = JSON.parse(localStorage.getItem(storageKey) || '{}');
  return all[project] || [];
}

function saveSettings(storageKey: string, project: string, name: string, settings: any, path?: number[]) {
  const all = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (!all[project]) all[project] = [];
  let baseName = name;
  let counter = 1;
  let newName = baseName;
  const existingNames = all[project].map((s: any) => s.name);
  while (existingNames.includes(newName)) {
    newName = `${baseName} (${counter})`;
    counter++;
  }
  all[project].push({ name: newName, settings, path });
  localStorage.setItem(storageKey, JSON.stringify(all));
}

function deleteSettings(storageKey: string, project: string, name: string) {
  const all = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (!all[project]) return;
  all[project] = all[project].filter((s: any) => s.name !== name);
  localStorage.setItem(storageKey, JSON.stringify(all));
}

function encodeSettingForUrl(project: string, settings: any, path?: number[]) {
  const payload = JSON.stringify({ project, settings, path });
  return btoa(encodeURIComponent(payload));
}

function decodeSettingFromUrl(encoded: string) {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export const SimulatorApp: Component<SimulatorAppProps> = (props) => {
  const Projects = props.projects;
  const projectKeys = Object.keys(Projects);
  const storageKey = props.storageKey ?? DEFAULT_STORAGE_KEY;
  const getPredefinedSettings = props.getPredefinedSettings ?? (() => []);
  const Checker = props.checker;

  const [projectUserSettings, setProjectUserSettings] = createSignal(null);
  
  // Tab selection state
  const [activeTab, setActiveTab] = createSignal<'simulator' | 'checker'>('simulator');
  
  // Track the path in the execution tree: [0, childIndex1, childIndex2, ...]
  // [0] is the root, [0, 2] is the 3rd child of root, etc.
  const [executionPath, setExecutionPath] = createSignal<number[]>([0]);
  const [indexInPath, setIndexInPath] = createSignal<number>(0);
  
  // Canvas and agent selection
  const [selectedAgent, setSelectedAgent] = createSignal<any>(null);
  const [showConfigGraph, setShowConfigGraph] = createSignal(false);

  let canvas: HTMLCanvasElement | undefined;

  const [project, setProject] = createSignal(projectKeys[0]);
  const [setupLog, setSetupLog] = createSignal('');

  const [darkMode, setDarkMode] = createSignal(false);
  
  const [showGraphGenerator, setShowGraphGenerator] = createSignal(false);

  function toggleDarkMode() {
    setDarkMode(v => {
      const newVal = !v;
      // set attribute to html, data-theme="light" or data-theme="dark"
      document.documentElement.setAttribute('data-theme', newVal ? 'dark' : 'light');
      return newVal;
    });
  }

  onMount(() => {
    // Set initial mode based on prefers-color-scheme
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(prefersDark);
    document.body.classList.toggle('dark-mode', prefersDark);
  });

  const startedProject = createMemo(() => {
    try {
      const baseModel = Projects[project()].setup(projectUserSettings());
      setSetupLog('');
      // @ts-ignore - Different projects use different agent types
      const execution = execute(baseModel);
      return { baseModel, execution };
    } catch (e) {
      console.error('Project setup failed:', e);
      setSetupLog(e instanceof Error ? e.message : String(e));
      return { baseModel: null, execution: null };
    }
  });

  const [savedSettings, setSavedSettings] = createSignal(getSavedSettings(storageKey, project()));

  const predefinedSettings = createMemo(() => getPredefinedSettings(project()));

  // Update savedSettings when project changes
  createMemo(() => {
    setSavedSettings(getSavedSettings(storageKey, project()));
    return project();
  });

  function handleSaveSettings() {
    const name = prompt('Enter a name for these settings:');
    if (!name) return;
    const pathToSave = executionPath().slice(0, indexInPath() + 1);
    saveSettings(storageKey, project(), name, projectUserSettings(), pathToSave);
    setSavedSettings(getSavedSettings(storageKey, project()));
  }

  function handleLoadSettings(settingsData: any) {
    console.log('Loading settings:', settingsData);
    if (settingsData.settings !== undefined) {
      // New format with path
      setProjectUserSettings(settingsData.settings);
      if (settingsData.path && Array.isArray(settingsData.path)) {
        setExecutionPath(settingsData.path);
        setIndexInPath(0);
      } else {
        setExecutionPath([0]);
        setIndexInPath(0);
      }
    } else {
      // Old format - just settings
      setProjectUserSettings(settingsData);
      setExecutionPath([0]);
      setIndexInPath(0);
    }
  }

  function handleDeleteSettings(name: string) {
    if (confirm('Delete saved settings "' + name + '"?')) {
      deleteSettings(storageKey, project(), name);
      setSavedSettings(getSavedSettings(storageKey, project()));
    }
  }

  function handleShareSettings(project: string, settingsData: any) {
    const settings = settingsData.settings !== undefined ? settingsData.settings : settingsData;
    const path = settingsData.path;
    const encoded = encodeSettingForUrl(project, settings, path);
    const url = `${window.location.origin}${window.location.pathname}?shared=${encoded}`;
    window.prompt('Share this URL:', url);
  }

  const config = createMemo(() => {
    if(!startedProject().baseModel || !startedProject().execution) return null;
    
    try {
      const pathToIndex = executionPath().slice(0, indexInPath() + 1);
      // @ts-ignore
      return startedProject().execution.get(pathToIndex);
    } catch (e) {
      console.error('Error getting config at path', executionPath(), e);
      return null;
    }
  });
  
  // Effect to draw on canvas when config changes
  createEffect(() => {
    const currentConfig = config();
    const baseModel = startedProject().baseModel;
    if (!canvas || !currentConfig || !baseModel) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Use the project's drawConfig function if available
    const currentProject = Projects[project()];
    if (currentProject.drawConfig) {
      try {
        // @ts-ignore
        currentProject.drawConfig(ctx, currentConfig, baseModel, {
          centerX: 250,
          centerY: 150,
          radius: 100,
          showNodeLabels: true
        });
      } catch (e) {
        console.error('Error drawing config:', e);
      }
    }
  });
  
  // Handle canvas clicks to select agents
  const handleCanvasClick = (e: MouseEvent) => {
    const currentConfig = config();
    const baseModel = startedProject().baseModel;
    if (!canvas || !currentConfig || !baseModel) return;
    
    const currentProject = Projects[project()];
    if (!currentProject.getAgentsRenderInfo) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    try {
      // @ts-ignore
      const agentsInfo = currentProject.getAgentsRenderInfo(
        currentConfig,
        baseModel,
        250,
        150,
        100
      );
      
      // Find clicked agent
      for (const agentInfo of agentsInfo) {
        const dx = x - agentInfo.position.x;
        const dy = y - agentInfo.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= 10) { // Click tolerance
          // Get full agent details from config
          // @ts-ignore
          const node = currentConfig.get(agentInfo.nodeIndex);
          const agent = node.agents.find((a: any) => a._id === agentInfo.agentId);
          
          setSelectedAgent({
            ...agentInfo,
            agent: agent,
            round: indexInPath()
          });
          return;
        }
      }
      
      // Click outside agents - deselect
      setSelectedAgent(null);
    } catch (e) {
      console.error('Error handling canvas click:', e);
    }
  };
  
  // Get the number of possible branches at the current step (siblings of current config)
  const branchCount = createMemo(() => {

    if (!startedProject().execution || executionPath().length === 0) return 1;
    const pathToIndex = executionPath().slice(0, indexInPath() + 1);

    try {
      // @ts-ignore
      return startedProject().execution.getSiblingCount(pathToIndex);
    } catch {
      return 1;
    }
  });
  
  // Get the current branch index (last element of the path)
  const currentBranchIndex = createMemo(() => {
    const path = executionPath().slice(0, indexInPath() + 1);
    return path.length > 1 ? path[path.length - 1] : 0;
  });
  
  // Helper to go to next step
  const onNext = () => {
    const path = executionPath();
    if (indexInPath() < path.length - 1) {
      setIndexInPath(v => v + 1);
      return;
    }

    // Choose a random child ---> for now, always choose the first child
    const randomChildIndex = 0 //startedProject().execution?.getRandomChildIndex(path) || 0;
    setExecutionPath([...path, randomChildIndex]);
    setIndexInPath(v => v + 1);
  };
  
  // Helper to go to previous step
  const onPrevious = () => {
    if (indexInPath() >= 1) {
      setIndexInPath(v => v - 1);
    }
  };
  
  // Helper to change the branch at current step
  const setBranchIndex = (index: number) => {
    // changet the value at executionPath()[indexInPath()] to index
    const path = executionPath().slice(0, indexInPath());
    if (path.length > 0) {
      setExecutionPath([...path, index]);
    }
  };
  
  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      onNext();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      onPrevious();
      e.preventDefault();
    }
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onNext);
    window.removeEventListener('keydown', onPrevious);
  });

  // On mount, check for shared setting in URL or counter example in localStorage
  onMount(() => {
    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('shared');
    if (shared) {
      const data = decodeSettingFromUrl(shared);
      if (data && data.project && data.settings) {
        setProject(data.project);
        setProjectUserSettings(data.settings);
        if (data.path && Array.isArray(data.path)) {
          setExecutionPath(data.path);
          setIndexInPath(0);
        } else {
          setExecutionPath([0]);
          setIndexInPath(0);
        }
      }
    }
    
    // Check for counter example in localStorage
    const counterExampleData = localStorage.getItem('runCounterExample');
    if (counterExampleData) {
      try {
        const data = JSON.parse(counterExampleData);
        if (data.project && data.settings) {
          setProject(data.project as keyof typeof Projects);
          setProjectUserSettings(data.settings);
          if (data.path && Array.isArray(data.path)) {
            setExecutionPath(data.path);
            setIndexInPath(0);
          } else {
            setExecutionPath([0]);
            setIndexInPath(0);
          }
          setActiveTab('simulator');
          
          // Clear the localStorage item after loading it
          localStorage.removeItem('runCounterExample');
        }
      } catch (err) {
        console.error('Error loading counter example:', err);
      }
    }
    
    // Add event listener for switching to simulator tab
    window.addEventListener('switchToSimulatorTab', ((event: CustomEvent) => {
      setActiveTab('simulator');
      if (event.detail?.projectId) {
            setProject(event.detail.projectId);
      }
    }) as EventListener);
  });
  
  onCleanup(() => {
    window.removeEventListener('switchToSimulatorTab', (() => {}) as EventListener);
  });

  return (
    <div>
      <main class="container">
        <article>
          <header style={{"margin-bottom": '2em'}}>
            <h1>{props.title ?? 'Simulant'}</h1>
            <div style={{"display": 'flex', "align-items": 'center', "gap": '1em'}}>
              <select value={project()} onChange={(e) => {
                setExecutionPath([0]);
                setIndexInPath(0);
                setProjectUserSettings(null);
                setProject(e.currentTarget.value as keyof typeof Projects);
              }}>
                {projectKeys.map((p) => (
                  <option value={p}>{p}</option>
                ))}
              </select>
              <div role="tablist" class="tabs">
                <button 
                  role="tab"
                  onClick={() => setActiveTab('simulator')}
                  aria-selected={activeTab() === 'simulator'}
                >
                  Simulator
                </button>
                <Show when={Checker}>
                  <button 
                    role="tab"
                    onClick={() => setActiveTab('checker')}
                    aria-selected={activeTab() === 'checker'}
                  >
                    Algorithm Checker
                  </button>
                </Show>
              </div>
              <button class="theme-toggle" onClick={toggleDarkMode}>
                {darkMode() ? '☀' : '🌙'}
              </button>
            </div>
          </header>
          
          <Switch>
            <Match when={activeTab() === 'simulator'}>
              <section>
                <div style={{"display": "flex", "gap": "1em", "align-items": "center", "flex-wrap": "wrap"}}>
                  <div>
                    <strong>Round {indexInPath()}</strong>
                    {' '}
                    <button onClick={onPrevious} disabled={indexInPath() === 0}>Previous {'<'}</button>
                    {' '}
                    <button onClick={onNext}>{'>'} Next</button>
                  </div>
                  
                  <Show when={branchCount() > 1}>
                    <div style={{"border-left": "2px solid #ccc", "padding-left": "1em"}}>
                      <strong>Branch {currentBranchIndex()} ∈ [0, {branchCount() - 1}]</strong>
                      {' '}
                      <button 
                        onClick={() => setBranchIndex(Math.max(currentBranchIndex() - 1, 0))}
                        disabled={currentBranchIndex() === 0}
                      >
                        {'<'}
                      </button>
                      {' '}
                      <button 
                        onClick={() => setBranchIndex(Math.min(currentBranchIndex() + 1, branchCount() - 1))}
                        disabled={currentBranchIndex() >= branchCount() - 1}
                      >
                        {'>'}
                      </button>
                    </div>
                  </Show>
                  <div style={{"font-size": "0.9em", "color": "#666"}}>
                    {branchCount() === 1 ? 
                      'Single execution path' : 
                      `${branchCount()} possible execution paths`
                    }
                  </div>
                </div>
                <div style={{"margin-top": "0.5em", "font-family": "monospace", "font-size": "0.9em"}}>
                  <strong>Path:</strong> [
                    <For each={executionPath()}>
                    {(step, idx) => (
                      <span 
                        style={{
                          color: idx() <= indexInPath() ? 'inherit' : '#999',
                          "text-decoration": idx() <= indexInPath() ? 'none' : 'line-through',
                          cursor: idx() <= indexInPath() ? 'pointer' : 'default',
                          "text-decoration-color": idx() <= indexInPath() ? 'transparent' : '#999'
                        }}
                        onClick={() => idx() <= indexInPath() && setIndexInPath(idx())}
                        title={idx() <= indexInPath() ? `Jump to step ${idx()}` : ''}
                      >
                        {idx() > 0 ? ', ' : ''}{step}
                      </span>
                    )}
                  </For>
                  ]
                </div>
              </section>
              <section style={{ display: 'grid', 'grid-template-columns': '500px 1fr', gap: '2rem', 'align-items': 'start' }}>
                <div style={{ position: 'sticky', top: '1rem', 'align-self': 'start' }}>
                  <canvas 
                    ref={canvas} 
                    width="500" 
                    height="300"
                    onClick={handleCanvasClick}
                    style={{ cursor: 'pointer', border: '1px solid #ccc' }}
                  />
                  <Show when={config() && startedProject().baseModel &&  Projects[project()].debugConfig}>
                    <pre style={{"text-align": "left", width:"500px", margin: "1rem 0"}}>
                      {Projects[project()].debugConfig!(config()!, startedProject().baseModel!)}
                    </pre>
                  </Show>
                </div>
                <Show when={config()}>
                  <div>
                    <Show when={Projects[project()].getAlgorithmViewInfo && Projects[project()].getAlgorithmViewInfo!(config()!)}>
                    {(viewInfo) => {
                      console.log('Rendering AlgorithmViewer for project', viewInfo);
                      return (
                        <AlgorithmViewer 
                          algorithm={viewInfo().algorithm}
                          procedures={viewInfo().procedures}
                          agentStates={viewInfo().agentStates}
                        />
                      );
                    }}
                    </Show>
                  </div>
                </Show>
              </section>
              <section>
                <Show when={selectedAgent()}>
                  <div style={{ "padding": "1em", "background-color": "#f5f5f5", "border-radius": "4px" }}>
                    <h3>Agent Details</h3>
                    <p><strong>Agent ID:</strong> {selectedAgent()!.agentId}</p>
                    <p><strong>Node Position:</strong> {selectedAgent()!.nodeIndex}</p>
                    <p><strong>Status:</strong> {selectedAgent()!.isCrashed ? '❌ Crashed' : '✓ Active'}</p>
                    <p><strong>Round:</strong> {selectedAgent()!.round}</p>
                    <Show when={selectedAgent()!.agent}>
                      <details>
                        <summary style={{ cursor: 'pointer', "font-weight": 'bold' }}>Full Agent State</summary>
                        <pre style={{ "font-size": "0.8em", "overflow": "auto" }}>
                          {JSON.stringify(selectedAgent()!.agent, null, 2)}
                        </pre>
                      </details>
                    </Show>
                    <button onClick={() => setSelectedAgent(null)} style={{ "margin-top": "0.5em" }}>
                      Clear Selection
                    </button>
                  </div>
                </Show>
              </section>
              <section class="grid">
                <div>
                  <h3>Current Settings</h3>
                  <Show when={Projects[project()].editorSchema}>
                    <GenericEditor 
                        schema={Projects[project()].editorSchema!}
                        onInput={(v: any) => {
                          setExecutionPath([0]);
                          setIndexInPath(0);
                          setProjectUserSettings(v);
                        }} 
                        value={projectUserSettings()} 
                      />
                  </Show>
                  <div>
                    <button onClick={handleSaveSettings} disabled={!projectUserSettings()}>Save Settings</button>
                  </div>
                </div>
                <div>
                  <Show when={predefinedSettings().length > 0}>
                    <h3>Predefined Settings</h3>
                    <ul>
                      <For each={predefinedSettings()}>
                      {(s: any) => (
                        <li style={{"margin-bottom": '0.5em'}}>
                          <b>{s.name}</b>
                          <button class="outline" style={{"margin-left": '1em'}} onClick={() => handleLoadSettings(s)}>Load</button>
                          <button class="outline" style={{"margin-left": '0.5em'}} onClick={() => handleDeleteSettings(s.name)}>Delete</button>
                          <button class="outline" style={{"margin-left": '0.5em'}} onClick={() => handleShareSettings(project(), s)}>Share</button>
                        </li>
                      )}
                      </For>
                    </ul>
                  </Show>
                  <h3>Saved Settings (in your locale storage)</h3>
                  <Show when={savedSettings().length > 0}
                    fallback={<div>No saved settings.</div>}
                    >
                    <ul>
                      <For each={savedSettings()}>
                        {(s: any) => (
                          <li style={{"margin-bottom": '0.5em'}}>
                            <b>{s.name}</b>
                            <button class="outline" style={{"margin-left": '1em'}} onClick={() => handleLoadSettings(s)}>Load</button>
                            <button class="outline" style={{"margin-left": '0.5em'}} onClick={() => handleDeleteSettings(s.name)}>Delete</button>
                            <button class="outline" style={{"margin-left": '0.5em'}} onClick={() => handleShareSettings(project(), s)}>Share</button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </section>
              
              <Show when={'executionStatusChecker' in Projects[project()] && projectUserSettings()}>
                <section>
                  <h3>Configuration Graph</h3>
                  <p style={{"font-size": "0.9em", "color": "#666"}}>
                    Visualize and explore the execution graph for the current configuration.
                  </p>
                  
                  <button onClick={() => setShowConfigGraph(!showConfigGraph())}>
                    {showConfigGraph() ? 'Hide Configuration Graph' : 'Show Configuration Graph'}
                  </button>
                  
                  <Show when={showConfigGraph()}>
                    <ConfigGraphGenerator
                      settings={projectUserSettings()}
                      setup={Projects[project()].setup}
                      executionStatusChecker={Projects[project()].executionStatusChecker!}
                      drawConfig={Projects[project()].drawConfig}
                      projectName={project()}
                      createWorker={props.createGraphWorker}
                      configRadius={50}
                      horizontalSpacing={140}
                      verticalSpacing={150}
                    />
                  </Show>
                </section>
              </Show>
              
              <section>
                {setupLog() && <mark>{setupLog()}</mark>}
              </section>
            </Match>
          
            <Match when={activeTab() === 'checker'}>
              <section>
                <Show when={Checker}>
                  {(CheckerComponent) => <Dynamic component={CheckerComponent()} />}
                </Show>
              </section>
            </Match>
          </Switch> 
        </article>
      </main>
    </div>
  );
};

export default SimulatorApp;
