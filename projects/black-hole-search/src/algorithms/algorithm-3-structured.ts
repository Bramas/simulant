/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:48.145Z
 */

import type { AlgorithmStructure } from '@bramas/simulant-core/types/algorithm-structure';

export const algo3: AlgorithmStructure = {
  "id": "algo3",
  "caption": "Algorithm 3: Three-Agent EBS Solution with the knowledge of n",
  "input": "3 agents a₁, a₂, a₃",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "/*** Assign initial role to the agents ***/",
      "type": "command"
    },
    {
      "lineNumber": 2,
      "indent": 0,
      "text": "if agent is a₁",
      "type": "if",
      "condition": "agent is a₁",
      "blockLines": []
    },
    {
      "lineNumber": 3,
      "indent": 1,
      "text": "role ← traveler",
      "type": "assignment"
    },
    {
      "lineNumber": 4,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 5,
      "indent": 0,
      "text": "else if agent is a₂",
      "type": "elseif",
      "condition": "agent is a₂",
      "blockLines": []
    },
    {
      "lineNumber": 6,
      "indent": 1,
      "text": "role ← next-traveler",
      "type": "assignment"
    },
    {
      "lineNumber": 7,
      "indent": 1,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 8,
      "indent": 0,
      "text": "else if agent is a₃",
      "type": "elseif",
      "condition": "agent is a₃",
      "blockLines": []
    },
    {
      "lineNumber": 9,
      "indent": 1,
      "text": "role ← waiter",
      "type": "assignment"
    },
    {
      "lineNumber": 10,
      "indent": 1,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 11,
      "indent": 0,
      "text": "/*** Main loop: after each iteration the roles are exchanged, and the configuration is rotated one node counter-clockwise ***/",
      "type": "command"
    },
    {
      "lineNumber": 12,
      "indent": 0,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 13,
      "indent": 1,
      "text": "if role = traveler",
      "type": "if",
      "condition": "role = traveler",
      "blockLines": []
    },
    {
      "lineNumber": 14,
      "indent": 2,
      "text": "if collocated with waiter",
      "type": "if",
      "condition": "collocated with waiter",
      "label": "algo3:traveler starts cw",
      "blockLines": []
    },
    {
      "lineNumber": 15,
      "indent": 3,
      "text": "execute CautiousWalk(waiter, traveler, clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 16,
      "indent": 2,
      "text": "MOVE clockwise (n-2 times)",
      "type": "command"
    },
    {
      "lineNumber": 17,
      "indent": 2,
      "text": "if not collocated with waiter",
      "type": "if",
      "condition": "not collocated with waiter",
      "label": "algo3:traveler detects",
      "blockLines": []
    },
    {
      "lineNumber": 18,
      "indent": 3,
      "text": "bh← node in the clockwise direction",
      "type": "assignment"
    },
    {
      "lineNumber": 19,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 20,
      "indent": 2,
      "text": "role ← waiter",
      "type": "assignment"
    },
    {
      "lineNumber": 21,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 22,
      "indent": 1,
      "text": "else if role = next-traveler",
      "type": "elseif",
      "condition": "role = next-traveler",
      "blockLines": []
    },
    {
      "lineNumber": 23,
      "indent": 2,
      "text": "WAIT n-2 rounds",
      "type": "command"
    },
    {
      "lineNumber": 24,
      "indent": 2,
      "text": "role ← traveler",
      "type": "assignment"
    },
    {
      "lineNumber": 25,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 26,
      "indent": 1,
      "text": "else if role = waiter",
      "type": "elseif",
      "condition": "role = waiter",
      "blockLines": []
    },
    {
      "lineNumber": 27,
      "indent": 2,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 28,
      "indent": 2,
      "text": "WAIT n-3 rounds",
      "type": "command"
    },
    {
      "lineNumber": 29,
      "indent": 2,
      "text": "if not collocated with traveler",
      "type": "if",
      "condition": "not collocated with traveler",
      "label": "algo3:waiter detects",
      "blockLines": []
    },
    {
      "lineNumber": 30,
      "indent": 3,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 31,
      "indent": 3,
      "text": "execute CautiousWalk(waiter, traveler, clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 32,
      "indent": 2,
      "text": "role ← next-traveler",
      "type": "assignment"
    },
    {
      "lineNumber": 33,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    }
  ],
  "labelMap": {
    "algo3:traveler starts cw": 14,
    "algo3:traveler detects": 17,
    "algo3:waiter detects": 29
  },
  "agentSections": [
    {
      "agentId": "a₁",
      "startLine": 2,
      "endLine": 4
    },
    {
      "agentId": "a₂",
      "startLine": 5,
      "endLine": 7
    },
    {
      "agentId": "a₃",
      "startLine": 8,
      "endLine": 21
    }
  ]
};
