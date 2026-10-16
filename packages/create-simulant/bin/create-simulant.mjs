#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (args.length === 1 && ['-h', '--help'].includes(args[0])) {
  console.log('Usage: npm create @bramas/simulant@latest <directory>\n\nCreates a minimal project. Then run npm install and npm run dev.');
} else if (args.length === 1 && ['-v', '--version'].includes(args[0])) {
  console.log(metadata.version);
} else {
  try {
    if (args.length !== 1 || args[0].startsWith('-')) throw new Error('Give one project directory, for example: npm create @bramas/simulant@latest my-project');
    const directory = resolve(args[0]);
    if (existsSync(directory) && readdirSync(directory).length) throw new Error(`The directory is not empty: ${directory}. Choose a new or empty directory.`);
    mkdirSync(directory, { recursive: true });
    cpSync(fileURLToPath(new URL('../template/', import.meta.url)), directory, { recursive: true, errorOnExist: true, force: false });
    renameSync(resolve(directory, 'gitignore'), resolve(directory, '.gitignore'));
    const file = resolve(directory, 'package.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.name = basename(directory).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '') || 'simulant-project';
    // Freeze the simulator version with the initializer used to create the project.
    for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
      for (const name of Object.keys(dependencies ?? {})) if (name.startsWith('@bramas/simulant-')) dependencies[name] = metadata.version;
    }
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    const displayedDirectory = /^[a-zA-Z0-9_./-]+$/.test(args[0]) ? args[0] : "'" + args[0].replaceAll("'", "'\"'\"'") + "'";
    console.log(`Created ${directory}\n\nNext:\n  cd ${displayedDirectory}\n  npm install\n  npm run dev\n\nCheck the experiment: npx simulant check-all -p cautious-pair\nGenerate and compile Lean: npx simulant lean --build`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
