import { handleGraphRequest, type WorkerRequest } from '@bramas/simulant-core/lib/config-graph';
import { projects } from '../../../src/projects';

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  handleGraphRequest(projects, event.data, response => self.postMessage(response));
});
