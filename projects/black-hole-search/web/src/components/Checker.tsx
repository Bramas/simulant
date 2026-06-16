import { createSignal, Show, Suspense, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import * as BlackHoleSearchAlgo1 from '@bramas/simulant-project-black-hole-search/algo1';
import * as BlackHoleSearchAlgo4 from '@bramas/simulant-project-black-hole-search/algo4';
import * as BlackHoleSearchAlgo2 from '@bramas/simulant-project-black-hole-search/algo2';
import * as BlackHoleSearchAlgo3 from '@bramas/simulant-project-black-hole-search/algo3';

// Map of available projects and their checkers
const CheckerProjects = {
  // Add more projects as they implement checkers
  'black-hole-search-algo4': BlackHoleSearchAlgo4,
  'black-hole-search-algo1': BlackHoleSearchAlgo1,
  'black-hole-search-algo2': BlackHoleSearchAlgo2,
  'black-hole-search-algo3': BlackHoleSearchAlgo3,
};

// Define the Checker component
const Checker: Component = () => {
  const checkerKeys = Object.keys(CheckerProjects) as (keyof typeof CheckerProjects)[];
  const [selectedProject, setSelectedProject] = createSignal<keyof typeof CheckerProjects>(checkerKeys[0]);
  
  return (
    <div>
      <h2>Algorithm Checker</h2>
      <p>Test algorithms with multiple settings to find edge cases and verify correctness. The checker can automatically run your algorithm against many different configurations to find situations where it might fail.</p>
      
      <div style={{"margin-bottom": "1.5rem", "max-width": "500px"}}>
        <label for="project-select">
          <strong>Select Project:</strong>
          <select 
            id="project-select"
            value={selectedProject()} 
            onChange={(e) => {
              setSelectedProject(e.currentTarget.value as keyof typeof CheckerProjects);
            }}
          >
            {checkerKeys.map((p) => (
              <option value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      
      <div class="card" style={{"padding": "1rem", "margin-bottom": "1.5rem"}}>
        <Suspense fallback={<div>Loading checker...</div>}>
          {CheckerProjects[selectedProject()].Checker && (
            <Dynamic component={CheckerProjects[selectedProject()].Checker} />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default Checker;
