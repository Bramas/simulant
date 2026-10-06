/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:47.435Z
 */

import type { AlgorithmStructure } from '@bramas/simulant-core/types/algorithm-structure';

export const algo2: AlgorithmStructure = {
  "id": "algo2",
  "caption": "Algorithm 2: Three-Agent EBS Solution with one pebble",
  "input": "3 agents a₁, a₂, a₃, and one pebble",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "if agent is a₁",
      "type": "if",
      "condition": "agent is a₁",
      "blockLines": []
    },
    {
      "lineNumber": 2,
      "indent": 1,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 3,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 4,
      "indent": 2,
      "text": "DROP-PEBBLE and MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 5,
      "indent": 2,
      "text": "if not collocated with a₂",
      "type": "if",
      "condition": "not collocated with a₂",
      "label": "algo2:a1 detects",
      "blockLines": []
    },
    {
      "lineNumber": 6,
      "indent": 3,
      "text": "bh← node in the clockwise direction",
      "type": "assignment"
    },
    {
      "lineNumber": 7,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 8,
      "indent": 2,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 9,
      "indent": 2,
      "text": "GET-PEBBLE and MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 10,
      "indent": 0,
      "text": "else if agent is a₂",
      "type": "elseif",
      "condition": "agent is a₂",
      "blockLines": []
    },
    {
      "lineNumber": 11,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 12,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 13,
      "indent": 2,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 14,
      "indent": 2,
      "text": "if not collocated with a₁",
      "type": "if",
      "condition": "not collocated with a₁",
      "label": "algo2:a2 detects",
      "blockLines": []
    },
    {
      "lineNumber": 15,
      "indent": 3,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 16,
      "indent": 3,
      "text": "detection ← true",
      "type": "assignment"
    },
    {
      "lineNumber": 17,
      "indent": 3,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 18,
      "indent": 3,
      "text": "execute CautiousWalk(a₂, a₃, counter-clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 19,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 20,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 21,
      "indent": 0,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 22,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 23,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 24,
      "indent": 2,
      "text": "if not collocated with a₂",
      "type": "if",
      "condition": "not collocated with a₂",
      "label": "algo2:a3 detects",
      "blockLines": []
    },
    {
      "lineNumber": 25,
      "indent": 3,
      "text": "while there is no pebble",
      "type": "while",
      "condition": "there is no pebble",
      "blockLines": []
    },
    {
      "lineNumber": 26,
      "indent": 4,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 27,
      "indent": 3,
      "text": "bh← node in the clockwise direction",
      "type": "assignment"
    },
    {
      "lineNumber": 28,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 29,
      "indent": 2,
      "text": "else if a₂.detection = true",
      "type": "elseif",
      "condition": "a₂.detection = true",
      "blockLines": []
    },
    {
      "lineNumber": 30,
      "indent": 3,
      "text": "execute CautiousWalk(a₂, a₃, counter-clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 31,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 32,
      "indent": 2,
      "text": "WAIT 2 rounds",
      "type": "command"
    }
  ],
  "labelMap": {
    "algo2:a1 detects": 5,
    "algo2:a2 detects": 14,
    "algo2:a3 detects": 24
  },
  "agentSections": [
    {
      "agentId": "a₁",
      "startLine": 1,
      "endLine": 9
    },
    {
      "agentId": "a₂",
      "startLine": 10,
      "endLine": 20
    },
    {
      "agentId": "a₃",
      "startLine": 21,
      "endLine": 28
    }
  ]
};
