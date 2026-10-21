/**
 * Minimal preview of a `.sim` experiment (plan, Phase 3): choose an
 * experiment and its parameters, follow an execution by choosing among the
 * successors (labelled by their witnesses), and check it. Saving the source
 * or one of its imports refreshes the page through Vite's hot updates.
 */
import * as entry from 'simulant-entry';
import { explore } from '@bramas/simulant-engine/explorer';
import { System, type Config, type Successor } from '@bramas/simulant-engine/system';
import type { SimModule } from '@bramas/simulant-vite-plugin/module';
import { choices, update, type Session } from './session';

const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;

let session: Session = update(undefined, entry as unknown as SimModule);
let system: System | undefined;
/** The execution followed so far; the first step is an initial configuration. */
let path: Successor[] = [];
let starts: Successor[] = [];

function label(s: Successor) {
  return s.witness.map(c => c.label).join('; ') || 'step';
}

function restart() {
  path = [];
  system = undefined;
  const good = session.good;
  if (!good || !session.experiment || !session.params) return render();
  try {
    system = new System(good.experiments[session.experiment], session.params);
    starts = system.initial();
    if (starts.length === 1) path = [starts[0]];
  } catch (e) {
    $('result').textContent = String(e);
  }
  render();
}

function render() {
  const m = session.module;
  $('status').textContent = `revision ${m.revision}${session.outOfDate ? ' — out of date: fix the errors below' : ''}`;
  $('status').classList.toggle('stale', session.outOfDate);
  $('diagnostics').textContent = m.diagnostics.map(d =>
    `${d.file ? `${d.file.split('/').pop()}:${d.line}:${d.column}: ` : ''}${d.message}`).join('\n');
  $('notes').textContent = session.notes.join('; ');

  const exps = Object.keys(session.good?.experiments ?? {});
  const sel = $<HTMLSelectElement>('experiment');
  sel.replaceChildren(...exps.map(n => new Option(n, n, false, n === session.experiment)));
  const params = $<HTMLSelectElement>('params');
  const all = session.experiment && session.good ? choices(session.good.experiments[session.experiment]) : [];
  params.replaceChildren(...all.map((p, i) => new Option(JSON.stringify(p), String(i), false, JSON.stringify(p) === JSON.stringify(session.params))));

  const current = path[path.length - 1];
  const succ = $('successors');
  succ.replaceChildren();
  if (system) {
    const options = current ? system.successors(current.config) : starts;
    if (!current) succ.append(Object.assign(document.createElement('div'), { textContent: 'Choose an initial configuration:' }));
    for (const s of options) {
      const b = document.createElement('button');
      b.textContent = current ? label(s) : (label(s) || 'initial');
      b.onclick = () => { path.push(s); render(); };
      succ.append(b);
    }
  }
  $('path').textContent = path.map((s, i) => `${i}: ${i === 0 ? 'start' : label(s)} — ${system?.verdict(s.config)}`).join('\n');
  $('config').textContent = current ? JSON.stringify(current.config, null, 1) : '';
  draw(current?.config);
}

function draw(C: Config | undefined) {
  const canvas = $<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!C || !system) return;
  // A ring drawing of a finite space's vertices (the preview is a minimal viewer).
  const N = system.space.vertices?.length ?? 0;
  const cx = canvas.width / 2, cy = canvas.height / 2, r = canvas.width * 0.36;
  const at = (n: number, rr = r) => {
    const a = -Math.PI / 2 + 2 * Math.PI * n / N;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const fg = getComputedStyle(document.body).color;
  ctx.strokeStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.font = '12px system-ui';
  ctx.fillStyle = fg;
  for (let n = 0; n < N; n++) {
    const [x, y] = at(n, r * 0.82);
    ctx.fillText(`u${n}`, x - 8, y + 4);
  }
  // A site in the world (the black hole): red, filled once active.
  if (typeof C.world.site === 'number') {
    const [x, y] = at(C.world.site);
    ctx.strokeStyle = '#c62828';
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 2 * Math.PI);
    if (C.world.active) ctx.fill(); else ctx.stroke();
  }
  const perNode = new Map<number, number>();
  C.agents.forEach((a, i) => {
    const k = perNode.get(a.pos) ?? 0;
    perNode.set(a.pos, k + 1);
    const [x, y] = at(a.pos, r * (1.12 + 0.1 * k));
    const flags = Object.entries(a.f).filter(([, v]) => v === true).map(([f]) => f);
    ctx.fillStyle = flags.length ? '#888' : ['#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00'][i % 4];
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 2 * Math.PI);
    ctx.fill();
    if (flags.length) {
      ctx.fillStyle = fg;
      ctx.fillText(flags.join(','), x + 9, y + 4);
    }
  });
}

$('experiment').onchange = e => {
  session = { ...session, experiment: (e.target as HTMLSelectElement).value, params: undefined, notes: [] };
  session = update(session, session.module);
  restart();
};
$('params').onchange = e => {
  const all = choices(session.good!.experiments[session.experiment!]);
  session = { ...session, params: all[Number((e.target as HTMLSelectElement).value)], notes: [] };
  restart();
};
$('restart').onclick = restart;
$('back').onclick = () => { if (path.length > 1) path.pop(); render(); };
$('check').onclick = () => {
  if (!system) return;
  const r = explore(system);
  $('result').textContent = `${r.status}: ${r.reason}\n${JSON.stringify(r.stats)}${r.counterexample
    ? `\ncounterexample (${r.counterexample.kind}, ${r.counterexample.steps.length} steps):\n${r.counterexample.steps.map(s => s.witness.map(c => c.label).join('; ') || 'start').join('\n')}`
    : ''}`;
};

// A semantic update restarts the execution (plan 6.7); errors keep the last good view.
(entry as unknown as SimModule).subscribe?.(mod => {
  session = update(session, mod);
  $('result').textContent = '';
  if (!session.outOfDate) restart();
  else render();
});

restart();
