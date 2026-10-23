/**
 * Symmetry reduction (docs/ir.md, docs/core-redesign.md section 7). The group is derived from
 * the model: the automorphisms of the space that preserve what the frames keep, provided every
 * component and the task claim equivariance. Sensors read only their Look and need no claim.
 * Agent permutations need no declaration: anonymous agents are stored sorted.
 */
import type { Experiment, Type } from '@bramas/simulant-lang/ir';
import type { Automorphism, Group } from './space';
import { decisionType, type Config, type System } from './system';
import { mapper, type V } from './values';

/** Why the derived group is what it is, for diagnostics. */
export type GroupInfo = { enabled: boolean; reasons: string[] };

export function derivedGroup(exp: Experiment): GroupInfo {
  const { model, task } = exp;
  if (model.symmetries === 'none') return { enabled: false, reasons: ['symmetries := none'] };
  const reasons = [
    ...model.components.filter(c => !c.equivariant).map(c => `component ${c.name} is not declared equivariant`),
    ...(task.equivariant ? [] : [`task ${task.name} is not declared equivariant`]),
  ];
  return { enabled: reasons.length === 0, reasons };
}

const IDENTITY: Automorphism = { label: 'identity', vertex: v => v };

/** The elements of the space's group that the frames keep. */
function kept(exp: Experiment, group: Group): Group {
  const frames = exp.model.frames;
  if (group.kind === 'line') return { kind: 'line', reflection: frames.kind !== 'identity' };
  const keep = (g: Automorphism) => frames.kind === 'isomorphisms' ? true
    : frames.kind === 'identity' ? !!g.ports && g.ports.every((p, i) => p === i)
    : !!g.ports;
  return { kind: 'finite', elements: group.elements.filter(keep) };
}

export class Symmetry {
  readonly info: GroupInfo;
  readonly group: Group;
  private readonly transform: (C: Config, g: Automorphism) => Config;
  private readonly positions: (C: Config) => V[];

  constructor(readonly system: System, opts: { enabled?: boolean } = {}) {
    const info = this.info = opts.enabled === false ? { enabled: false, reasons: ['disabled'] } : derivedGroup(system.exp);
    this.group = info.enabled ? kept(system.exp, system.space.group()) : { kind: 'finite', elements: [IDENTITY] };
    if (this.group.kind === 'finite' && !this.group.elements.length) this.group = { kind: 'finite', elements: [IDENTITY] };
    this.transform = configMapper(system);
    this.positions = positionsIn(system);
  }

  /** The number of elements tried per configuration (on the line: a translation, and its mirror image). */
  get size(): number {
    return this.group.kind === 'finite' ? this.group.elements.length : this.group.reflection ? 2 : 1;
  }

  get trivial() {
    return this.group.kind === 'finite' && this.group.elements.length === 1;
  }

  apply(C: Config, g: Automorphism): Config {
    return this.system.canonical(this.transform(C, g));
  }

  /** The elements that may bring `C` to its representative. */
  private candidates(C: Config): Automorphism[] {
    if (this.group.kind === 'finite') return this.group.elements;
    const ps = this.positions(C) as number[];
    const [min, max] = [Math.min(...ps), Math.max(...ps)];
    const shift: Automorphism = { label: `translation ${-min}`, vertex: v => v - min, ports: [0, 1] };
    return this.group.reflection ? [shift, { label: `reflection ${max}`, vertex: v => max - v, ports: [1, 0] }] : [shift];
  }

  /** The representative of the orbit of `C` with the smallest key, and `g` with representative = g·C. */
  canonical(C: Config, key = this.system.key(C)): { config: Config; key: string; g: Automorphism } {
    // On the line, the representative is always translated: positions start at 0.
    let best = { config: C, key, g: IDENTITY };
    if (this.group.kind === 'line') {
      const [shift] = this.candidates(C);
      const D = this.apply(C, shift);
      best = { config: D, key: this.system.key(D), g: shift };
    }
    for (const g of this.candidates(C)) {
      if (g === IDENTITY || g === best.g) continue;
      const D = this.apply(C, g);
      const k = this.system.key(D);
      if (k < best.key) best = { config: D, key: k, g };
    }
    return best;
  }
}

/**
 * The bounded test of an equivariance claim: for each configuration C and group element g, the
 * successors of g·C must be g applied to the successors of C, and the verdict must not change.
 * Returns a description of each violation.
 */
export function equivarianceViolations(system: System, configs: Config[], group: Automorphism[]): string[] {
  const transform = configMapper(system);
  const act = (C: Config, g: Automorphism) => system.canonical(transform(C, g));
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

/** The parts of an agent's state and of the world that hold positions. */
function stateMappers(system: System) {
  const { lay } = system;
  const field = (t: Type) => mapper(t);
  return {
    agentFields: lay.agentFields.map(f => [f.name, field(f.type)] as const).filter(([, m]) => m),
    pub: field(lay.pub),
    mem: field(lay.mem),
    world: field(lay.worldType),
    decision: field(decisionType(lay))!,
  };
}

/** How an automorphism acts on whole configurations: positions are mapped, kept port permutations composed. */
function configMapper(system: System): (C: Config, g: Automorphism) => Config {
  const m = stateMappers(system);
  return (C, g) => ({
    agents: C.agents.map(a => {
      let f = a.f;
      if (m.agentFields.length) {
        f = { ...f };
        for (const [n, mm] of m.agentFields) f[n] = mm!(a.f[n], g);
      }
      const frame = a.frame && g.ports ? a.frame.map(p => g.ports![p]) : a.frame;
      const cycle = a.phase ? { phase: a.phase, pending: m.decision(a.pending!, g) as typeof a.pending } : {};
      return { pos: g.vertex(a.pos), ...(frame ? { frame } : {}), pub: m.pub ? m.pub(a.pub, g) : a.pub, mem: m.mem ? m.mem(a.mem, g) : a.mem, f, ...cycle };
    }),
    world: m.world ? m.world(C.world, g) : C.world,
  });
}

/** Every position held by a configuration (agents, their fields and states, the world). */
function positionsIn(system: System): (C: Config) => V[] {
  const transform = configMapper(system);
  return C => {
    const seen: V[] = [];
    transform(C, { label: 'collect', vertex: v => { seen.push(v); return v; } });
    return seen;
  };
}

export type { V };
