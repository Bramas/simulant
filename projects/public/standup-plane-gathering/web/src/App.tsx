import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';
import { getPredefinedSettings, projects } from '../../src/projects';

export default function App() {
  return (
    <SimulatorApp
      title="Planar SUIG · numerical preview"
      projects={projects}
      getPredefinedSettings={getPredefinedSettings}
      storageKey="standup-plane-gathering-settings-v1"
    />
  );
}
