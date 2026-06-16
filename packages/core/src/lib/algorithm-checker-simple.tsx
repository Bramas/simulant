import { createSignal, Show } from "solid-js";
import { Config, execute } from "./system";

export type ExecutionStatus = 'success' | 'failure' | 'inProgress';
export type SettingsGeneratorResult<T> = { value: T, done: boolean };

export interface AlgorithmCheckerProps<T> {
  settingsGenerator: () => Generator<T>;
  setup: (settings: T) => any;
  executionStatusChecker: (config: Config<any, any, any, any, any, any>, model: any, configs: any[]) => ExecutionStatus;
  maxIterationsPerExecution?: number;
}

export function AlgorithmChecker<T>(props: AlgorithmCheckerProps<T>) {
  const [isRunning, setIsRunning] = createSignal(false);
  const [progress, setProgress] = createSignal<{ tested: number, succeeded: number, failed: number }>({
    tested: 0,
    succeeded: 0,
    failed: 0
  });
  const [currentSettings, setCurrentSettings] = createSignal<T | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  
  // Get the next settings to test
  const nextSettings = (generator: Generator<T>) => {
    try {
      const result = generator.next() as SettingsGeneratorResult<T>;
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

  // Test a single setting
  const testSettings = async (settings: T, generator: Generator<T>) => {
    try {
      setCurrentSettings(settings);
      const model = props.setup(settings);
      const execution = execute(model);

      // Store configs for potential counter-example
      const configs: any[] = [];
      
      // Execute up to maxIterationsPerExecution or until terminal state
      const maxIterations = props.maxIterationsPerExecution || 1000;
      let status: ExecutionStatus = 'inProgress';
      
      for (let i = 0; i < maxIterations; i++) {
        const config = execution.get(i);
        configs.push(config);

        // Check the status of the execution
        status = props.executionStatusChecker(config, model, configs);
        
        // If we've reached a terminal state, break
        if (status !== 'inProgress') {
          break;
        }
      }

      // Update progress
      setProgress(prev => ({ 
        tested: prev.tested + 1, 
        succeeded: prev.succeeded + (status === 'success' ? 1 : 0),
        failed: prev.failed + (status === 'failure' ? 1 : 0)
      }));

      // If this is a failure, log the counter-example
      if (status === 'failure') {
        console.log('Counter example found!');
        console.log('Settings:', settings);
        console.log('Final config:', configs[configs.length - 1]);
        console.log('All configs:', configs);
        
        setIsRunning(false);
        return false;
      }

      // If still in progress after max iterations, treat as failure
      if (status === 'inProgress') {
        console.log('Algorithm did not terminate in', maxIterations, 'steps');
        console.log('Settings:', settings);
        console.log('Final config:', configs[configs.length - 1]);
        
        setIsRunning(false);
        return false;
      }

      // Success, continue with the next settings
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
    setProgress({ tested: 0, succeeded: 0, failed: 0 });
    
    const generator = props.settingsGenerator();
    
    while (isRunning()) {
      const settings = nextSettings(generator);
      if (!settings) {
        break;
      }

      const success = await testSettings(settings, generator);
      if (!success || !isRunning()) {
        break;
      }

      // Small delay to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };

  // Stop the checking process
  const stopChecking = () => {
    setIsRunning(false);
  };

  return (
    <div>
      <h3>Algorithm Checker</h3>
      
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

      <div class="progress" style={{ "margin-bottom": "15px", "padding": "10px", "background-color": "#f5f5f5", "border-radius": "4px" }}>
        <p>
          Tested: {progress().tested} |
          Succeeded: {progress().succeeded} |
          Failed: {progress().failed}
        </p>
        {isRunning() && currentSettings() && (
          <p>Testing: {JSON.stringify(currentSettings())}</p>
        )}
      </div>

      <Show when={error()}>
        <div class="error" style={{ "color": "red", "margin-bottom": "15px", "padding": "10px", "background-color": "#ffeeee", "border-radius": "4px" }}>
          <p>Error: {error()}</p>
        </div>
      </Show>
    </div>
  );
}
