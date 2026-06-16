/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:51.099Z
 */

import type { AlgorithmStructure } from '@mobile-entities/core/types/algorithm-structure';

export const proc1: AlgorithmStructure = {
  "id": "proc1",
  "caption": "CautiousWalk(leader, follower, direction)",
  "input": "",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "if agent is leader",
      "type": "if",
      "condition": "agent is leader",
      "blockLines": []
    },
    {
      "lineNumber": 2,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 3,
      "indent": 2,
      "text": "MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 4,
      "indent": 2,
      "text": "MOVE towards the opposite of direction",
      "type": "command"
    },
    {
      "lineNumber": 5,
      "indent": 2,
      "text": "MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 6,
      "indent": 0,
      "text": "if agent is follower",
      "type": "if",
      "condition": "agent is follower",
      "blockLines": []
    },
    {
      "lineNumber": 7,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 8,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 9,
      "indent": 2,
      "text": "WAIT 1 round",
      "type": "command"
    },
    {
      "lineNumber": 10,
      "indent": 2,
      "text": "if not collocated with leader",
      "type": "if",
      "condition": "not collocated with leader",
      "blockLines": []
    },
    {
      "lineNumber": 11,
      "indent": 3,
      "text": "bh← node at direction",
      "type": "assignment"
    },
    {
      "lineNumber": 12,
      "indent": 3,
      "text": "TERMINATE",
      "type": "return"
    },
    {
      "lineNumber": 13,
      "indent": 2,
      "text": "MOVE towards direction",
      "type": "command"
    }
  ],
  "labelMap": {},
  "agentSections": [
    {
      "agentId": "follower",
      "startLine": 6,
      "endLine": 13
    }
  ]
};
