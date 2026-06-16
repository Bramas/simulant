/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:46.765Z
 */

import type { AlgorithmStructure } from '@mobile-entities/core/types/algorithm-structure';

export const algo1: AlgorithmStructure = {
  "id": "algo1",
  "caption": "Algorithm 1: Four-Agent EBS Solution",
  "input": "4 agents a₁, a₂, a₃, a₄",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "if agent is in {a₁, a₂}",
      "type": "if",
      "condition": "agent is in {a₁, a₂}",
      "blockLines": []
    },
    {
      "lineNumber": 2,
      "indent": 1,
      "text": "MOVE clockwise",
      "type": "command"
    },
    {
      "lineNumber": 3,
      "indent": 1,
      "text": "execute CautiousWalk(a₁, a₂, clockwise)",
      "type": "procedure-call"
    },
    {
      "lineNumber": 4,
      "indent": 0,
      "text": "else",
      "type": "else",
      "blockLines": []
    },
    {
      "lineNumber": 5,
      "indent": 1,
      "text": "MOVE counterclockwise",
      "type": "command"
    },
    {
      "lineNumber": 6,
      "indent": 1,
      "text": "execute CautiousWalk(a₃, a₄, clockwise)",
      "type": "procedure-call"
    }
  ],
  "labelMap": {},
  "agentSections": [
    {
      "agentId": "a₁, a₂",
      "startLine": 1,
      "endLine": 3
    },
    {
      "agentId": "a₃",
      "startLine": 4,
      "endLine": 6
    }
  ]
};
