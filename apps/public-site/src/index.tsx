import { createSignal, For, type JSX } from 'solid-js';
import { render } from 'solid-js/web';

import { publicProjects } from './public-projects.mjs';
import './site.css';

const keywords = [
  'algorithm', 'uses', 'where', 'init', 'main', 'then', 'else', 'if', 'repeat', 'move', 'stay', 'halt',
  'experiment', 'model', 'task', 'param', 'agents', 'position', 'output', 'def', 'theorem',
];
const keywordPattern = new RegExp(`^(${keywords.join('|')})$`);
const tokenPattern = new RegExp(
  `(/-[\\s\\S]*?-/|--.*|".*?"|:=|[{}()[\\].,:]|\\b(?:${keywords.join('|')})\\b|\\b[A-Z][A-Za-z0-9_]*\\b|\\b\\d+\\b)`,
  'g',
);

const highlight = (code: string) =>
  code.split(tokenPattern).filter(Boolean).map((part) => {
    if (keywordPattern.test(part)) return <span class="tok-keyword">{part}</span>;
    if (/^(\/-[\s\S]*-\/|--.*)$/.test(part)) return <span class="tok-comment">{part}</span>;
    if (/^".*"$/.test(part)) return <span class="tok-string">{part}</span>;
    if (/^[A-Z][A-Za-z0-9_]*$/.test(part)) return <span class="tok-type">{part}</span>;
    if (/^\d+$/.test(part)) return <span class="tok-number">{part}</span>;
    if (/^(:=|[{}()[\].,:])$/.test(part)) return <span class="tok-punctuation">{part}</span>;
    return part;
  });

const Code = (props: { code: string }) => <pre class="code"><code>{highlight(props.code)}</code></pre>;

const icon = (path: JSX.Element) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const features = [
  {
    title: 'One source',
    text: 'The page, the explorer and the Lean model are all built from the same .sim file.',
    icon: icon(<><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h3" /></>),
  },
  {
    title: 'Pseudocode-like algorithms',
    text: 'Write algorithms as in the paper. Agents see the world only through their sensors.',
    icon: icon(<><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /><path d="m14 4-4 16" /></>),
  },
  {
    title: 'Composable models',
    text: 'Black holes, crashes, pebbles, dynamic rings: add a component and keep the algorithm.',
    icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></>),
  },
  {
    title: 'Every execution checked',
    text: 'Exhaustive exploration up to symmetry, liveness goals included.',
    icon: icon(<><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v10M11 7l-5 10M13 7l5 10" /></>),
  },
  {
    title: 'Replayable counterexamples',
    text: 'A failure is a path: load it in the page and step through it.',
    icon: icon(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="m10 9 5 3-5 3z" /></>),
  },
  {
    title: 'Lean models',
    text: 'Generated from the compiled experiment. Your proofs live beside them.',
    icon: icon(<><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>),
  },
];

const policies = {
  initiallyPresent: {
    verdict: 'pass',
    output: [
      'States: 108 · 27 settings · symmetry group of 8',
      '✅ ALL CONFIGURATIONS PASSED',
      '   every execution of every setting satisfies the task',
    ],
  },
  mayEmerge: {
    verdict: 'fail',
    output: [
      'States: 18 · 27 settings · symmetry group of 3',
      '❌ FAILURE FOUND: a reachable configuration fails the task',
      '   settings {"N":3,"site":1}, path [0, 0, 0, 1]',
      '   Step 0:                  0,1|.|.     inProgress',
      '   Step 1 (stays inactive): 1|0|.       inProgress',
      '   Step 2 (stays inactive): 0,1|.|.     inProgress',
      '   Step 3 (activates):      .|0!,1!|.   failure',
    ],
  },
} as const;
type Policy = keyof typeof policies;

const composeExample = `experiment cautiousPairCrash where
  model := blackHoleRing .mayEmerge .known
    (extra := [Faults.CrashStop 1, Storage.Pebbles])
  algorithm := CautiousPair
  task := IdentifyBlackHole`;

const leanExample = `theorem reachable_site
    (N : Nat) [NeZero N] (site : Fin N)
    (C : Config (sig N 2))
    (h : (model N 2).Reachable act0 (init N site) C) :
    C.world.BlackHole.site = site`;

const components = ['Hazards.BlackHole', 'Faults.CrashStop', 'Faults.CrashAtNode', 'Storage.Pebbles', 'Monitors.Visited', 'DynamicRing k', 'fsync · ssync'];

const start = `git clone https://github.com/bramas/simulant.git && cd simulant
pnpm install
pnpm dev                                # the starter page, updated on every save
pnpm cli check-all -p cautious-pair     # every execution of every setting
pnpm cli lean -p cautious-pair --build  # Lean model, then lake build`;

function PolicyDemo() {
  const [policy, setPolicy] = createSignal<Policy>('mayEmerge');
  const result = () => policies[policy()];

  return (
    <div class="demo">
      <div class="demo-code">
        <pre class="code"><code>
          <span class="tok-keyword">experiment</span> cautiousPair <span class="tok-keyword">where</span>{'\n'}
          {'  '}<span class="tok-keyword">model</span> <span class="tok-punctuation">:=</span> blackHoleRing{'\n    '}
          <span class="policy-switch" role="radiogroup" aria-label="Hole policy">
            <For each={Object.keys(policies) as Policy[]}>
              {(name) => (
                <button
                  role="radio"
                  aria-checked={policy() === name}
                  classList={{ active: policy() === name }}
                  onClick={() => setPolicy(name)}
                >
                  .{name}
                </button>
              )}
            </For>
          </span>{' '}.unknown{'\n'}
          {highlight(`  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat := (range 9).filter (· ≥ 3)
  param site : Node := ((range N).filter (· ≥ 1)).map node
  agents := 2`)}
        </code></pre>
      </div>
      <div class={`terminal ${result().verdict}`} aria-live="polite">
        <div class="terminal-bar"><span /><span /><span /></div>
        <pre><span class="prompt">$ simulant check-all -p cautious-pair</span>{'\n'}{result().output.join('\n')}</pre>
      </div>
    </div>
  );
}

function App() {
  return (
    <>
      <nav class="nav" aria-label="Main navigation">
        <a class="brand" href="#top">Simulant</a>
        <div class="nav-links">
          <a href="#features">Features</a>
          <a href="#example">Example</a>
          <a href="#projects">Projects</a>
          <a href="#start">Start</a>
          <a href="https://github.com/bramas/simulant">GitHub</a>
        </div>
      </nav>

      <header class="hero" id="top">
        <p class="eyebrow">Mobile-entity algorithms</p>
        <h1>Write it once.<br />Simulate, check, prove.</h1>
        <p class="lead">
          Describe your algorithm and its model in one <code>.sim</code> file. Simulant runs it in the browser,
          explores every execution, and generates its Lean model.
        </p>
        <div class="actions">
          <a class="button primary" href="#projects">Open a existing project</a>
          <a class="button" href="https://github.com/bramas/simulant">View on GitHub</a>
        </div>
        <figure class="screenshot">
          <picture>
            <source srcset="./simulator-dark.webp" media="(prefers-color-scheme: dark)" />
            <img
              src="./simulator-light.webp"
              width="1800"
              height="875"
              alt="The simulator: a ring where both agents have entered the black hole, beside the algorithm's source"
            />
          </picture>
          <figcaption>A counterexample found by the explorer, replayed step by step.</figcaption>
        </figure>
      </header>

      <main>
        <section class="section" id="features">
          <h2>Why Simulant</h2>
          <div class="features">
            <For each={features}>
              {(feature) => (
                <article class="feature">
                  <span class="feature-icon">{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              )}
            </For>
          </div>
        </section>

        <section class="section" id="example">
          <h2>Change the model, get the counterexample</h2>
          <p class="section-lead">Switch the hole policy and see what the explorer answers.</p>
          <PolicyDemo />
        </section>

        <section class="section pair">
          <article>
            <h2>Compose</h2>
            <p class="section-lead">Models are assembled from library components.</p>
            <Code code={composeExample} />
            <ul class="chips">
              <For each={components}>{(name) => <li>{name}</li>}</For>
            </ul>
          </article>
          <article>
            <h2>Prove</h2>
            <p class="section-lead">The generated Lean model states what your proofs must establish.</p>
            <Code code={leanExample} />
          </article>
        </section>

        <section class="section" id="projects">
          <h2>Projects</h2>
          <div class="projects">
            <For each={publicProjects}>
              {(project) => (
                <a class="project" href={project.href}>
                  <strong>{project.name}</strong>
                  <small>{project.paper}</small>
                  <span class="arrow" aria-hidden="true">→</span>
                </a>
              )}
            </For>
          </div>
        </section>

        <section class="section" id="start">
          <h2>Start a project</h2>
          <p class="section-lead">
            Copy <code>projects/starter</code>, edit its <code>.sim</code> file, and keep the page open.
          </p>
          <div class="terminal">
            <div class="terminal-bar"><span /><span /><span /></div>
            <pre>{start}</pre>
          </div>
        </section>
      </main>

      <footer class="footer">
        <span>Simulant · CeCILL-B · Quentin Bramas</span>
        <span>
          Please cite: F. Bonnet, Q. Bramas, A. Lamani. <em>Searching for an Eventually-Emerging Black Hole in Rings</em>, SAND 2026.
        </span>
      </footer>
    </>
  );
}

render(() => <App />, document.getElementById('root')!);
