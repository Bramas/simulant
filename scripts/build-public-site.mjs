import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const projects = [
  {
    name: 'Black Hole Search',
    slug: 'black-hole-search',
    packageName: '@mobile-entities/project-black-hole-search',
    description: 'Simulators for the black-hole-search algorithms published in "Searching for an eventually-emerging black hole in rings", SAND 2026',
  },
];

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mobile Entities Simulator</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      body {
        margin: 0;
        background: #f7f7f4;
        color: #1f2933;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 56px 24px 72px;
      }
      h1 {
        font-size: 2.4rem;
        margin: 0 0 12px;
      }
      .intro {
        max-width: 760px;
        font-size: 1.05rem;
        color: #4b5563;
        margin-bottom: 36px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      a.card {
        display: block;
        padding: 18px;
        border: 1px solid #d8d8d2;
        border-radius: 8px;
        background: #ffffff;
        color: inherit;
        text-decoration: none;
      }
      a.card:hover {
        border-color: #6b7280;
      }
      .card h2 {
        margin: 0 0 8px;
        font-size: 1.1rem;
      }
      .card p {
        margin: 0;
        color: #5f6b7a;
      }
      @media (prefers-color-scheme: dark) {
        body {
          background: #111827;
          color: #f3f4f6;
        }
        .intro,
        .card p {
          color: #cbd5e1;
        }
        a.card {
          background: #1f2937;
          border-color: #374151;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Mobile Entities Simulator</h1>
      <p class="intro">
        This site gathers public simulator pages for mobile-entities research projects.
        Each page is generated from the project package in this repository and can pin
        its own simulator core and interface versions for reproducible paper artifacts.
      </p>
      <section class="grid" aria-label="Public projects">
        ${projects.map((project) => `<a class="card" href="./${project.slug}/">
          <h2>${project.name}</h2>
          <p>${project.description}</p>
        </a>`).join('\n        ')}
      </section>
    </main>
  </body>
</html>
`;

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const project of projects) {
  run('pnpm', ['--filter', project.packageName, 'build:web']);
}

await writeFile('dist/index.html', html);
await writeFile('dist/.nojekyll', '');
