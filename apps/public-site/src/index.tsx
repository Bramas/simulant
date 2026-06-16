import { render } from 'solid-js/web';

import { publicProjects } from './public-projects.mjs';
import './site.css';

const highlightTypeScript = (code: string) => {
  const parts = code.split(/(".*?"|'.*?'|`[\s\S]*?`|\/\/.*|=>|===|!==|[{}()[\].,;:<>]|\b(?:const|let|type|class|extends|function|constructor|super|return|new|for|of|if|else|export|null|true|false|as|satisfies)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+\b)/g);

  return parts.filter(Boolean).map((part) => {
    if (/^(const|let|type|class|extends|function|constructor|super|return|new|for|of|if|else|export|null|true|false|as|satisfies)$/.test(part)) {
      return <span class="tok-keyword">{part}</span>;
    }
    if (/^(".*?"|'.*?'|`[\s\S]*?`)$/.test(part)) {
      return <span class="tok-string">{part}</span>;
    }
    if (/^\/\/.*/.test(part)) {
      return <span class="tok-comment">{part}</span>;
    }
    if (/^[A-Z][A-Za-z0-9_]*$/.test(part)) {
      return <span class="tok-type">{part}</span>;
    }
    if (/^\d+$/.test(part)) {
      return <span class="tok-number">{part}</span>;
    }
    if (/^(=>|===|!==|[{}()[\].,;:<>])$/.test(part)) {
      return <span class="tok-punctuation">{part}</span>;
    }
    return part;
  });
};

function TypeScriptCode(props: { code: string }) {
  return <code>{highlightTypeScript(props.code)}</code>;
}

const coreSteps = [
  {
    label: 'Build a view',
    transition: 'SystemInfo.View',
    type: '(config, agent) -> { view, inverse }',
    detail:
      'The model computes what one agent can observe and how a local target maps back to a concrete position.',
  },
  {
    label: 'Ask the agent',
    transition: 'AbstractAgent.action',
    type: '(view) -> { targetLocation, action }',
    detail:
      'The algorithm only sees its local view. It chooses a target location and can attach an action payload.',
  },
  {
    label: 'Update the config',
    transition: 'SystemInfo.Update',
    type: '(config, actions) -> config | ND_array<config>',
    detail:
      'The model applies all simultaneous actions. It may return one next state or several nondeterministic choices.',
  },
  {
    label: 'Explore lazily',
    transition: 'execute(system)',
    type: 'path -> config, sibling count, child count',
    detail:
      'The executor stores a configuration tree and computes missing children only when the UI asks for them.',
  },
];

const codeExamples = [
  {
    title: 'A typed line model',
    caption:
      'A model fixes the meaning of positions, local locations, visible state, and updates. This is close to packages/core/src/models/line.ts.',
    code: `type PositionState = null; // change if positions have states
type PositionType = number; // a position on the line

// Locations the agent can see or choose as a target.
type LocationType = "here" | "left" | "right";

// Visible memory published by an agent.
type VisibleMemory = { id: number; energy: number };

// What an agent sees at one local location.
type LocationStateType = VisibleMemory[];

// Extra action payload. Movement is already encoded by targetLocation.
type ActionType = null;

type LineConfig<AgentType extends LineAgent> = Config<
  AgentType,
  LocationType,
  LocationStateType,
  ActionType,
  PositionType,
  PositionState
>;

type LineSystem<AgentType extends LineAgent> = SystemInfo<
  AgentType,
  PositionState,
  PositionType,
  LocationType,
  LocationStateType,
  ActionType,
  LineConfig<AgentType>
>;

function makeLineModel<AgentType extends LineAgent>(
  agents: AgentType[],
  initialConfig: LineConfig<AgentType>,
): LineSystem<AgentType> {
  return {
  Agents: agents,
  InitialConfig: initialConfig,
  View: (config, agent) => {
    const memoryAt = (pos: number) =>
      config.get(pos).agents.map((a) => a.visibleMemory());

    const view = new Map([
      ["left", null],
      ["here", memoryAt(agent._pos)], // we only see here
      ["right", null],
    ]);

    return {
      view,
      inverse: (location) =>
        location === "left" ? agent._pos - 1 :
        location === "right" ? agent._pos + 1 :
        agent._pos,
    };
  },
  Update: (config, actions) => {
    const next = new Config() as LineConfig<AgentType>;
    for (const [agent, targetPosition] of actions) {
      agent._pos = targetPosition;
      next.addAgent(agent._pos, agent);
    }
    return next;
  },
  };
}`,
  },
  {
    title: 'An agent for that line',
    caption:
      'The agent type plugs into the model types. The algorithm sees only the local view and returns a local target.',
    code: `class LineAgent extends AbstractAgent<
  PositionType,
  LocationType,
  LocationStateType,
  ActionType
> {
  energy = 3;

  constructor(id: number, position: number) {
    super(id, position);
  }

  visibleMemory(): VisibleMemory {
    return { id: this._id, energy: this.energy };
  }

  action(view: Map<LocationType, LocationStateType>) {
    const alone = view.get("here")?.length === 1;

    return {
      targetLocation: alone || this.id == 0 ? "right" : "here",
      action: null,
    };
  }

  clone(): LineAgent {
    const clone = new LineAgent(this._id, this._pos);
    clone.energy = this.energy;
    return clone;
  }
}`,
  },
  {
    title: 'A project runs agents in the model',
    caption:
      'A project creates agents, an initial configuration, and returns the typed model from setup.',
    code: `export const projects = {
  "line-walk": {
    setup: () => {
      const agents = [
        new LineAgent(0, 0),
        new LineAgent(1, 2),
      ];
      const initialConfig = new Config() as LineConfig<LineAgent>;

      for (const agent of agents) {
        initialConfig.addAgent(agent._pos, agent);
      }

      return makeLineModel(agents, initialConfig);
    },
    drawConfig,
    editorSchema,
  },
} satisfies Record<string, ProjectType<LineConfig<LineAgent>>>;`,
  },
];

const createSteps = [
  {
    command: 'git clone https://github.com/bramas/simulant.git',
    detail: 'Clone the public simulator and install dependencies with pnpm install.',
  },
  {
    command: 'cp -R projects/black-hole-search projects/my-project',
    detail:
      'Start from an existing project or create a package that exports a projects.ts file and optional web/ app.',
  },
  {
    command: 'pnpm dev',
    detail:
      'Run the default project page locally. Private projects can temporarily use link:../simulant/packages/core and link:../simulant/packages/simulator-ui.',
  },
  {
    command: 'pnpm build',
    detail:
      'Build the public site. Add a project to apps/public-site/src/public-projects.mjs only when it should be published.',
  },
];

function App() {
  return (
    <>
      <nav class="nav" aria-label="Main navigation">
        <a class="brand" href="#top">Simulant</a>
        <div class="nav-links">
          <a href="#projects">Projects</a>
          <a href="#core">Core</a>
          <a href="#examples">Examples</a>
          <a href="#create">Create</a>
          <a href="https://github.com/bramas/simulant">GitHub</a>
        </div>
      </nav>

      <header class="site-header" id="top">
        <div class="intro">
          <p class="eyebrow">Mobile entities research simulator</p>
          <h1>Simulate distributed mobile-entity algorithms.</h1>
          <p class="lead">
            Simulant separates paper-specific algorithms from the simulator core. A project chooses a model,
            defines agents and presets, and can publish an interactive page while keeping the core version pinned
            for reproducibility.
          </p>
        </div>
      </header>

      <main>
        <section class="section" id="projects">
          <div class="section-heading compact">
            <p class="eyebrow">Published pages</p>
            <h2>Projects</h2>
            <p>
              Public paper artifacts are listed here. Private or unpublished projects can live under
              `projects/private` locally and stay out of the published site.
            </p>
          </div>

          <div class="project-list">
            {publicProjects.map((project, index) => (
              <a class="project-row" href={project.href}>
                <span class="project-index">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.paper}</small>
                </span>
                <span class="project-description">{project.description}</span>
              </a>
            ))}
          </div>
        </section>

        <section class="section" id="core">
          <div class="section-heading">
            <p class="eyebrow">Core simulator</p>
            <h2>How a round is computed</h2>
            <p>
              The core only needs a `SystemInfo`: agents, an initial configuration, a `View` function, and an
              `Update` function. During a round, the executor asks the model for local views, lets each agent choose
              an action, then asks the model to produce the next configuration.
            </p>
          </div>

          <div class="round-table">
            {coreSteps.map((step, index) => (
              <article class="round-row">
                <div class="round-left">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
                <div class="round-right">
                  <strong>{step.transition}</strong>
                  <code>{step.type}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section class="section" id="examples">
          <div class="section-heading">
            <p class="eyebrow">Minimal pieces</p>
            <h2>Model, agent, project</h2>
            <p>
              These snippets mirror the real structure in `packages/core/src/models` and `projects/*/projects.ts`.
              The details can grow, but the contract stays small.
            </p>
          </div>

          <div class="code-examples">
            {codeExamples.map((example) => (
              <article class="code-card">
                <div>
                  <h3>{example.title}</h3>
                  <p>{example.caption}</p>
                </div>
                <pre><TypeScriptCode code={example.code} /></pre>
              </article>
            ))}
          </div>
        </section>

        <section class="section" id="create">
          <div class="section-heading">
            <p class="eyebrow">Start a project</p>
            <h2>Clone, adapt, publish when ready</h2>
            <p>
              During research, projects can point to local simulator packages. When a paper is ready, switch to exact
              published package versions and add the page to the public project list.
            </p>
          </div>

          <ol class="command-list">
            {createSteps.map((step) => (
              <li>
                <code>{step.command}</code>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

render(() => <App />, document.getElementById('root')!);
