/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:46.070Z
 */

import type { AlgorithmStructure } from '@bramas/simulant-core/types/algorithm-structure';

export const algo0: AlgorithmStructure = {
  "id": "algo0",
  "caption": "Algorithm 0: Small Rings",
  "input": "3 or 4 agents a₁, a₂, a₃, a₄",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "if agent is a₄",
      "type": "if",
      "condition": "agent is a₄",
      "blockLines": []
    },
    {
      "lineNumber": 2,
      "indent": 1,
      "text": "WAIT until termination",
      "type": "command"
    },
    {
      "lineNumber": 3,
      "indent": 0,
      "text": "else if agent is a₁",
      "type": "elseif",
      "condition": "agent is a₁",
      "blockLines": []
    },
    {
      "lineNumber": 4,
      "indent": 1,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 5,
      "indent": 1,
      "text": "if collocated with a₂",
      "type": "if",
      "condition": "collocated with a₂",
      "blockLines": []
    },
    {
      "lineNumber": 6,
      "indent": 2,
      "text": "n ← 2",
      "type": "assignment"
    },
    {
      "lineNumber": 7,
      "indent": 2,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 8,
      "indent": 3,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 9,
      "indent": 1,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 10,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 11,
      "indent": 2,
      "text": "execute Algorithm 4 as agent a₁",
      "type": "procedure-call"
    },
    {
      "lineNumber": 12,
      "indent": 0,
      "text": "else if agent is a₂",
      "type": "elseif",
      "condition": "agent is a₂",
      "blockLines": []
    },
    {
      "lineNumber": 13,
      "indent": 1,
      "text": "WAIT 2 rounds",
      "type": "command"
    },
    {
      "lineNumber": 14,
      "indent": 1,
      "text": "if collocated with a₁",
      "type": "if",
      "condition": "collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 15,
      "indent": 2,
      "text": "n ← 2;",
      "type": "command"
    },
    {
      "lineNumber": 16,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 17,
      "indent": 2,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 18,
      "indent": 3,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 19,
      "indent": 3,
      "text": "if not collocated with a₁",
      "type": "if",
      "condition": "not collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 20,
      "indent": 4,
      "text": "bh ← \\text{none}",
      "type": "assignment"
    },
    {
      "lineNumber": 21,
      "indent": 4,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 22,
      "indent": 3,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 23,
      "indent": 1,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 24,
      "indent": 2,
      "text": "execute Algorithm 4 as agent a₂",
      "type": "procedure-call"
    },
    {
      "lineNumber": 25,
      "indent": 0,
      "text": "else if agent is a₃",
      "type": "elseif",
      "condition": "agent is a₃",
      "blockLines": []
    },
    {
      "lineNumber": 26,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 27,
      "indent": 1,
      "text": "if collocated with a₁",
      "type": "if",
      "condition": "collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 28,
      "indent": 2,
      "text": "n ← 2",
      "type": "assignment"
    },
    {
      "lineNumber": 29,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 30,
      "indent": 2,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 31,
      "indent": 3,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 32,
      "indent": 3,
      "text": "if not collocated with a₁",
      "type": "if",
      "condition": "not collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 33,
      "indent": 4,
      "text": "bh ← \\text{none}",
      "type": "assignment"
    },
    {
      "lineNumber": 34,
      "indent": 4,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 35,
      "indent": 3,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 36,
      "indent": 1,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 37,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 38,
      "indent": 2,
      "text": "execute Algorithm 4 as agent a₃",
      "type": "procedure-call"
    }
  ],
  "labelMap": {},
  "agentSections": [
    {
      "agentId": "a₄",
      "startLine": 1,
      "endLine": 2
    },
    {
      "agentId": "a₁",
      "startLine": 3,
      "endLine": 8
    },
    {
      "agentId": "a₃",
      "startLine": 9,
      "endLine": 11
    },
    {
      "agentId": "a₂",
      "startLine": 12,
      "endLine": 22
    },
    {
      "agentId": "a₃",
      "startLine": 23,
      "endLine": 24
    },
    {
      "agentId": "a₃",
      "startLine": 25,
      "endLine": 35
    },
    {
      "agentId": "a₃",
      "startLine": 36,
      "endLine": 38
    }
  ]
};
