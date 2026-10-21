import { For, type JSX } from 'solid-js';
import { render } from 'solid-js/web';

import * as ex from './guide-examples';
import { Code, Footer, Nav } from './layout';
import './site.css';

const reference = 'https://github.com/Bramas/simulant/blob/main/docs/sim-language.md';

const toc = [
  ['first-file', 'A first file'],
  ['experiments', 'Experiments'],
  ['models', 'Choosing a model'],
  ['algorithms', 'Writing an algorithm'],
  ['oblivious', 'Oblivious algorithms'],
  ['tasks', 'Tasks and goals'],
  ['parameters', 'Parameters'],
  ['custom', 'Your own pieces'],
  ['run', 'Run and check'],
] as const;

const Section = (props: { id: string; title: string; children: JSX.Element }) => (
  <section class="docs-section prose" id={props.id}>
    <h2><a href={`#${props.id}`}>{props.title}</a></h2>
    {props.children}
  </section>
);

const Table = (props: { head: [string, string]; rows: [string, string][] }) => (
  <table>
    <thead><tr><th>{props.head[0]}</th><th>{props.head[1]}</th></tr></thead>
    <tbody>
      <For each={props.rows}>{([code, text]) => <tr><td><code>{code}</code></td><td>{text}</td></tr>}</For>
    </tbody>
  </table>
);

function Guide() {
  return (
    <>
      <Nav page="guide" root="../" />
      <header class="page-header">
        <p class="eyebrow">Guide</p>
        <h1>Writing models and algorithms</h1>
        <p class="lead">
          A <code>.sim</code> file describes an algorithm, the model it runs in and the task it should solve, in a syntax close to Lean.
          This guide walks through each part. The <a href={reference}>language reference</a> lists every construct.
        </p>
      </header>

      <div class="docs-layout">
        <aside class="toc" aria-label="Guide contents">
          <For each={toc}>{([id, title]) => <a class="toc-section" href={`#${id}`}>{title}</a>}</For>
          <a class="toc-section" href="../library/">Standard library →</a>
          <a class="toc-section" href="../builder/">Model builder →</a>
        </aside>

        <main class="docs-main">
          <Section id="first-file" title="A first file">
            <p>
              A file imports the standard library, declares an algorithm, and binds it to a model and a task in an <em>experiment</em>.
              Declarations start at the left margin; as in Lean, a construct continues on more indented lines.
              Comments are <code>-- …</code> and <code>/- … -/</code>; <code>/-- … -/</code> documents the next declaration,
              and the file's first <code>/-! … -/</code> comment describes the whole experiment on its page.
            </p>
            <Code code={ex.firstFile} />
            <p>
              Agent 1 cannot see the hole: it only reads <code>otherStates</code>, the public states of the other agents on its node.
              When agent 0 does not come back, agent 1 concludes that the hole is clockwise and says so in its public state,
              which the task <code>IdentifyBlackHole</code> reads.
            </p>
          </Section>

          <Section id="experiments" title="Experiments">
            <p>An experiment is what the simulator runs and the explorer checks. Its fields:</p>
            <Table head={['Field', 'Meaning']} rows={[
              ['model := …', 'The model: topology, sensors, memory, orientation, round and components.'],
              ['algorithm := …', 'The algorithm every agent runs.'],
              ['task := …', 'The task, with its goal.'],
              ['param x : T in …', 'A parameter and its domain. The ring size is always N; components read others, such as site.'],
              ['agents := …', 'The number of agents (an expression of the parameters).'],
              ['position i := …', 'Where agent i starts.'],
              ['limits := { … }', 'Optional exploration bounds: depth, states.'],
            ]} />
            <p>
              A file may hold several experiments, sharing an algorithm with different models; a project registers the ones its page shows.
            </p>
          </Section>

          <Section id="models" title="Choosing a model">
            <p>
              A model is built by a <em>model family</em> of the <a href="../library/#models">standard library</a>, from arguments.
              Arguments are positional or named, and named ones have defaults:
            </p>
            <Code code={ex.models} />
            <p>
              Each argument changes one assumption and leaves the algorithm untouched. The <em>sensors</em> decide what agents know:
              an algorithm may only read the sensors its model provides, by name, and declares them with <code>uses</code>.
              <em>Components</em> add state and behavior to the world: a black hole, crashes, pebbles, lights, monitors for tasks.
              Some sensors need a component (<code>lineView</code> reads the radius of <code>Vision.Radius</code>), and components
              read experiment parameters (<code>Faults.CrashAtNode</code> reads <code>param crashNode</code>).
              The <a href="../builder/">model builder</a> keeps track of these dependencies for you.
            </p>
            <p>A paper's model is worth naming once, as a definition with its own arguments:</p>
            <Code code={ex.ownModel} />
            <Table head={['Assumption', 'Where it is chosen']} rows={[
              ['topology', 'Ring, or DynamicRing k (at most k edges missing per round)'],
              ['round', '.fsync, .ssync (a fair nonempty subset), .sequential (one agent at a time)'],
              ['memory', 'persistent, or oblivious in obliviousRing'],
              ['frame', 'Frames.common, Frames.dynamicReflection, Frames.persistent field'],
              ['sensors', 'otherStates, ringSize, ringPresence, lineView, colorView, …'],
              ['components', 'Hazards.BlackHole, Faults.CrashStop f, Storage.Pebbles, Storage.Lights k, …'],
            ]} />
          </Section>

          <Section id="algorithms" title="Writing an algorithm">
            <p>
              An algorithm is written as pseudocode. Each agent runs <code>main</code> from the top;
              <code>move</code>, <code>stay</code> and <code>halt</code> end its activation, and at its next activation it resumes
              right after. Reaching the end of <code>main</code> starts it again.
            </p>
            <Table head={['Declaration', 'Meaning']} rows={[
              ['Pub := { … }', 'The public state, which other agents may observe (through otherStates) and tasks read.'],
              ['init i := { pub := … }', 'The initial public state of agent i.'],
              ['output claim := pub.bh', 'An answer read by the task, named as the task expects it.'],
              ['def name (x : T) := …', 'A procedure, inlined where it is called.'],
              ['main := …', 'The program.'],
            ]} />
            <Table head={['Statement', 'Meaning']} rows={[
              ['move .cw / move .ccw', 'Move one node in a local direction, and end the activation.'],
              ['stay', 'Stay for this activation.'],
              ['halt', 'Stay forever.'],
              ['wait n', 'Stay n activations.'],
              ['repeat', 'Repeat the indented block forever.'],
              ['while c', 'Repeat the block while c holds.'],
              ['if c then … else …', 'Choose a block; chains with else if.'],
              ['let x : T := e', 'A local variable; locals kept across a move need a type.'],
              ['x := e, pub := e', 'Assign a local or the public state.'],
              ['move .cw with { pebble := .drop }', 'Set the model\'s actions for this activation.'],
            ]} />
            <p>
              Sensors are read by name, as values: <code>otherStates.isEmpty</code>, <code>otherStates.any (·.id = 0)</code>,
              <code>pebblesHere = 0</code>. Directions are local to the agent's frame; <code>dir.opposite</code> reverses one.
              Here is an algorithm that uses the pebble component's action and sensor, a procedure and a local variable:
            </p>
            <Code code={ex.pebbles} />
            <p>
              The page shows this text as written, with each agent marked on the line it last executed. Write the algorithm as you want readers to see it.
            </p>
            <p>
              The compiler turns a structured algorithm into a state machine whose memory is the program counter and the
              locals kept across moves. You can also write that state machine yourself, with <code>Mem</code> and <code>step</code>:
            </p>
            <Code code={ex.stateMachine} />
          </Section>

          <Section id="oblivious" title="Oblivious algorithms">
            <p>
              In an oblivious model (<code>obliviousRing</code>), robots keep nothing between activations: no program counter, no locals.
              The algorithm decides each step from what it sees now, so it reads as a list of guarded rules.
              Helper definitions (<code>def</code>) are functions on values, usable in algorithms, tasks and parameter domains.
              A program that needs memory is rejected by the compiler.
            </p>
            <Code code={ex.oblivious} />
            <p>
              <code>ringPresence</code> is the robot's view of the ring in its own orientation: entry <code>i</code> tells whether a robot is
              <code>i</code> nodes ahead. Under <code>Frames.dynamicReflection</code>, the adversary chooses that orientation at each activation.
            </p>
          </Section>

          <Section id="tasks" title="Tasks and goals">
            <p>
              A task gives each configuration a verdict: <code>.success</code>, <code>.failure</code> or <code>.inProgress</code>.
              Its goal says which executions solve it, and the explorer checks every execution against it:
            </p>
            <Table head={['Goal', 'Every execution…']} rows={[
              ['eventually .success', 'reaches a success.'],
              ['eventually always .success', 'ends with success forever.'],
              ['always ¬ .failure', 'never fails.'],
            ]} />
            <p>
              Tasks read the configuration <code>C</code>: <code>C.agents</code>, positions <code>a.pos</code>, public states
              <code>a.pub</code>, outputs, flags (<code>correct a</code>, <code>present a</code>) and component fields <code>C.world.site</code>.
              See the library's <a href="../library/#tasks">tasks</a>, and the next section for writing one.
            </p>
          </Section>

          <Section id="parameters" title="Parameters">
            <p>
              A parameter declares its domain: <code>in</code> gives an exact list, <code>where</code> a property, and both may be combined.
              Domains may depend on earlier parameters. The explorer enumerates finite domains, so
              <code>check-all</code> checks every setting.
            </p>
            <Code code={ex.parameters} />
            <p>
              Domains are part of the model, and of its Lean statement. The simulator's starting values are chosen separately,
              and a project can set them in <code>project.ts</code>.
            </p>
          </Section>

          <Section id="custom" title="Your own pieces">
            <p>
              Sensors, components and tasks are written in the same language as the library's. A component owns world and agent fields,
              flags and actions, and acts at the hook points of a round (<code>beforeLook</code>, <code>beforeMove</code>, <code>afterMove</code>).
              The adversary's choices are written <code>choose</code>, with labels shown in the simulator.
              The <code>@[equivariant …]</code> attribute claims a symmetry, used to reduce the state space; it is tested on bounded instances.
            </p>
            <Code code={ex.custom} />
          </Section>

          <Section id="run" title="Run and check">
            <p>
              A new project contains a starter file and a page. Save the file and the page reloads with the new experiment, or with
              the compiler's diagnostics.
            </p>
            <div class="terminal">
              <div class="terminal-bar"><span /><span /><span /></div>
              <pre>{ex.commands}</pre>
            </div>
            <p>
              The explorer reports a failure as a path you can replay step by step in the page.
              Bounded checks cover the settings in the domains; they do not prove the algorithm correct for all sizes,
              which is what the generated Lean model is for.
            </p>
          </Section>
        </main>
      </div>
      <Footer />
    </>
  );
}

render(() => <Guide />, document.getElementById('root')!);
