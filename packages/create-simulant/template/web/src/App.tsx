import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';
import { projects } from '../../src/projects';

export default function App() {
  return (
    <SimulatorApp
      title="My simulation"
      projects={projects}
      createGraphWorker={() => new Worker(new URL('./workers/graph-worker.ts', import.meta.url), { type: 'module' })}
      storageKey="simulant-project-settings"
    />
  );
}
