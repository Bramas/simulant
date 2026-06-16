import { createSignal, For, Show, createEffect, onMount, onCleanup } from "solid-js";
import { execute } from "@mobile-entities/core/lib/system";

export type ExecutionStatus = 'success' | 'failure' | 'inProgress';

export type GraphNode = {
  path: number[];
  status: 'success' | 'failure' | 'inProgress';
  depth: number;
  childrenCount: number;
  x?: number;
  y?: number;
  configKey?: string;
};

export type WorkerRequest = {
  type: 'generate';
  maxDepth: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  settings: any;
  projectName: string;
};

export type WorkerResponse = {
  type: 'progress' | 'complete' | 'error';
  nodes?: GraphNode[];
  stats?: {
    totalNodes: number;
    successNodes: number;
    failureNodes: number;
    inProgressNodes: number;
    maxDepthReached: number;
  };
  error?: string;
};

export interface ConfigGraphGeneratorProps<T, ConfigType, ModelType> {
  settings: T;
  setup: (settings: T) => ModelType;
  executionStatusChecker: (config: ConfigType, model: ModelType, configs: ConfigType[]) => ExecutionStatus;
  drawConfig?: (ctx: CanvasRenderingContext2D, config: ConfigType, model: ModelType, options: any) => any;
  configRadius?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  projectName?: string; // Name of the project for the worker
  createWorker?: () => Worker;
}


export function ConfigGraphGenerator<T, ConfigType, ModelType>(
  props: ConfigGraphGeneratorProps<T, ConfigType, ModelType>
) {
  const [maxDepth, setMaxDepth] = createSignal(10);
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [graph, setGraph] = createSignal<GraphNode[]>([]);
  const [graphSettings, setGraphSettings] = createSignal<T | null>(null); // Settings used to generate the current graph
  const [viewMode, setViewMode] = createSignal<'list' | 'tree' | 'visual'>('list');
  const [selectedNode, setSelectedNode] = createSignal<GraphNode | null>(null);
  const [stats, setStats] = createSignal({
    totalNodes: 0,
    successNodes: 0,
    failureNodes: 0,
    inProgressNodes: 0,
    maxDepthReached: 0
  });
  
  // Pan and Zoom state for visual mode
  const [panOffset, setPanOffset] = createSignal({ x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(1);
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = createSignal(false); // Track if mouse has moved during drag
  
  // Fixed canvas dimensions
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 800;
  
  let canvas: HTMLCanvasElement | undefined;
  let worker: Worker | undefined;
  
  const configRadius = props.configRadius || 60;
  const horizontalSpacing = props.horizontalSpacing || 150;
  const verticalSpacing = props.verticalSpacing || 180;
  
  // Cleanup worker on unmount
  onCleanup(() => {
    if (worker) {
      worker.terminate();
    }
  });

  const generateGraph = async () => {
    setIsGenerating(true);
    setGraph([]);
    setGraphSettings(() => props.settings); // Store settings used for this graph
    
    // Use worker if projectName is provided
    if (props.projectName) {
      try {
        worker = props.createWorker?.();
        if (!worker) {
          throw new Error('No worker factory provided.');
        }
        
        // Listen for messages from worker
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const response = e.data;
          
          if (response.type === 'progress' || response.type === 'complete') {
            if (response.nodes) {
              setGraph(response.nodes);
            }
            if (response.stats) {
              setStats(response.stats);
            }
            
            if (response.type === 'complete') {
              setIsGenerating(false);
              worker?.terminate();
              worker = undefined;
            }
          } else if (response.type === 'error') {
            console.error('Worker error:', response.error);
            alert('Error generating graph: ' + response.error);
            setIsGenerating(false);
            worker?.terminate();
            worker = undefined;
          }
        };
        
        worker.onerror = (error) => {
          console.error('Worker error:', error);
          alert('Worker error: ' + error.message);
          setIsGenerating(false);
          worker?.terminate();
          worker = undefined;
        };
        
        // Send request to worker
        const request: WorkerRequest = {
          type: 'generate',
          maxDepth: maxDepth(),
          horizontalSpacing,
          verticalSpacing,
          settings: props.settings,
          projectName: props.projectName
        };
        
        worker.postMessage(request);
        
      } catch (error) {
        console.error('Error creating worker:', error);
        alert('Failed to create worker: ' + (error instanceof Error ? error.message : String(error)));
        setIsGenerating(false);
      }
    } else {
      alert('No project name provided. Worker cannot be used.');
      setIsGenerating(false);
    }
  };
  
  
  const exportGraph = () => {
    const data = {
      settings: props.settings,
      maxDepth: maxDepth(),
      stats: stats(),
      nodes: graph()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-graph-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const renderTree = (path: number[], indent: string = ''): any => {
    const node = graph().find(n => n.path.join('-') === path.join('-'));
    if (!node) return null;
    
    const statusIcon = 
      node.status === 'success' ? '✓' :
      node.status === 'failure' ? '✗' :
      '◯';
    
    const color = 
      node.status === 'success' ? 'green' :
      node.status === 'failure' ? 'red' :
      'orange';
    
    return (
      <div>
        <div style={{ color }}>
          {indent}{statusIcon} [{path.join(', ')}] ({node.childrenCount} children)
        </div>
        <For each={Array.from({ length: node.childrenCount }, (_, i) => i)}>
          {(childIndex) => renderTree([...path, childIndex], indent + '  ')}
        </For>
      </div>
    );
  };
  
  // Draw the visual graph on canvas
  createEffect(() => {
    const currentGraph = graph();
    const currentViewMode = viewMode();
    const offset = panOffset();
    const z = zoom();
        
    if (!canvas || currentGraph.length === 0 || currentViewMode !== 'visual') return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return;
    }

    
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Apply pan offset and zoom
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(z, z);
    
    // Calculate visible bounds in world coordinates
    const visibleBounds = {
      left: -offset.x / z - configRadius * 2,
      right: (CANVAS_WIDTH - offset.x) / z + configRadius * 2,
      top: -offset.y / z - configRadius * 2,
      bottom: (CANVAS_HEIGHT - offset.y) / z + configRadius * 2
    };
    
    // Helper function to check if a node is visible
    const isNodeVisible = (node: GraphNode) => {
      if (node.x === undefined || node.y === undefined) return false;
      return node.x >= visibleBounds.left && 
             node.x <= visibleBounds.right && 
             node.y >= visibleBounds.top && 
             node.y <= visibleBounds.bottom;
    };
    
    // Filter visible nodes
    const visibleNodes = currentGraph.filter(isNodeVisible);
    
    // Draw connections first (only for visible nodes)
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2 / z; // Scale line width so it remains constant visually
    
    for (const node of visibleNodes) {
      if (node.path.length === 1) continue; // Skip root's parent
      
      // Find parent
      const parentPath = node.path.slice(0, -1);
      const parent = currentGraph.find(n => n.path.join('-') === parentPath.join('-'));
      
      if (parent && node.x !== undefined && node.y !== undefined && parent.x !== undefined && parent.y !== undefined) {
        // Only draw if parent or child is visible
        if (isNodeVisible(parent) || isNodeVisible(node)) {
          // Draw arrow from parent to child
          ctx.beginPath();
          ctx.moveTo(parent.x, parent.y);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();
          
          // Draw arrow head
          const angle = Math.atan2(node.y - parent.y, node.x - parent.x);
          const arrowSize = 10 / z;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(
            node.x - arrowSize * Math.cos(angle - Math.PI / 6),
            node.y - arrowSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(
            node.x - arrowSize * Math.cos(angle + Math.PI / 6),
            node.y - arrowSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
    }
    
    // Draw nodes - only if drawConfig is provided
    if (props.drawConfig) {
      // Use the settings that were used to generate the graph, not the current props.settings
      const currentGraphSettings = graphSettings();
      if (!currentGraphSettings) return;
      
      try {
        const model = props.setup(currentGraphSettings);
        // @ts-ignore
        const execution = execute(model);
        
        for (const node of visibleNodes) {
          if (node.x === undefined || node.y === undefined) continue;
          
          // @ts-ignore
          const config = execution.get(node.path) as ConfigType;
          
          // Draw status circle
          ctx.fillStyle = 
            node.status === 'success' ? '#d4edda' :
            node.status === 'failure' ? '#f8d7da' :
            '#fff3cd';
          
          ctx.beginPath();
          ctx.arc(node.x, node.y, configRadius + 5, 0, 2 * Math.PI);
          ctx.fill();
          
          ctx.strokeStyle = 
            node.status === 'success' ? 'green' :
            node.status === 'failure' ? 'red' :
            'orange';
          ctx.lineWidth = (selectedNode()?.path.join('-') === node.path.join('-') ? 4 : 2) / z;
          ctx.stroke();
          
          // Draw configuration if drawConfig is provided
          try {
            ctx.save();
            ctx.translate(node.x, node.y);
            
            // Scale down the configuration to fit the node
            // Assuming standard radius of 100 for drawConfig
            const standardRadius = 100;
            const scaleFactor = (configRadius - 10) / standardRadius;
            ctx.scale(scaleFactor, scaleFactor);

            props.drawConfig(ctx, config, model, {
              centerX: 0,
              centerY: 0,
              radius: standardRadius,
              nodeRadius: 10,
              agentRadius: 5,
              showNodeLabels: false
            });
            ctx.restore();
          } catch (e) {
            console.error('Error drawing config in visual graph:', e);
          }
          
          // Draw path label
          ctx.fillStyle = 'black';
          ctx.font = `${10 / z}px Arial`; // Scale font size
          ctx.textAlign = 'center';
          ctx.fillText(
            `[${node.path.join(',')}]`,
            node.x,
            node.y + configRadius + 15 / z
          );
        }
        
        console.log('Visual graph drawn successfully');
      } catch (e) {
        console.error('Error in visual graph drawing:', e);
      }
    } else {
      // Simple drawing without configurations (only visible nodes)
      for (const node of visibleNodes) {
        if (node.x === undefined || node.y === undefined) continue;
        
        // Draw status circle
        ctx.fillStyle = 
          node.status === 'success' ? '#d4edda' :
          node.status === 'failure' ? '#f8d7da' :
          '#fff3cd';
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, configRadius + 5, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = 
          node.status === 'success' ? 'green' :
          node.status === 'failure' ? 'red' :
          'orange';
        ctx.lineWidth = (selectedNode()?.path.join('-') === node.path.join('-') ? 4 : 2) / z;
        ctx.stroke();
        
        // Draw path label
        ctx.fillStyle = 'black';
        ctx.font = `${10 / z}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(
          `[${node.path.join(',')}]`,
          node.x,
          node.y + configRadius + 15 / z
        );
      }
    }
    
    // Restore context
    ctx.restore();
  });
  
  // Handle canvas clicks and panning
  const handleCanvasMouseDown = (e: MouseEvent) => {
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const offset = panOffset();
    const z = zoom();
    
    // Adjust for pan offset and zoom
    const worldX = (x - offset.x) / z;
    const worldY = (y - offset.y) / z;
    
    // Check if clicking on a node
    let clickedNode: GraphNode | null = null;
    for (const node of graph()) {
      if (node.x === undefined || node.y === undefined) continue;
      
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= configRadius + 5) {
        clickedNode = node;
        break;
      }
    }
    
    // Start potential panning (but don't select node yet)
    setIsPanning(true);
    setHasMoved(false);
    setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    
    // Store the clicked node for later (on mouse up)
    (e.currentTarget as any)._clickedNode = clickedNode;
    
    if (canvas) {
      canvas.style.cursor = 'grabbing';
    }
  };
  
  const handleCanvasMouseMove = (e: MouseEvent) => {
    if (isPanning()) {
      const start = panStart();
      const deltaX = e.clientX - start.x - panOffset().x;
      const deltaY = e.clientY - start.y - panOffset().y;
      
      // If moved more than a few pixels, consider it a drag
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        setHasMoved(true);
      }
      
      setPanOffset({
        x: e.clientX - start.x,
        y: e.clientY - start.y
      });
      return;
    }
    
    // Update cursor based on whether hovering over a node
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const offset = panOffset();
    const z = zoom();
    
    const worldX = (x - offset.x) / z;
    const worldY = (y - offset.y) / z;
    
    let hoveringNode = false;
    for (const node of graph()) {
      if (node.x === undefined || node.y === undefined) continue;
      
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= configRadius + 5) {
        hoveringNode = true;
        break;
      }
    }
    
    canvas.style.cursor = hoveringNode ? 'pointer' : 'grab';
  };

  const handleWheel = (e: WheelEvent) => {
    if (!canvas) return;
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.min(Math.max(0.1, zoom() + delta), 5);
    
    // Zoom towards mouse pointer
    // world = (screen - pan) / oldZoom
    // newPan = screen - world * newZoom
    
    const offset = panOffset();
    const worldX = (mouseX - offset.x) / zoom();
    const worldY = (mouseY - offset.y) / zoom();
    
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;
    
    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  };
  
  const handleCanvasMouseUp = (e: MouseEvent) => {
    if (isPanning()) {
      setIsPanning(false);
      
      // Only select node if we didn't move (it's a click, not a drag)
      if (!hasMoved()) {
        const clickedNode = (e.currentTarget as any)._clickedNode;
        if (clickedNode) {
          setSelectedNode(clickedNode);
        } else {
          setSelectedNode(null);
        }
      }
      
      // Clean up
      delete (e.currentTarget as any)._clickedNode;
      
      if (canvas) {
        canvas.style.cursor = 'grab';
      }
    }
  };
  
  const handleCanvasMouseLeave = () => {
    if (isPanning()) {
      setIsPanning(false);
      setHasMoved(false);
      if (canvas) {
        canvas.style.cursor = 'grab';
      }
    }
  };

  return (
    <div style={{ padding: '1em' }}>
      <h3>Configuration Graph Generator</h3>
      
      <div style={{ "margin-bottom": "1em" }}>
        <label>
          Max Depth (rounds): 
          <input 
            type="number" 
            value={maxDepth()} 
            onInput={(e) => setMaxDepth(parseInt(e.currentTarget.value) || 10)}
            min="1"
            max="1000"
            style={{ "margin-left": "0.5em", "width": "80px" }}
          />
        </label>
      </div>
      
      <div style={{ "margin-bottom": "1em" }}>
        <button onClick={generateGraph} disabled={isGenerating()}>
          {isGenerating() ? 'Generating...' : 'Generate Graph'}
        </button>
        {graph().length > 0 && (
          <button onClick={exportGraph} style={{ "margin-left": "0.5em" }}>
            Export Graph (JSON)
          </button>
        )}
      </div>
      
      <Show when={stats().totalNodes > 0}>
        <div style={{ 
          "margin-bottom": "1em", 
          "padding": "1em", 
          "background-color": "#f5f5f5", 
          "border-radius": "4px" 
        }}>
          <h4 style={{ "margin-top": "0" }}>Statistics</h4>
          <p><strong>Total Nodes:</strong> {stats().totalNodes}</p>
          <p><strong>Success Nodes:</strong> <span style={{ color: 'green' }}>{stats().successNodes}</span></p>
          <p><strong>Failure Nodes:</strong> <span style={{ color: 'red' }}>{stats().failureNodes}</span></p>
          <p><strong>In Progress Nodes:</strong> {stats().inProgressNodes}</p>
          <p><strong>Max Depth Reached:</strong> {stats().maxDepthReached}</p>
          
          <div style={{ "margin-top": "1em" }}>
            <label>
              View Mode:{' '}
              <select value={viewMode()} onChange={(e) => setViewMode(e.currentTarget.value as 'list' | 'tree' | 'visual')}>
                <option value="list">List by Depth</option>
                <option value="tree">Tree View</option>
                <Show when={props.drawConfig}>
                  <option value="visual">Visual Graph</option>
                </Show>
              </select>
            </label>
          </div>
        </div>
      </Show>
      
      <Show when={graph().length > 0}>
        <Show when={selectedNode() && viewMode() === 'visual'}>
          <div style={{ 
            "margin-bottom": "1em", 
            "padding": "0.5em", 
            "background-color": "#f0f0f0",
            "border-radius": "4px"
          }}>
            <div>
              <strong>Selected Node:</strong> [{selectedNode()!.path.join(', ')}] | 
              Status: <span style={{ 
                color: selectedNode()!.status === 'success' ? 'green' : 
                       selectedNode()!.status === 'failure' ? 'red' : 'orange'
              }}>
                {selectedNode()!.status}
              </span> | 
              Children: {selectedNode()!.childrenCount}
            </div>
            <Show when={selectedNode()?.configKey}>
              <div style={{ 
                "margin-top": "0.5em", 
                "font-family": "monospace", 
                "font-size": "0.8em",
                "padding": "0.3em",
                "background": "#fff",
                "border": "1px solid #ddd",
                "overflow-x": "auto",
                "white-space": "nowrap"
              }}>
                <strong>Config String:</strong> {selectedNode()!.configKey}
              </div>
            </Show>
          </div>
        </Show>
        
        <Show when={viewMode() === 'visual'}>
          <div style={{ "margin-bottom": "0.5em", "display": "flex", "gap": "0.5em", "align-items": "center" }}>
            <button 
              onClick={() => { setPanOffset({ x: 0, y: 0 }); setZoom(1); }}
              style={{ "font-size": "0.9em" }}
            >
              Reset View
            </button>
            <div style={{ "font-size": "0.9em" }}>
              Zoom: {(zoom() * 100).toFixed(0)}%
              <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} style={{ "margin-left": "0.5em" }}>-</button>
              <button onClick={() => setZoom(z => Math.min(5, z + 0.1))} style={{ "margin-left": "0.2em" }}>+</button>
            </div>
          </div>
          <div style={{ 
            "overflow": "hidden", 
            "border": "1px solid #ccc",
            "background-color": "#fafafa",
            "width": CANVAS_WIDTH + "px",
            "height": CANVAS_HEIGHT + "px"
          }}>
            <canvas 
              ref={canvas} 
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onWheel={handleWheel}
              style={{ cursor: 'grab', display: 'block' }}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
            />
          </div>
          <p style={{ "font-size": "0.9em", "color": "#666" }}>
            Click on a node to see details. Drag to pan. Scroll to zoom. Total nodes: {graph().length}
          </p>
        </Show>
        
        <Show when={viewMode() === 'list'}>
          <div style={{ "margin-top": "1em" }}>
            <h4>Graph Nodes (by depth)</h4>
            <div style={{ 
              "max-height": "400px", 
              "overflow-y": "auto",
              "border": "1px solid #ccc",
              "padding": "0.5em"
            }}>
              <For each={Array.from({ length: stats().maxDepthReached + 1 }, (_, i) => i)}>
                {(depth) => {
                  const nodesAtDepth = graph().filter(n => n.depth === depth);
                  return (
                    <Show when={nodesAtDepth.length > 0}>
                      <details open={depth < 3}>
                        <summary style={{ 
                          "font-weight": "bold", 
                          "margin": "0.5em 0",
                          "cursor": "pointer"
                        }}>
                          Depth {depth} ({nodesAtDepth.length} nodes)
                        </summary>
                        <div style={{ "margin-left": "1em", "font-size": "0.9em" }}>
                          <For each={nodesAtDepth}>
                            {(node) => (
                              <div style={{ 
                                "margin": "0.25em 0",
                                "padding": "0.25em",
                                "background-color": 
                                  node.status === 'success' ? '#d4edda' :
                                  node.status === 'failure' ? '#f8d7da' :
                                  '#fff3cd'
                              }}>
                                Path: [{node.path.join(', ')}] | 
                                Status: <strong>{node.status}</strong> | 
                                Children: {node.childrenCount}
                                <Show when={node.configKey}>
                                  <div style={{ "margin-top": "0.2em", "font-family": "monospace", "font-size": "0.85em", "color": "#555" }}>
                                    {node.configKey}
                                  </div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </details>
                    </Show>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
        
        <Show when={viewMode() === 'tree'}>
          <div style={{ "margin-top": "1em" }}>
            <h4>Tree View</h4>
            <div style={{ 
              "max-height": "500px", 
              "overflow": "auto",
              "border": "1px solid #ccc",
              "padding": "0.5em",
              "font-family": "monospace",
              "font-size": "0.85em"
            }}>
              {renderTree([0])}
            </div>
          </div>
        </Show>
      </Show>
      
      <Show when={isGenerating()}>
        <div style={{ "margin-top": "1em", "font-style": "italic" }}>
          Generating graph... ({stats().totalNodes} nodes explored)
        </div>
      </Show>
    </div>
  );
}
