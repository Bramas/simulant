/**
 * Type definitions for structured algorithm representation
 * Used for rendering algorithms with dynamic line highlighting
 */

export type ControlStructureType = 
  | 'if'
  | 'loop'
  | 'elseif'
  | 'else'
  | 'while'
  | 'command'
  | 'comment'
  | 'procedure-call'
  | 'assignment'
  | 'return';

export interface AlgorithmLine {
  /** 1-indexed line number as it appears visually */
  lineNumber: number;
  
  /** Indentation level (0 = no indent, 1 = one level, etc.) */
  indent: number;
  
  /** The text content of the line (converted from LaTeX) */
  text: string;
  
  /** Type of control structure or statement */
  type: ControlStructureType;
  
  /** Optional label for cross-referencing (e.g., "algo2:a1 detects") */
  label?: string;
  
  /** 
   * For blocks (if/while/else), which line numbers are part of this block's body
   * Used for highlighting entire blocks or collapsing
   */
  blockLines?: number[];
  
  /**
   * The condition text for if/while statements (without the control keyword)
   */
  condition?: string;
}

export interface AlgorithmStructure {
  /** Algorithm identifier/name (e.g., "algo2") */
  id: string;
  
  /** Algorithm caption/title */
  caption: string;
  
  /** Input description */
  input?: string;
  
  /** All lines in the algorithm */
  lines: AlgorithmLine[];
  
  /** Map of labels to line numbers for quick lookup */
  labelMap?: Record<string, number>;
  
  /**
   * Agent-specific sections: which lines each agent executes
   * For multi-agent algorithms like algo2 with a1, a2, a3
   */
  agentSections?: {
    agentId: string;
    startLine: number;
    endLine: number;
  }[];
}

/**
 * Convert special LaTeX symbols to Unicode or readable text
 */
export function convertLatexSymbols(text: string): string {
  const replacements: [RegExp, string][] = [
    // Math mode subscripts
    [/\$a_(\d+)\$/g, 'a₍$1₎'],
    [/\$(\w)_(\d+)\$/g, '$1₍$2₎'],
    
    // Arrows
    [/\$\\leftarrow\$/g, '←'],
    [/\$\\rightarrow\$/g, '→'],
    [/\$\\gets\$/g, '←'],
    
    // Commands in texttt
    [/\\texttt\{([^}]+)\}/g, '$1'],
    
    // Remove remaining math mode
    [/\$([^$]+)\$/g, '$1'],
    
    // Common symbols
    [/\\{/g, '{'],
    [/\\}/g, '}'],
    [/~/g, ' '],
    [/\\;/g, ''],
  ];
  
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  
  return result.trim();
}
