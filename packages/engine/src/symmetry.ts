/**
 * Symmetry reduction (plan, Section 3.11). The group is derived from the
 * model: rotations when every piece declares rotation equivariance, and
 * reflections when, in addition, the frame model is closed under mirroring.
 * Agent permutations need no declaration: anonymous agents are stored sorted.
 */
import type { Experiment, Type } from '@bramas/simulant-lang/ir';
import type { Config, System } from './system';
import type { Automorphism } from './topology';
import { mapper, type Action, type V } from './values';

/** Why the derived group is what it is, for diagnostics. */
export type GroupInfo = { rotations: boolean; reflections: boolean; reasons: string[] };

export function derivedGroup(exp: Experiment): GroupInfo {
  const { model, task } = exp;
  const reasons: string[] = [];
  if (model.symmetries === 'none') return { rotations: false, reflections: false, reasons: ['symmetries := none'] };
  const pieces = [
    ...model.components.map(c => ({ what: `component ${c.name}`, eq: c.equivariance })),
    ...model.sensors.map(s => ({ what: `sensor ${s.name}`, eq: s.equivariance })),
    ...model.components.flatMap(c => (c.sensors ?? []).map(s => ({ what: `sensor ${s.name}`, eq: s.equivariance }))),
    { what: `task ${task.name}`, eq: task.equivariance },
  ];
  let rotations = true;
  let reflections = true;
  for (const p of pieces) {
    if (!p.eq?.rotations) { rotations = false; reasons.push(`${p.what} is not declared rotation-equivariant`); }
    if (!p.eq?.reflections) { reflections = false; reasons.push(`${p.what} is not declared reflection-equivariant`); }
  }
  if (model.frame.kind === 'common') {
    reflections = false;
    reasons.push('common chirality: a mirrored configuration behaves differently');
  }
  return { rotations, reflections: rotations && reflections, reasons };
}

export class Symmetry {
  readonly group: Automorphism[];
  readonly info: GroupInfo;
  private readonly transform: (C: Config, g: Action) => Config;

  constructor(readonly system: System, opts: { enabled?: boolean } = {}) {
    const info = this.info = opts.enabled === false
      ? { rotations: false, reflections: false, reasons: ['disabled'] }
      : derivedGroup(system.exp);
    const all = system.topo.automorphisms();
    this.group = all.filter(g => g.reflects ? info.reflections : info.rotations);
    if (!this.group.length) this.group = [all[0]]; // the identity (rotation 0)
    this.transform = configMapper(system);
  }

  get trivial() {
    return this.group.length === 1;
  }

  apply(C: Config, g: Action): Config {
    return this.system.canonical(this.transform(C, g));
  }

  /** The representative of the orbit of `C` with the smallest key, and `g` with representative = g·C. */
  canonical(C: Config, key = this.system.key(C)): { config: Config; key: string; g: Automorphism } {
    let best = { config: C, key, g: this.group[0] };
    for (let j = 1; j < this.group.length; j++) {
      const g = this.group[j];
      const D = this.apply(C, g);
      const k = this.system.key(D);
      if (k < best.key) best = { config: D, key: k, g };
    }
    return best;
  }
}

/**
 * The bounded test of an equivariance claim (plan 3.11): for each
 * configuration C and group element g, the successors of g·C must be g
 * applied to the successors of C, and the verdict must not change.
 * Returns a description of each violation.
 */
export function equivarianceViolations(system: System, configs: Config[], group: Automorphism[]): string[] {
  const transform = configMapper(system);
  const act = (C: Config, g: Action) => system.canonical(transform(C, g));
  const keys = (cs: Config[]) => [...new Set(cs.map(C => system.key(C)))].sort();
  const out: string[] = [];
  for (const C of configs) {
    const succ = system.successors(C).map(t => t.config);
    for (const g of group) {
      const D = act(C, g);
      if (system.verdict(D) !== system.verdict(C)) out.push(`${g.label}: verdict of ${system.key(C)} changes`);
      const expected = keys(succ.map(t => act(t, g)));
      const actual = keys(system.successors(D).map(t => t.config));
      if (expected.join('\n') !== actual.join('\n')) out.push(`${g.label}: successors of ${system.key(C)} are not mapped to successors`);
    }
  }
  return out;
}

/** How an automorphism acts on whole configurations, derived from the composed types. */
function configMapper(system: System): (C: Config, g: Action) => Config {
  const { lay } = system;
  const field = (t: Type) => mapper(t);
  const agentFields = lay.agentFields.map(f => [f.name, field(f.type)] as const).filter(([, m]) => m);
  const pub = field(lay.pub);
  const mem = field(lay.mem);
  const world = field(lay.worldType);
  return (C, g) => ({
    agents: C.agents.map(a => {
      let f = a.f;
      if (agentFields.length) {
        f = { ...f };
        for (const [n, m] of agentFields) f[n] = m!(a.f[n], g);
      }
      return { pos: g.node(a.pos), pub: pub ? pub(a.pub, g) : a.pub, mem: mem ? mem(a.mem, g) : a.mem, f };
    }),
    world: world ? world(C.world, g) : C.world,
  });
}

export type { V };
