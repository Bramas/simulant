/**
 * Structured representation of algorithm(s)
 * Auto-generated from LaTeX source
 * Generation date: 2026-02-03T17:18:50.410Z
 */

import type { AlgorithmStructure } from '@bramas/simulant-core/types/algorithm-structure';

export const proc2: AlgorithmStructure = {
  "id": "proc2",
  "caption": "CautiousWalkPebble(leader, follower)",
  "input": "",
  "lines": [
    {
      "lineNumber": 1,
      "indent": 0,
      "text": "direction ← 1 (clockwise)",
      "type": "assignment"
    },
    {
      "lineNumber": 2,
      "indent": 0,
      "text": "sync ← 0",
      "type": "assignment"
    },
    {
      "lineNumber": 3,
      "indent": 0,
      "text": "if agent is leader",
      "type": "if",
      "condition": "agent is leader",
      "blockLines": []
    },
    {
      "lineNumber": 4,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 5,
      "indent": 2,
      "text": "PICKUP pebble (if any) and MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 6,
      "indent": 2,
      "text": "if collocated or there is pebble",
      "type": "if",
      "condition": "collocated or there is pebble",
      "blockLines": []
    },
    {
      "lineNumber": 7,
      "indent": 3,
      "text": "direction ← opposite of direction",
      "type": "assignment"
    },
    {
      "lineNumber": 8,
      "indent": 3,
      "text": "MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 9,
      "indent": 3,
      "text": "WAIT follower.direction = direction // when the other sees me",
      "type": "command"
    },
    {
      "lineNumber": 10,
      "indent": 3,
      "text": "continue",
      "type": "command"
    },
    {
      "lineNumber": 11,
      "indent": 2,
      "text": "sync ← 1",
      "type": "assignment"
    },
    {
      "lineNumber": 12,
      "indent": 2,
      "text": "DROP pebble and MOVE towards the opposite of direction",
      "type": "command"
    },
    {
      "lineNumber": 13,
      "indent": 2,
      "text": "WAIT not collocated with follower // when the other saw me and moved",
      "type": "command"
    },
    {
      "lineNumber": 14,
      "indent": 2,
      "text": "sync ← 2",
      "type": "assignment"
    },
    {
      "lineNumber": 15,
      "indent": 2,
      "text": "MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 16,
      "indent": 2,
      "text": "WAIT collocated with follower // when I see the other",
      "type": "command"
    },
    {
      "lineNumber": 17,
      "indent": 2,
      "text": "sync ← 0",
      "type": "assignment"
    },
    {
      "lineNumber": 18,
      "indent": 2,
      "text": "WAIT followe.sync = 0 // when the other sees me",
      "type": "command"
    },
    {
      "lineNumber": 19,
      "indent": 0,
      "text": "if agent is follower",
      "type": "if",
      "condition": "agent is follower",
      "blockLines": []
    },
    {
      "lineNumber": 20,
      "indent": 1,
      "text": "while true",
      "type": "while",
      "condition": "true",
      "blockLines": []
    },
    {
      "lineNumber": 21,
      "indent": 2,
      "text": "WAIT collocated with leader and (leader.direction is opposite or leader.sync = 1)",
      "type": "command"
    },
    {
      "lineNumber": 22,
      "indent": 2,
      "text": "if leader.direction is opposite",
      "type": "if",
      "condition": "leader.direction is opposite",
      "blockLines": []
    },
    {
      "lineNumber": 23,
      "indent": 3,
      "text": "direction ← opposite of direction",
      "type": "assignment"
    },
    {
      "lineNumber": 24,
      "indent": 3,
      "text": "continue",
      "type": "command"
    },
    {
      "lineNumber": 25,
      "indent": 2,
      "text": "sync ← 2",
      "type": "assignment"
    },
    {
      "lineNumber": 26,
      "indent": 2,
      "text": "MOVE towards direction",
      "type": "command"
    },
    {
      "lineNumber": 27,
      "indent": 2,
      "text": "WAIT collocated with leader // when I see the other",
      "type": "command"
    },
    {
      "lineNumber": 28,
      "indent": 2,
      "text": "sync ← 0",
      "type": "assignment"
    },
    {
      "lineNumber": 29,
      "indent": 0,
      "text": "The agents use the WAIT instruction to stay in sync. An agent executing this instruction checks if the condition is true. If so, she then execute the next instruction, otherwise stays idle and remains on the same instruction.",
      "type": "command"
    }
  ],
  "labelMap": {},
  "agentSections": [
    {
      "agentId": "follower",
      "startLine": 19,
      "endLine": 29
    }
  ]
};

export const algo6: AlgorithmStructure = {
  "id": "algo6",
  "caption": "Algorithm 6: EBS Solution with 4 asynchronous agent and 2 pebbles",
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
      "text": "execute CautiousWalkPebble(a₁, a₂)",
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
      "text": "WAIT until a₁ and a₂ have moved",
      "type": "command"
    },
    {
      "lineNumber": 6,
      "indent": 1,
      "text": "execute CautiousWalkPebble(a₃, a₄)",
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
