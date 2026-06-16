import { createSignal, Show, For } from "solid-js";
import { Config, execute } from "./system";

export type ExecutionStatus = 'success' | 'failure' | 'inProgress';

export interface AlgorithmCheckerExhaustiveProps<T> {
  settingsGenerator: () => Generator<T>;
  setup: (settings: T) => any;
  executionStatusChecker: (config: Config<any, any, any, any, any, any>, model: any, configs: any[]) => ExecutionStatus;
  maxIterationsPerExecution?: number;
}

type CounterExample<T> = {
  settings: T;
  configs: any[];
  reason: 'failure' | 'timeout';
};

export function AlgorithmCheckerExhaustive<T>(props: AlgorithmCheckerExhaustiveProps<T>) {
  const [isRunning, setIsRunning] = createSignal(false);
  const [progress, setProgress] = createSignal<{ 
    tested: number, 
    succeeded: number, 
    failed: number,
    totalExecutions: number 
  }>({
    tested: 0,
    succeeded: 0,
    failed: 0,
    totalExecutions: 0
  });
  const [currentSettings, setCurrentSettings] = createSignal<T | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [counterExamples, setCounterExamples] = createSignal<CounterExample<T>[]>([]);
  
  // Get the next settings to test
  const nextSettings = (generator: Generator<T>) => {
    try {
      const result = generator.next();
      if (result.done) {
        setIsRunning(false);
        return null;
      }
      return result.value;
    } catch (e) {
      setError(`Error generating settings: ${e instanceof Error ? e.message : String(e)}`);
      setIsRunning(false);
      return null;
    }
  };

  // Test a single setting by exploring all possible executions
  const testSettings = async (settings: T, generator: Generator<T>) => {
    try {
      setCurrentSettings(() => settings);
      const model = props.setup(settings);
      const execution = execute(model);

      const maxIterations = props.maxIterationsPerExecution || 1000;
      
      // BFS exploration of all execution paths
      type PathInfo = {
        path: number[];  // Path in the execution tree
        history: any[];  // Configuration history
      };
      
      const queue: PathInfo[] = [{ path: [0], history: [] }];
      const visited = new Set<string>();
      
      let totalExecutions = 0;
      let successfulExecutions = 0;
      let failedExecutions = 0;
      
      while (queue.length > 0 && isRunning()) {
        const current = queue.shift()!;
        
        // Get the configuration at this path
        const config = execution.get(current.path);
        const newHistory = [...current.history, config];
        
        // Create a unique key for this configuration state
        const stateKey = `${current.path.join(',')}-${JSON.stringify(config)}`;
        if (visited.has(stateKey)) {
          continue;
        }
        visited.add(stateKey);
        
        // Check the status
        const status = props.executionStatusChecker(config, model, newHistory);
        
        if (status === 'success') {
          successfulExecutions++;
          totalExecutions++;
          continue;
        }
        
        if (status === 'failure') {
          failedExecutions++;
          totalExecutions++;
          
          // Record counter-example
          setCounterExamples(prev => [...prev, {
            settings,
            configs: newHistory,
            reason: 'failure'
          }]);
          
          console.log('Counter example found!');
          console.log('Settings:', settings);
          console.log('Execution path:', current.path);
          
          // Stop on first counter-example (optional)
          setProgress(prev => ({
            ...prev,
            tested: prev.tested + 1,
            failed: prev.failed + 1,
            totalExecutions
          }));
          return false;
        }
        
        // If still in progress
        if (current.path.length > maxIterations) {
          failedExecutions++;
          totalExecutions++;
          
          setCounterExamples(prev => [...prev, {
            settings,
            configs: newHistory,
            reason: 'timeout'
          }]);
          
          console.log('Execution did not terminate within', maxIterations, 'steps');
          console.log('Settings:', settings);
          
          setProgress(prev => ({
            ...prev,
            tested: prev.tested + 1,
            failed: prev.failed + 1,
            totalExecutions
          }));
          return false;
        }
        
        // Explore next step - get all possible next configurations
        const nextChildCount = execution.getChildrenCount(current.path);
        
        for (let i = 0; i < nextChildCount; i++) {
          queue.push({
            path: [...current.path, i],
            history: newHistory
          });
        }
        
        // Update progress periodically
        if ((successfulExecutions + failedExecutions) % 100 === 0) {
          setProgress(prev => ({
            ...prev,
            totalExecutions: successfulExecutions + failedExecutions
          }));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // All executions successful
      setProgress(prev => ({
        tested: prev.tested + 1,
        succeeded: prev.succeeded + 1,
        failed: prev.failed,
        totalExecutions: successfulExecutions + failedExecutions
      }));
      
      return true;
    } catch (e) {
      setError(`Error testing settings: ${e instanceof Error ? e.message : String(e)}`);
      setIsRunning(false);
      return false;
    }
  };

  // Start the checking process
  const startChecking = async () => {
    setIsRunning(true);
    setError(null);
    setProgress({ tested: 0, succeeded: 0, failed: 0, totalExecutions: 0 });
    setCounterExamples([]);
    
    const generator = props.settingsGenerator();
    
    while (isRunning()) {
      const settings = nextSettings(generator);
      if (!settings) {
        break;
      }

      const success = await testSettings(settings, generator);
      if (!success) {
        break; // Stop on first counter-example
      }

      // Small delay to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    setIsRunning(false);
  };

  // Stop the checking process
  const stopChecking = () => {
    setIsRunning(false);
  };

  // Load a counter-example into the simulator
  const loadCounterExample = (ce: CounterExample<T>, projectId: string) => {
    // Store in localStorage for the main app to pick up
    localStorage.setItem('runCounterExample', JSON.stringify({
      project: projectId,
      settings: ce.settings
    }));
    
    // Trigger a custom event to switch tabs
    window.dispatchEvent(new CustomEvent('switchToSimulatorTab', { 
      detail: { projectId } 
    }));
    
    // Reload the page to apply the changes
    window.location.reload();
  };

  return (
    <div>
      <h3>Exhaustive Algorithm Checker</h3>
      <p style={{ "font-size": "0.9em", "color": "#666" }}>
        This checker explores all possible non-deterministic executions for each configuration.
      </p>
      
      <div class="controls" style={{ "display": "flex", "gap": "10px", "margin-bottom": "15px" }}>
        <button 
          onClick={startChecking} 
          disabled={isRunning()}
        >
          Start Checking
        </button>
        <button 
          onClick={stopChecking} 
          disabled={!isRunning()}
        >
          Stop Checking
        </button>
      </div>

      <div class="progress" style={{ 
        "margin-bottom": "15px", 
        "padding": "10px", 
        "background-color": "#f5f5f5", 
        "border-radius": "4px" 
      }}>
        <p>
          <strong>Configurations tested:</strong> {progress().tested} | 
          <strong> Succeeded:</strong> {progress().succeeded} | 
          <strong> Failed:</strong> {progress().failed}
        </p>
        <p>
          <strong>Total execution paths explored:</strong> {progress().totalExecutions}
        </p>
        {isRunning() && currentSettings() && (
          <p style={{ "font-style": "italic" }}>
            Currently testing: {JSON.stringify(currentSettings())}
          </p>
        )}
      </div>

      <Show when={error()}>
        <div class="error" style={{ 
          "color": "red", 
          "margin-bottom": "15px", 
          "padding": "10px", 
          "background-color": "#ffeeee", 
          "border-radius": "4px" 
        }}>
          <p><strong>Error:</strong> {error()}</p>
        </div>
      </Show>

      <Show when={counterExamples().length > 0}>
        <div class="counter-examples" style={{ 
          "margin-top": "20px", 
          "padding": "15px", 
          "background-color": "#fff3cd", 
          "border-radius": "4px",
          "border": "1px solid #ffc107"
        }}>
          <h4 style={{ "margin-top": "0" }}>Counter-Examples Found:</h4>
          <For each={counterExamples()}>
            {(ce, index) => (
              <div style={{ 
                "margin-bottom": "15px", 
                "padding": "10px", 
                "background-color": "white", 
                "border-radius": "4px" 
              }}>
                <p>
                  <strong>Counter-example #{index() + 1}</strong> 
                  {ce.reason === 'timeout' ? ' (Timeout)' : ' (Failure)'}
                </p>
                <p style={{ "font-size": "0.85em" }}>
                  <strong>Settings:</strong> {JSON.stringify(ce.settings)}
                </p>
                <p style={{ "font-size": "0.85em" }}>
                  <strong>Execution length:</strong> {ce.configs.length} steps
                </p>
                <button 
                  class="outline"
                  onClick={() => {
                    // Determine project ID from settings if possible
                    const projectId = 'gathering-on-rings'; // You may need to make this dynamic
                    loadCounterExample(ce, projectId);
                  }}
                >
                  Load in Simulator
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
