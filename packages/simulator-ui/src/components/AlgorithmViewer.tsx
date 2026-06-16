/**
 * Algorithm Viewer Component
 * Displays structured algorithms with multi-agent line highlighting
 */

import { For, createMemo, Show, createEffect } from 'solid-js';
import type { AlgorithmStructure, AlgorithmLine } from '@bramas/simulant-core/types/algorithm-structure';
import './AlgorithmViewer.css';

export interface AgentExecutionState {
  agentId: string;
  currentLine: number;
  color: string;
  /** ID of the algorithm/procedure currently executing (e.g., "algo1", "cautious-walk") */
  currentAlgorithm: string;
  /** Optional string representation of the agent's internal state */
  stateDescription?: string;
}

export interface AlgorithmViewerProps {
  /** Main algorithm to display */
  algorithm: AlgorithmStructure;
  /** Additional procedures that can be called (e.g., cautious-walk) */
  procedures?: AlgorithmStructure[];
  /** Current execution state for each agent */
  agentStates?: AgentExecutionState[];
  /** Highlight a specific line (for single-agent mode) */
  highlightLine?: number;
  /** Show line numbers */
  showLineNumbers?: boolean;
}

/**
 * Component for formatting line text with syntax highlighting
 */
function FormattedLineText(props: { line: AlgorithmLine }) {
  const text = createMemo(() => props.line.text);
  const type = createMemo(() => props.line.type);

  // Highlight control structure keywords
  return (
    <Show when={type() === 'if' || type() === 'elseif'} fallback={
      <Show when={type() === 'while'} fallback={
        <Show when={type() === 'loop'} fallback={
            <Show when={type() === 'else'} fallback={
            <Show when={type() === 'assignment'} fallback={
                <Show when={type() === 'command'} fallback={
                <Show when={type() === 'procedure-call'} fallback={
                    <Show when={type() === 'return'} fallback={
                    <span>{text()}</span>
                    }>
                    <span class="keyword">{text()}</span>
                    </Show>
                }>
                    {(() => {
                    const match = text().match(/^(execute)\s+(\w+)\(([^)]*)\)/);
                    if (match) {
                        return (
                        <>
                            <span class="keyword">{match[1]}</span>{' '}
                            <span class="procedure-name">{match[2]}</span>
                            <span class="punctuation">(</span>
                            {match[3]}
                            <span class="punctuation">)</span>
                        </>
                        );
                    }
                    return <span>{text()}</span>;
                    })()}
                </Show>
                }>
                {(() => {
                    const commandMatch = text().match(/^([A-Z-]+(?:-[A-Z]+)*)/);
                    if (commandMatch) {
                    return (
                        <>
                        <span class="command">{commandMatch[1]}</span>
                        {text().substring(commandMatch[1].length)}
                        </>
                    );
                    }
                    return <span>{text()}</span>;
                })()}
                </Show>
            }>
                {(() => {
                const parts = text().split('←');
                if (parts.length === 2) {
                    return (
                    <>
                        <span class="variable">{parts[0].trim()}</span>
                        {' '}
                        <span class="operator">←</span>
                        {' '}
                        <span class="value">{parts[1].trim()}</span>
                    </>
                    );
                }
                return <span>{text()}</span>;
                })()}
            </Show>
            }>
            <span class="keyword">{text()}</span>
            </Show>
            }>
            <span class="keyword">{text()}</span>
            </Show>
        }>
        {(() => {
          const match = text().match(/^(while)\s+(.+)$/);
          if (match) {
            return (
              <>
                <span class="keyword">{match[1]}</span>{' '}
                <span class="condition">{match[2]}</span>
              </>
            );
          }
          return <span>{text()}</span>;
        })()}
      </Show>
    }>
      {(() => {
        const match = text().match(/^(if|else if)\s+(.+)$/);
        if (match) {
          return (
            <>
              <span class="keyword">{match[1]}</span>{' '}
              <span class="condition">{match[2]}</span>
            </>
          );
        }
        return <span>{text()}</span>;
      })()}
    </Show>
  );
}

/**
 * Component for rendering a single algorithm with all its lines
 */
function AlgorithmSection(props: {
  algorithm: AlgorithmStructure;
  showLineNumbers: boolean;
  agentsInThisAlgo: Map<number, AgentExecutionState[]>;
  highlightLine?: number;
}) {


  return (
    <div class="algorithm-section">
      <div class="algorithm-header">
        <h3 class="algorithm-caption">{props.algorithm.caption}</h3>
        <Show when={props.algorithm.input}>
          <div class="algorithm-input">
            <span class="input-label">Input:</span> {props.algorithm.input}
          </div>
        </Show>
      </div>
      
      <div class="algorithm-body">
        <For each={props.algorithm.lines}>
          {(line) => {
            // Create reactive highlighted state for each line
            const highlighted = createMemo(() => {
              if (props.highlightLine !== undefined && props.highlightLine === line.lineNumber) {
                return true;
              }
              return props.agentsInThisAlgo.has(line.lineNumber);
            });

            return (
              <AlgorithmLineView
                line={line}
                showLineNumbers={props.showLineNumbers}
                highlighted={highlighted()}
                agentsAtLine={props.agentsInThisAlgo.get(line.lineNumber) || []}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
}

/**
 * Component for rendering a single algorithm line with markers
 */
function AlgorithmLineView(props: {
  line: AlgorithmLine;
  showLineNumbers: boolean;
  highlighted: boolean;
  agentsAtLine: AgentExecutionState[];
}) {
  const lineClasses = createMemo(() => [
    'algorithm-line',
    `line-type-${props.line.type}`,
    `indent-level-${props.line.indent}`,
    props.highlighted ? 'highlighted' : '',
  ].filter(Boolean).join(' '));
  
  // Generate indentation guides
  const indentGuides = createMemo(() => {
    const guides = [];
    for (let i = 0; i < props.line.indent; i++) {
      guides.push(i);
    }
    return guides;
  });
  
  return (
    <div 
      class={lineClasses()}
      data-line-number={props.line.lineNumber}
      data-label={props.line.label}
    >
      <Show when={props.showLineNumbers}>
        <span class="line-number">{props.line.lineNumber}</span>
      </Show>
      
      <span class="line-content" style={{ 'padding-left': `${props.line.indent * 2}ch` }}>
        {/* Indentation guides */}
        <For each={indentGuides()}>
          {(level) => (
            <span 
              class="indent-guide" 
              style={{ left: `${level * 2}ch` }}
            />
          )}
        </For>
        
        <FormattedLineText line={props.line} />
      </span>
      
      {/* Agent markers - at the end of the line, pointing left since they're at the end */}
      <Show when={props.agentsAtLine.length > 0}>
        <div class="agent-markers">
          <For each={props.agentsAtLine}>
            {(agent) => (
              <span 
                class="agent-marker"
                style={{ 
                  color: agent.color,
                  'border-color': agent.color 
                }}
                title={`Agent ${agent.agentId} executing this line`}
              >
                ◀
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function AlgorithmViewer(props: AlgorithmViewerProps) {
  const showLineNumbers = () => props.showLineNumbers ?? true;
  
  /**
   * Get all algorithms (main + procedures) as a map
   */
  const allAlgorithms = createMemo(() => {
    const map = new Map<string, AlgorithmStructure>();
    map.set(props.algorithm.id, props.algorithm);
    if (props.procedures) {
      for (const proc of props.procedures) {
        map.set(proc.id, proc);
      }
    }
    return map;
  });
  
  /**
   * Get all agents that are at a specific line in a specific algorithm
   * Returns a map: algorithmId -> lineNumber -> agents[]
   */
  const getAgentsAtLine = createMemo(() => {
    if (!props.agentStates) return new Map<string, Map<number, AgentExecutionState[]>>();
    
    const algoToLineToAgents = new Map<string, Map<number, AgentExecutionState[]>>();
    
    for (const state of props.agentStates) {
      if (!algoToLineToAgents.has(state.currentAlgorithm)) {
        algoToLineToAgents.set(state.currentAlgorithm, new Map());
      }
      const lineToAgents = algoToLineToAgents.get(state.currentAlgorithm)!;
      const agents = lineToAgents.get(state.currentLine) || [];
      agents.push(state);
      lineToAgents.set(state.currentLine, agents);
    }
    
    return algoToLineToAgents;
  });
  
  /**
   * Get which algorithms are currently being executed (have at least one agent)
   */
  const activeAlgorithmIds = createMemo(() => {
    const agentsMap = getAgentsAtLine();
    const ids: string[] = [];
    
    // Always show main algorithm first
    ids.push(props.algorithm.id);
    
    // Add procedures that have active agents
    if (props.procedures) {
      for (const proc of props.procedures) {
        if (agentsMap.has(proc.id)) {
          ids.push(proc.id);
        }
      }
    }
    
    return ids;
  });
  
  return (
    <div class="algorithm-viewer">
      <For each={activeAlgorithmIds()}>
        {(algoId) => {

          const agentsInThisAlgo = createMemo(() => getAgentsAtLine().get(algoId) || new Map());

          return (<Show when={allAlgorithms().get(algoId)}>
            <AlgorithmSection
              algorithm={allAlgorithms().get(algoId)!}
              showLineNumbers={showLineNumbers()}
              agentsInThisAlgo={agentsInThisAlgo()}
              highlightLine={props.highlightLine}
            /></Show>
          );
        }}
      </For>
      
      {/* Agent legend */}
      <Show when={props.agentStates && props.agentStates.length > 0}>
        <div class="agent-legend">
          <h4>Agents:</h4>
          <For each={props.agentStates}>
            {(agent) => (
              <div class="agent-legend-item">
                <span 
                  class="agent-color-box" 
                  style={{ 'background-color': agent.color }}
                />
                <span class="agent-id">{agent.agentId}</span>
                <span class="agent-line">
                  in <strong>{allAlgorithms().get(agent.currentAlgorithm)?.caption || agent.currentAlgorithm}</strong> at line {agent.currentLine}
                </span>
                <Show when={agent.stateDescription}>
                  <span class="agent-state-description"> — {agent.stateDescription}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
