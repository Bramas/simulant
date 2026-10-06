import { SimulatorApp } from '@bramas/simulant-ui/SimulatorApp';
import { projects } from '../../src';

export default function App() {
  return <SimulatorApp title="Moving on a Ring" projects={projects} storageKey="ring-example-settings-v1" />;
}
