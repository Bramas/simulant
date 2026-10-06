import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';

import { getPredefinedSettings, projects } from '../../src/projects';

export default function App() {
  return (
    <SimulatorApp
      title="Black Hole Search"
      projects={projects}
      getPredefinedSettings={getPredefinedSettings}
      createGraphWorker={() => new Worker(new URL('./workers/graph-worker.ts', import.meta.url), { type: 'module' })}
      storageKey="black-hole-search-settings-v1"
    />
  );
}
