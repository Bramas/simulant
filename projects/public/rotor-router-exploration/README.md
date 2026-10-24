# Rotor-router graph exploration

P21 · Artur Menc, Dominik Pajak and Przemyslaw Uznanski,
[Time and space optimality of rotor-router graph exploration](https://doi.org/10.1016/j.ipl.2017.06.010),
Information Processing Letters 127 (2017), 17–20.
Translation pinned to [arXiv:1502.05545v3](https://arxiv.org/abs/1502.05545v3), §§1–1.1.

The paper studies a memoryless agent with local port labels, writable node memory and
unknown entry port. Its rotor-router mechanism exits through the current pointer and
advances that pointer cyclically. The artifact implements this mechanism on arbitrary
finite, simple, connected undirected port graphs with at least two vertices. The lower-bound proofs remain open.

## Model and source mapping

| Source concept | Executable definition |
| --- | --- |
| Fixed local port ordering | `PortGraph graph`, radius-one observation, `Frames.identity` |
| Node pointer | `NodeRotors`: position-keyed table and pointer vector |
| Local read/write | `rotorHere`; `advanceRotor` at Compute, before Move |
| Memoryless token | `RotorRouter`, unit public state and private memory |
| Graph exploration | Library `Monitors.Visited` and `Exploration` |

`graph` is an ordered adjacency list; vertex numbers only encode the environment. Neither
these numbers, the graph parameter, other pointers, visited nodes nor an entry port are
exposed by a sensor. The algorithm uses only `neighbors here` and `rotorHere`. The position
table and pointer vector are parallel arrays; symmetry transforms the position keys.
Only one agent writes, so concurrent-write arbitration is outside this component's contract.

Each activation is an atomic local read, write and edge traversal. Coverage is an external
monitor: the agent continues walking after all nodes have been visited. This is neither
termination detection nor an implementation of a recurrence goal. Arbitrary valid initial
pointers and local port orderings can be supplied; the check samples do not enumerate all
graphs or all port orderings. The connectedness predicate uses cuts, which is exponential;
it is an auditable domain check for small inputs, not a scalable graph validator.

## Validation

The registered finite set exhausts 340 combinations of starting node and pointer vector
on a path, star, branching tree, ring and diamond graph. Reduced and independent unreduced
checks pass. Tests also change local port orderings, check the departure-node write and
the absence of dependence on remote storage, and reproduce the `(n−1)²` first-hit time
on an explicitly initialized path for n = 2–10.

The generated Lean model compiles. No general coverage, equivariance, time-optimality or
space lower-bound theorem is proved. `NodeRotors` remains project-local; the stdlib is unchanged.

```bash
pnpm cli check-all -p rotor-router-exploration-graph
node --import tsx --import ./packages/vite-plugin/src/register.ts --test tests/rotor-router-exploration.test.ts
pnpm --filter @bramas/simulant-project-rotor-router-exploration build
pnpm cli lean -p rotor-router-exploration-graph -o /private/tmp/rotor-router-lean --build
```
