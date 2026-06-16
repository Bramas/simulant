import { createMemo, createSignal, Show, Suspense, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import * as GatheringOnRings from '@bramas/simulant-project-gathering-on-rings';
// Import additional project modules here as needed
// import * as GatheringOnLines from '@bramas/simulant-project-gathering-on-lines';
// import * as BlackHoleSearch from '@bramas/simulant-project-black-hole-search';

// Map of available projects and their checkers
const CheckerProjects = {
  'gathering-on-rings': GatheringOnRings,
  // Add more projects as they implement checkers
  // 'gathering-on-lines': GatheringOnLines,
  // 'black-hole-search': BlackHoleSearch,
};

// Define the Checker component
const Checker: Component = () => {
  const checkerKeys = Object.keys(CheckerProjects) as (keyof typeof CheckerProjects)[];
  const [selectedProject, setSelectedProject] = createSignal<keyof typeof CheckerProjects>(checkerKeys[0]);
  
  return (
    <div class="container">
      <article>
        <header>
          <div style={{"display": "flex", "justify-content": "space-between", "align-items": "center"}}>
            <h1>Algorithm Checker</h1>
            <a href="/" class="contrast">← Back to Simulant</a>
          </div>
          <p>Test algorithms with multiple settings to find edge cases and verify correctness</p>
          <select value={selectedProject()} onChange={(e) => {
            setSelectedProject(e.currentTarget.value as keyof typeof CheckerProjects);
          }}>
            {checkerKeys.map((p) => (
              <option value={p}>{p}</option>
            ))}
          </select>
        </header>
        <section>
          <Suspense fallback={<div>Loading checker...</div>}>
            <Show when={CheckerProjects[selectedProject()].Checker}>
              <Dynamic component={CheckerProjects[selectedProject()].Checker} />
            </Show>
          </Suspense>
        </section>
      </article>
    </div>
  );
};

export default Checker;
