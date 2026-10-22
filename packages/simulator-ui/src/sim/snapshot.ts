/**
 * Snapshots (plan, Section 6.5): typed JavaScript views of configurations,
 * for drawing and inspection. A renderer may read hidden fields: it shows
 * the world, not what an agent knows. Snapshots are read-only.
 *
 * For the existing UI, a snapshot also answers `get(node)` like the current
 * engine's configurations, with agents identified by `_id`.
 */
import type { System, Config } from '@bramas/simulant-engine/system';

export type SnapshotAgent = {
  /** Index in the configuration. */
  index: number;
  /** `pub.id` when the public state has one (agents with identifiers), the index otherwise. */
  id: number;
  /** The agent's position: its vertex (a number on cycles, lines and stars). */
  pos: any;
  /** Raised flags, by name. */
  flags: Record<string, boolean>;
  /** Component agent fields. */
  fields: Record<string, unknown>;
  pub: any;
  mem: any;
  /** The line of the algorithm the agent is at, when the algorithm has a line table. */
  line?: number;
  /** No flag raised. */
  correct: boolean;
  /** No hidden flag raised. */
  present: boolean;
  // The names of the former engine's agents, which the UI and project renderers still use.
  _id: number;
  _pos: any;
};

export class Snapshot {
  readonly agents: readonly SnapshotAgent[];
  readonly world: Readonly<Record<string, any>>;
  /** The number of vertices of a finite space (0 for an infinite one, such as the line). */
  readonly size: number;

  constructor(readonly config: Config, readonly system: System) {
    const flagNames = system.lay.flags.map(f => f.name);
    this.size = system.space.vertices?.length ?? 0;
    this.world = config.world;
    this.agents = config.agents.map((a, index) => {
      const flags = Object.fromEntries(flagNames.map(f => [f, !!a.f[f]]));
      const id = typeof a.pub?.id === 'number' ? a.pub.id : index;
      return {
        index, id, pos: a.pos, flags,
        fields: Object.fromEntries(Object.entries(a.f).filter(([k]) => !flagNames.includes(k))),
        pub: a.pub, mem: a.mem, line: system.line(a),
        correct: system.rt.correct(a), present: system.rt.present(a),
        _id: id, _pos: a.pos,
      };
    });
  }

  /** The agents at a position (the former engine's configuration interface, which renderers still use). */
  get(node: unknown): { state: null; agents: SnapshotAgent[] } {
    return { state: null, agents: this.agents.filter(a => a.pos === node) };
  }
}
