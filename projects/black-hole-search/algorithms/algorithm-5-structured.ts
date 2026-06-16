/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:49.620Z
 */

import type { AlgorithmStructure } from '@mobile-entities/core/types/algorithm-structure';

export const algo5: AlgorithmStructure = {
  "id": "algo5",
  "caption": "Algorithm 5: n-agent EBS Solution (knowledge of n or face-to-face communication)",
  "input": "n agents a₁, a₂, \\ldots a_n \\nonlid: id of the agent executing the algorithm, in [0,n-1]",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "",
      "type": "command"
    },
    {
      "lineNumber": 2,
      "indent": 0,
      "text": "direction ← 1 (meaning clockwise)",
      "type": "assignment"
    },
    {
      "lineNumber": 3,
      "indent": 0,
      "text": "current_node ← 0",
      "type": "assignment"
    },
    {
      "lineNumber": 4,
      "indent": 0,
      "text": "bh ← id // global id of the suspected node",
      "type": "command"
    },
    {
      "lineNumber": 5,
      "indent": 0,
      "text": "if id = 0",
      "type": "if",
      "condition": "id = 0",
      "blockLines": []
    },
    {
      "lineNumber": 6,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 7,
      "indent": 1,
      "text": "current_node ← 1",
      "type": "assignment"
    },
    {
      "lineNumber": 8,
      "indent": 0,
      "text": "loop",
      "type": "loop",
      "blockLines": []
    },
    {
      "lineNumber": 9,
      "indent": 1,
      "text": "next_node ← current_node + direction % n",
      "type": "assignment"
    },
    {
      "lineNumber": 10,
      "indent": 1,
      "text": "if next_node = id",
      "type": "if",
      "condition": "next_node = id",
      "blockLines": []
    },
    {
      "lineNumber": 11,
      "indent": 2,
      "text": "direction ← direction × (-1)",
      "type": "assignment"
    },
    {
      "lineNumber": 12,
      "indent": 1,
      "text": "current_node ← current_node + direction % n",
      "type": "assignment"
    },
    {
      "lineNumber": 13,
      "indent": 1,
      "text": "MOVE direction",
      "type": "command"
    }
  ],
  "labelMap": {}
};
