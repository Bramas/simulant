# Schedulers in `.sim`

Design document · 23 October 2026 · not implemented

Today the round is a three-way switch of the semantic core: `.fsync`, `.ssync` or `.sequential` (`Model.round` in the IR, `activate` in `packages/engine/src/system.ts`, `RoundKind` in `lean/Simulant/Round.lean`), and the explorer assumes scheduler fairness whenever the round is not FSYNC. Every agent performs a whole Look-Compute-Move cycle in the round that activates it. Schedulers from the literature cannot be written: a sequential scheduler that follows a permutation of the agents, a k-bounded scheduler, or any asynchronous one (ASYNC and its LC-atomic and CM-atomic variants).

This design moves schedulers into the standard library, written in `.sim` like components. The core keeps one mechanism: each agent is at some point of its cycle, and at each step the scheduler chooses which agents take their next event. A scheduler says three things:

- how the cycle is cut into atomic events (its `events`), the same for every agent;
- which agents take their next event at each step (its `schedule`), with its own state;
- which executions are admissible (its `fairness`).

The design does not keep the old syntax: `Round`, its constructors and the `round` argument of model families are removed, and projects are ported to the library schedulers. Out of scope: `Graphs.Dynamic` stays built in, and moves on graphs stay atomic (no change to spaces). Section 8 sketches how continuous spaces would add a moving phase.

## 1. Cycles, events and phases

An agent's cycle has three instants:

- **Look.** The agent takes its snapshot: its Look, its sensors with their choices, and its frame. Its decision is computed at once from the snapshot, since Compute depends on nothing else. The decision is the new public state and memory, the actions, and the target, kept as a position (a location is valid for one Look). The decision stays **pending**: nobody sees it yet.
- **Compute.** The decision's public state, memory and actions take effect, atomically: a light changes at this instant, a pebble is dropped or picked. Memory is applied here with the public state, so a decision takes effect in one place.
- **Move.** The agent moves to its target, atomically. A missing edge makes it stay, as today.

A scheduler's `events` cut the cycle into events, each of which happens atomically:

| `events` | Events of a cycle | Usual name |
| --- | --- | --- |
| `[[.look, .compute, .move]]` | one | atomic cycles (FSYNC, SSYNC, sequential) |
| `[[.look, .compute], [.move]]` | look and compute, then move | LC-atomic ASYNC |
| `[[.look], [.compute, .move]]` | look, then compute and move | CM-atomic ASYNC |
| `[[.look], [.compute], [.move]]` | three | ASYNC |

An agent's **phase** is the number of events of its current cycle it has taken: `0` between cycles, then `1`, `2`. It is part of the configuration, with the pending decision while the phase is not 0. A scheduled agent takes the next event of its cycle; after the last one, its phase is 0 again.

**A step.** The scheduler chooses the agents that take an event. Then, in this order:

1. the adversary chooses the edges missing this step (`Graphs.Dynamic`), and `beforeLook` hooks run;
2. every agent whose event includes Look takes its snapshot, all of them **from the configuration at the start of the step**, and computes its decision;
3. `onCompute` hooks read the decisions that take effect now (`decisionOf a`), then those decisions' public states and memories are applied;
4. `beforeMove` hooks read the moves that happen now (`decisionOf a`), then agents whose event includes Move move;
5. `afterMove` hooks run.

Rule 2 is what makes Compute and Move atomic: a Look at the same instant as another agent's Compute or Move sees the light, public state and position from before them. When every scheduled agent's event is a whole cycle, a step is exactly today's round, with today's `beforeMove` split into `onCompute` followed by `beforeMove`.

What others see of an agent with a pending decision is its last applied state: its old public state and light until its Compute, its old position until its Move.

**Adversarial agents** (`acts adversary`, kept for faults such as Byzantine robots): the adversary chooses their target at their Look, under every cut of the cycle, and the target then behaves like any pending decision.

## 2. Writing a scheduler

A scheduler is a `def` of type `Scheduler`. Like a component, it may own world and agent fields with initial values. Its `schedule` hook reads the configuration and returns an effect. The effect's `activate` part lists the agents that take their next event. Its other parts, as in a component's effect, set the scheduler's own fields.

The activated set is part of the effect, rather than a separate field, so that one `choose` decides both the set and the state update that depends on it (`Schedulers.Bounded` below resets the counters of exactly the agents it activates). A set and an update written as two expressions would each need the same choice and could disagree.

```sim-design
/-- Every agent able to act, every step. -/
def Schedulers.FSync : Scheduler where
  fairness := .none
  schedule C := { activate := C.eligible }

/-- A nonempty set of agents, chosen by the adversary at each step. -/
def Schedulers.SSync : Scheduler where
  schedule C := { activate := choose (nonemptySubsets C.eligible) }

/-- One agent per step. -/
def Schedulers.Sequential : Scheduler where
  schedule C := { activate := choose (C.eligible.map fun a => [a]) }

/-- Asynchronous agents: at each step, a nonempty set takes its next event. -/
def Schedulers.Async (events : List (List Instant) := [[.look], [.compute], [.move]]) : Scheduler where
  events := events
  schedule C := { activate := choose (nonemptySubsets C.eligible) }

/-- Every agent takes an event at least once every k steps. -/
def Schedulers.Bounded (k : Nat) : Scheduler where
  fairness := .none                     -- the bound is in the state: every execution is fair
  Agent := { waited : Nat }
  init i := { waited := 0 }
  schedule C :=
    let due := C.eligible.filter fun a => a.waited + 1 ≥ k
    let S := choose ((nonemptySubsets C.eligible).filter fun S => due.all S.contains)
    { activate := S, agents := fun a => { waited := if S.contains a then 0 else a.waited + 1 } }

/-- One agent at a time, in passes: every agent able to act takes one event per pass, in an
order the adversary chooses anew for each pass. -/
def Schedulers.Permutation : Scheduler where
  Agent := { done : Bool }
  init i := { done := false }
  fairness := .none
  schedule C :=
    let left := C.eligible.filter fun a => !a.done
    let a := choose (if left.isEmpty then C.eligible else left)
    { activate := fun b => b = a, agents := fun b => { done := b = a ∨ (!left.isEmpty ∧ b.done) } }
```

Defaults: `events := [[.look, .compute, .move]]` and `fairness := .activation`. `C.eligible` lists the agents whose flags allow acting (not `acts never`). Agents are references valid within one step, as in components, so a scheduler keeps per-agent state in agent fields (`waited`, `done`), not in lists of agents. A scheduler may read `a.phase`, for instance to bound how long a pending move may wait.

Model families take a `scheduler` argument (default `Schedulers.FSync`): `robots … (scheduler := Schedulers.Async)`. Agents all cut their cycle the same way: per-agent cuts are not planned.

## 3. Components

Hooks run at fixed points of a step (section 1). The new point is `onCompute`: effects that belong to Compute move there.

- `Storage.Lights` and `Storage.Pebbles` move from `beforeMove` to `onCompute`: a light changes, and a pebble is dropped or picked, at the agent's Compute.
- `Faults.CrashAt` stays in `beforeMove`: a robot may crash instead of moving, after its Compute (its light already changed, as its documentation says today).
- `Hazards.BlackHole`, `Faults.CrashStop` and `Monitors.Visited` are unchanged.

Under atomic cycles this changes no result. A component reads only its own fields, flags and the decisions, so running the `onCompute` hooks before the `beforeMove` hooks of the same step gives the same effects as running them together on one snapshot. The conformance fixtures and baselines check this (section 7).

`decisionOf a` is the decision taking effect at this hook point: at `onCompute`, those of agents whose event includes Compute; at `beforeMove`, those of agents whose event includes Move. Other agents have `decided = false`, as today.

## 4. Fairness

Fairness says which infinite executions are admissible. It is a kind, declared by the scheduler, so that new kinds can be added without changing schedulers that do not use them:

| `fairness` | Admissible executions | Status |
| --- | --- | --- |
| `.activation` (default) | every agent that acts forever takes events infinitely often (scheduling fairness); with several events per cycle, every pending decision eventually takes effect | now |
| `.none` | every execution the scheduler allows | now |
| `.weak` | every agent that is enabled from some point on takes an event infinitely often | later |
| `.strong` | every agent enabled infinitely often takes an event infinitely often | later |

`.activation` is today's condition for SSYNC and sequential (`Exec.Fair`, and the explorer's scheduler-fair cycles). FSYNC needs no assumption (`.none`), and neither do schedulers whose bound is part of their state (`Schedulers.Bounded` admits only fair executions anyway).

**Enabled agents (later).** The daemons of self-stabilization select among *enabled* agents: those whose next event would change something (their state, light or position). An unfair central daemon is `schedule C := { activate := choose (C.enabled.map fun a => [a]) }` with `fairness := .none`; a distributed one chooses a nonempty subset of `C.enabled`; weakly and strongly fair daemons use the kinds above. This needs:

- `C.enabled`: the engine evaluates each eligible agent's possible decisions before scheduling (it computes them anyway, after scheduling). An agent with several possible decisions (sensor choices, frames) is enabled if one of them changes something; this definition is to be checked against the literature.
- Silent executions: when no agent is enabled, the execution has reached a terminal configuration. Executions are infinite today (FSYNC idles); a terminal configuration becomes a self-loop on which only `.none` executions stay, and goals are checked on it as on any lasso.

**In the explorer**, a fairness kind is a condition on the strongly connected component in which a lasso cycles: `.activation` requires every acting agent to take an event on some edge of it (today's check); `.weak` every agent enabled in every state of the cycle; `.strong` every agent enabled in some state of it. Edges record the agents that took an event, as they record activated agents today, and states record the enabled agents when a kind needs them. **In Lean**, `Exec.Fair` becomes a predicate per kind, and `Admissible` requires the scheduler's.

## 5. State and symmetry

The configuration gains, per agent, the scheduler's agent fields, its phase and its pending decision, and the scheduler's world fields. With atomic cycles, the phase is always 0 and no decision is pending: the encoding of a configuration leaves them out, so state counts are unchanged. Scheduler state multiplies the state space as expected: counters up to k for each agent, permutations of the agents, pending decisions under ASYNC.

A pending target is a position, transformed by the automorphisms like the other positions of a configuration. A scheduler, like a component, may claim `@[equivariant]`. Symmetry reduction also merges configurations that differ by a permutation of agents. Today this is enabled for FSYNC only (`anonymous` in `System`), because fairness is tracked per agent and merging would mix agents up. It becomes a property of the scheduler: allowed when its fairness tracks no agent (`.none`): the scheduler's agent fields move with the agents they belong to.

## 6. IR, engine, Lean and tools

- **IR (version 3).** `Model.round` is replaced by `Model.scheduler`: fields with initial values, `events`, `fairness`, and the `schedule` expression returning an effect with `activate`. Components gain the `onCompute` hook. `docs/ir.md`, the conformance fixtures, the interpreter and the Lean generator change together, as for version 2.
- **Engine.** `activate` evaluates the scheduler's `schedule`, with the existing machinery for `choose`, witnesses and effects. A step follows section 1. `System.decisionsOf` and the explanations report the pending decision of an agent, and when it takes effect.
- **Lean.** Agents gain their phase and pending decision. `Model.round` becomes the step of section 1, and `activate` the translation of `schedule`, generated like a component hook (activation is already an `ND.choose` in `Round.lean`). A lemma states that a step whose events are all whole cycles is the previous round, so the existing proofs carry over.
- **Simulator.** Rounds become steps in the interface. The model view lists the scheduler's events, its choices and its fairness. A step's explanation shows the pending decision at the Look that computed it, and its effect at the Compute and Move that apply it. The renderers show an agent with a pending decision (for instance its next target). Branch labels name the scheduled agents, as activation labels do today.
- **Site and editor.** The builder offers the library schedulers with their arguments, and the library page documents them. Completions and hovers include `Scheduler`, `events`, `schedule`, `activate`, `fairness`, `onCompute`, `C.eligible` and `a.phase`.

## 7. Steps

| Step | Work | Done when |
| --- | --- | --- |
| 1. Semantics in the engine | Phases, pending decisions and steps (section 1); the `onCompute` hook point; the three current rounds run through the new step. | Every conformance fixture and every Phase 0 baseline is reproduced (verdicts, counterexamples, state counts, stand-up decisions). |
| 2. Language and IR | `Scheduler` declarations, `events`, `schedule`, `activate`, `fairness`, `C.eligible`, `a.phase`; `Round` removed; IR version 3; `docs/ir.md` and `docs/sim-language.md`. | The library schedulers typecheck; typechecker tests cover scheduler fields and the hook points. |
| 3. Library and projects | `packages/stdlib/sim/schedulers.sim`: FSync, SSync, Sequential, Async (with its events), Bounded, Permutation; Lights and Pebbles in `onCompute`; builder counterparts in `packages/stdlib/test/helpers/`; projects ported. | New fixtures: ASYNC, LC-atomic and CM-atomic on a cycle with lights (a Look at the instant of a Compute sees the old light); a bounded and a permutation scheduler; the baselines still pass with the library schedulers. |
| 4. Lean | Step over events, generated `schedule`, fairness per kind, the atomic-cycle lemma; regenerated library and examples. | Lean-backed tests and differential tests pass on the new fixtures; the ported proofs are accepted. |
| 5. Tools and documentation | Simulator (steps, model view, explanations, pending decisions), CLI, site and editor; architecture, development and release notes. | Page builds; the three project pages checked in the browser; the full verification passes. |
| Later: enabled agents | `C.enabled`, `.weak` and `.strong` fairness, terminal configurations (section 4). | Unfair, weakly fair and strongly fair daemons on a self-stabilizing example, with the explorer and Lean agreeing. |

## 8. Continuous spaces (later)

In a continuous space a robot can be seen between its origin and its target. This adds a moving phase to the cycle: at each event of that phase, the adversary advances the robot along its path by at least δ (non-rigid movement) until it reaches the target, and other robots see it at its current point. Graphs keep atomic moves, so this waits for the Euclidean spaces of the [core redesign](core-redesign.md#euclidean-spaces-interfaces-only-in-phase-0).

## 9. Decisions

- Memory takes effect at Compute, with the public state.
- Adversarial agents are kept: their target is chosen at their Look.
- All agents cut their cycle the same way.
- The activated set is part of the effect returned by `schedule` (section 2).
- Fairness is a kind declared by the scheduler, `.activation` by default; `.weak`, `.strong` and enabled agents come later (section 4).
- No compatibility with `Round`: the projects are ported.
