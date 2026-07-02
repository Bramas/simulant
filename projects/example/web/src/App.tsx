import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';
import { projects } from '../../index';

export default function App() {
  return <SimulatorApp title="Moving on a Ring" projects={projects} storageKey="ring-example-settings-v1" />;
}
