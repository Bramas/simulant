/**
 * Hand-written builder tasks for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/tasks.sim; see ../../README.md.
 */
import { agents, correct, ite, let_, positions, present, resolve, task, verdict } from '@bramas/simulant-lang/builder';

/** Every correct agent claims the port leading to the black hole (output `claim`, here `pub.bh`). */
export const IdentifyBlackHole = task({
  name: 'IdentifyBlackHole',
  goal: 'eventuallyAlways',
  verdict: C => let_('alive', agents(C).filter(a => correct(a)), alive =>
    ite(alive.isEmpty(), verdict('failure'),
      ite(alive.all(a => a.pub.bh.isSome().and(resolve(C, a, a.pub.bh.getD(0)).eq(C.world.site))),
        verdict('success'), verdict('inProgress')))),
  equivariant: true,
});

/** Every present robot is on the same position, eventually. */
export const Gathering = task({
  name: 'Gathering',
  goal: 'eventually',
  verdict: C => let_('robots', agents(C).filter(a => present(a)), robots =>
    ite(robots.all(a => robots.all(b => a.pos.eq(b.pos))), verdict('success'), verdict('inProgress'))),
  equivariant: true,
});

/** Eventually, and forever, at most one present robot per position. */
export const Dispersion = task({
  name: 'Dispersion',
  goal: 'eventuallyAlways',
  verdict: C => let_('robots', agents(C).filter(a => present(a)), robots =>
    ite(robots.all(a => robots.count(b => b.pos.eq(a.pos)).eq(1)), verdict('success'), verdict('inProgress'))),
  equivariant: true,
});

/** Every position has been visited, eventually (finite spaces). Needs `Monitors.Visited`. */
export const Exploration = task({
  name: 'Exploration',
  goal: 'eventually',
  verdict: C => ite(positions().all(p => C.world.visited.has(p)), verdict('success'), verdict('inProgress')),
  equivariant: true,
});
