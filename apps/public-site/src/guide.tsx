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
              When agent 0 does not come back, agent 1 concludes that the hole is behind its clockwise port and says so in its
              output <code>claim</code>, which the task <code>IdentifyBlackHole</code> reads. <code>Ring.cw</code> is the agent's
              neighbor behind port 0; with a common sense of direction (<code>Frames.identity</code>, as in this model), port 0 is
              clockwise for every agent.
            </p>
          </Section>

          <Section id="experiments" title="Experiments">
            <p>An experiment is what the simulator runs and the explorer checks. Its fields:</p>
            <Table head={['Field', 'Meaning']} rows={[
              ['model := …', 'The model: space, observation, frames, sensors, memory, round and components.'],
              ['algorithm := …', 'The algorithm every agent runs.'],
              ['task := …', 'The task, with its goal.'],
              ['param x : T in …', 'A parameter and its domain. The model reads some (the size N of a cycle, a radius phi); components read others, such as site.'],
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
              Each argument changes one assumption and leaves the algorithm untouched. The <em>space</em> is a graph: a cycle, the
              infinite line, a star, or your own. An agent sees the part of it within its <em>observation</em> radius, as anonymous
              <em>locations</em>, in an order its <em>frames</em> decide: the ports as they are, a numbering of its own, or any
              symmetry of the view, chosen by the adversary. The <em>sensors</em> decide what it learns about each location:
              an algorithm may only read the sensors its model provides, by name, and declares them with <code>uses</code>.
              <em>Components</em> add state and behavior to the world: a black hole, crashes, pebbles, lights, monitors for tasks.
              Some sensors need a component (<code>colors</code> reads the lights of <code>Storage.Lights</code>), and components
              read experiment parameters (<code>Faults.CrashAt</code> reads <code>param crashNode</code>).
              The <a href="../builder/">model builder</a> keeps track of these dependencies for you.
            </p>
            <p>A paper's model is worth naming once, as a definition with its own arguments:</p>
            <Code code={ex.ownModel} />
            <Table head={['Assumption', 'Where it is chosen']} rows={[
              ['space', 'Graphs.Cycle N, Graphs.Line, Graphs.Star k, Graphs.Dynamic space k (at most k edges missing per round)'],
              ['observation', 'Observe.radius r (the r-hop view), Observe.full'],
              ['frames', 'Frames.identity, Frames.isomorphisms, Frames.portPermutations .perLook / .perRobot'],
              ['round', '.fsync, .ssync (a fair nonempty subset), .sequential (one agent at a time)'],
              ['memory', '.oblivious (robots), .persistent (blackHoleRobots)'],
              ['sensors', 'occupied, count, colors, otherStates, spaceSize, …'],
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
              ['move l', 'Move to the location l of the Look (a neighbor, such as Ring.cw or port 1), and end the activation.'],
              ['stay', 'Stay for this activation.'],
              ['halt', 'Stay forever.'],
              ['wait n', 'Stay n activations.'],
              ['repeat', 'Repeat the indented block forever.'],
              ['while c', 'Repeat the block while c holds.'],
              ['if c then … else …', 'Choose a block; chains with else if.'],
              ['let x : T := e', 'A local variable; locals kept across a move need a type.'],
              ['x := e, pub := e', 'Assign a local or the public state.'],
              ['stay with { pebble := .drop }', 'Set the model\'s actions for this activation.'],
            ]} />
            <p>
              An agent sees its Look: <code>here</code>, the locations it sees (<code>visible</code>), the neighbors of a location
              (<code>neighbors l</code>, in port order under port-based frames) and distances (<code>distance a b</code>).
              Locations are valid for one activation and cannot be stored: to remember a neighbor, store its index in
              <code>neighbors here</code>, a port number. <code>port i</code>, <code>Ring.cw</code> (port 0) and <code>Ring.ccw</code>
              (port 1) name neighbors. Sensors are read by name: <code>otherStates.isEmpty</code>, <code>pebblesHere = 0</code>, and,
              for a sensor about each location, <code>occupied l</code>. The agent never sees positions or the experiment's parameters.
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
              In an oblivious model (<code>robots</code> by default), robots keep nothing between activations: no program counter, no locals.
              The algorithm decides each step from what it sees now, so it reads as a list of guarded rules.
              Helper definitions (<code>def</code>) are functions, usable in algorithms, tasks and parameter domains; one that reads the
              Look, such as <code>occupiedNeighbors</code> below, can only be called by algorithms.
              A program that needs memory is rejected by the compiler.
            </p>
            <Code code={ex.oblivious} />
            <p>
              <code>occupied</code> tells, for each location, whether a robot stands there. Under <code>Frames.isomorphisms</code>, the
              adversary chooses at each activation which of the two neighbors comes first, so <code>Ring.cw</code> is whichever side it
              presents first: the robot has no sense of direction.
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
              An answer given in the agent's own terms, such as a port, is read with <code>C.resolve a i</code> (the neighbor behind port
              <code>i</code>) or <code>C.follow a i k</code>.
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
              A sensor receives the Look <code>L</code> (and a location, for a sensor about each location): it can read who stands where,
              but returns no position. The <code>@[equivariant]</code> attribute claims that a component or a task commutes with the
              symmetries the frames keep, used to reduce the state space; it is tested on bounded instances.
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
