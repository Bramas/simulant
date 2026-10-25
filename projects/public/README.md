# Public literature projects

New paper artifacts live in one folder per paper family. Existing public projects at
`projects/black-hole-search` and `projects/standup-gathering` retain their paths.

| Project | Current translated case |
| --- | --- |
| [Myopic ASYNC gathering](myopic-async-gathering/README.md) | P07, Algorithm 1 at radius one; three colors, delayed L/C/M and towers |
| [Myopic luminous exploration](myopic-luminous-exploration/README.md) | P03, Algorithm 2; three FSYNC robots and terminating exploration |
| [Synthesized ring gathering](synthesized-ring-gathering/README.md) | P04, extracted three-robot FSYNC protocol and a literal-source counterexample probe |
| [Rotor-router graph exploration](rotor-router-exploration/README.md) | P21, memoryless agent with node pointers on arbitrary finite connected graphs |
| [Black-hole search in trees](tree-black-hole-search/README.md) | P22, two agents running Algorithm Tree with split/probe, timed detection and return home |
| [Planar stand-up indulgent gathering](standup-plane-gathering/README.md) | P23, numerical visualization companion for Algorithm 3; not a formal `.sim` translation |

Formal translations have `sim/`, a `src/projects.ts` registry, a `web/` viewer and an audit in their README.
Numerical companions use the viewer with project-local execution code and are labeled separately.
The [program roadmap](../../docs/public-projects-roadmap.md) tracks remaining algorithms and claims.
The site catalog is explicit; adding a directory alone does not publish a project.

The former public P06 ring-SUIG pilot was removed at the author's request because it is
superseded by a private project covering a wider setting. Six new public projects remain:
five partial `.sim` translations and one numerical companion (eight paper projects including
the two originals, excluding the starter).
