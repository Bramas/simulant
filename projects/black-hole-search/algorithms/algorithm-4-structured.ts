/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:48.888Z
 */

import type { AlgorithmStructure } from '@bramas/simulant-core/types/algorithm-structure';

export const algo4: AlgorithmStructure = {
  "id": "algo4",
  "caption": "Algorithm 4: Three-Agent EBS Solution with quadratic complexity",
  "input": "3 agents a₁, a₂, a₃",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "n ← +\\infty",
      "type": "assignment"
    },
    {
      "lineNumber": 2,
      "indent": 0,
      "text": "i ← 1",
      "type": "assignment"
    },
    {
      "lineNumber": 3,
      "indent": 0,
      "text": "detection ← false",
      "type": "assignment"
    },
    {
      "lineNumber": 4,
      "indent": 0,
      "text": "if agent is a₁",
      "type": "if",
      "condition": "agent is a₁",
      "blockLines": []
    },
    {
      "lineNumber": 5,
      "indent": 1,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 6,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 7,
      "indent": 2,
      "text": "if collocated with a₂",
      "type": "if",
      "condition": "collocated with a₂",
      "label": "algo4:a1 starts cw",
      "blockLines": []
    },
    {
      "lineNumber": 8,
      "indent": 3,
      "text": "execute CautiousWalk(a₁, a₂, clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 9,
      "indent": 2,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 10,
      "indent": 2,
      "text": "WAIT i-1 rounds",
      "type": "command"
    },
    {
      "lineNumber": 11,
      "indent": 2,
      "text": "if collocated with a₁",
      "type": "if",
      "condition": "collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 12,
      "indent": 3,
      "text": "n ← i + 2",
      "type": "assignment"
    },
    {
      "lineNumber": 13,
      "indent": 2,
      "text": "WAIT i-1 rounds",
      "type": "command"
    },
    {
      "lineNumber": 14,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 15,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 16,
      "indent": 2,
      "text": "if not collocated with a₂",
      "type": "if",
      "condition": "not collocated with a₂",
      "label": "algo4:a1 detects",
      "blockLines": []
    },
    {
      "lineNumber": 17,
      "indent": 3,
      "text": "bh← node in the clockwise direction",
      "type": "assignment"
    },
    {
      "lineNumber": 18,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 19,
      "indent": 2,
      "text": "WAIT 2 rounds",
      "type": "command"
    },
    {
      "lineNumber": 20,
      "indent": 2,
      "text": "i ← min(n-2, i+1)",
      "type": "assignment"
    },
    {
      "lineNumber": 21,
      "indent": 0,
      "text": "else if agent is a₂",
      "type": "elseif",
      "condition": "agent is a₂",
      "blockLines": []
    },
    {
      "lineNumber": 22,
      "indent": 1,
      "text": "WAIT 1 round",
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
      "text": "WAIT 2i rounds",
      "type": "command"
    },
    {
      "lineNumber": 25,
      "indent": 2,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 26,
      "indent": 2,
      "text": "if not collocated with a₁",
      "type": "if",
      "condition": "not collocated with a₁",
      "label": "algo4:a2 detects a1",
      "blockLines": []
    },
    {
      "lineNumber": 27,
      "indent": 3,
      "text": "BH is adjacent in the counter-clockwise direction",
      "type": "command"
    },
    {
      "lineNumber": 28,
      "indent": 3,
      "text": "detection ← true",
      "type": "assignment"
    },
    {
      "lineNumber": 29,
      "indent": 3,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 30,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 31,
      "indent": 2,
      "text": "if a₁.n < +\\infty",
      "type": "if",
      "condition": "a₁.n < +\\infty",
      "blockLines": []
    },
    {
      "lineNumber": 32,
      "indent": 3,
      "text": "n ← a₁.n",
      "type": "assignment"
    },
    {
      "lineNumber": 33,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 34,
      "indent": 2,
      "text": "if not collocated with a₃",
      "type": "if",
      "condition": "not collocated with a₃",
      "label": "algo4:a2 detects a3",
      "blockLines": []
    },
    {
      "lineNumber": 35,
      "indent": 3,
      "text": "MOVE counter-clockwise",
      "type": "command"
    },
    {
      "lineNumber": 36,
      "indent": 3,
      "text": "execute CautiousWalk(a₁, a₂, clockwise)",
      "type": "procedure-call"
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
      "text": "i ← min(n-2, i+1)",
      "type": "assignment"
    },
    {
      "lineNumber": 39,
      "indent": 0,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 40,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 41,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 42,
      "indent": 2,
      "text": "MOVE clockwise (i-1 times)",
      "type": "command"
    },
    {
      "lineNumber": 43,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 44,
      "indent": 2,
      "text": "if collocated with a₁",
      "type": "if",
      "condition": "collocated with a₁",
      "blockLines": []
    },
    {
      "lineNumber": 45,
      "indent": 3,
      "text": "n ← i + 2",
      "type": "assignment"
    },
    {
      "lineNumber": 46,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 47,
      "indent": 2,
      "text": "MOVE counter-clockwise (i times)",
      "type": "command"
    },
    {
      "lineNumber": 48,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 49,
      "indent": 2,
      "text": "if not collocated with a₂",
      "type": "if",
      "condition": "not collocated with a₂",
      "label": "algo4:a3 detects",
      "blockLines": []
    },
    {
      "lineNumber": 50,
      "indent": 3,
      "text": "BH is adjacent in the counter-clockwise direction",
      "type": "command"
    },
    {
      "lineNumber": 51,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 52,
      "indent": 2,
      "text": "if a₂.detection = true",
      "type": "if",
      "condition": "a₂.detection = true",
      "label": "algo4:a3 is warned by a2",
      "blockLines": []
    },
    {
      "lineNumber": 53,
      "indent": 3,
      "text": "BH is two hop in the counter-clockwise direction",
      "type": "command"
    },
    {
      "lineNumber": 54,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 55,
      "indent": 2,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 56,
      "indent": 2,
      "text": "i ← min(n-2, i+1)",
      "type": "assignment"
    }
  ],
  "labelMap": {
    "algo4:a1 starts cw": 7,
    "algo4:a1 detects": 16,
    "algo4:a2 detects a1": 26,
    "algo4:a2 detects a3": 34,
    "algo4:a3 detects": 49,
    "algo4:a3 is warned by a2": 52
  },
  "agentSections": [
    {
      "agentId": "a₁",
      "startLine": 4,
      "endLine": 20
    },
    {
      "agentId": "a₂",
      "startLine": 21,
      "endLine": 38
    },
    {
      "agentId": "a₃",
      "startLine": 39,
      "endLine": 56
    }
  ]
};
