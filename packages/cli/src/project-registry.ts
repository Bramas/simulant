import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProjectType } from '@bramas/simulant-core/types/project';

export type ProjectSourceOptions = { root?: string; registry?: string };

type ProjectPackage = { slug: string; registry: string };

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const conditions = value as Record<string, unknown>;
    return exportTarget(conditions.node) ?? exportTarget(conditions.import) ?? exportTarget(conditions.default);
  }
}

async function packageAt(directory: string): Promise<ProjectPackage | undefined> {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const declared = exportTarget(manifest.exports?.['./projects']);
  const candidates = declared ? [declared] : ['projects.ts', 'src/projects.ts'];
  for (const candidate of candidates) {
    const registry = resolve(directory, candidate);
    try {
      await access(registry);
      return { slug: basename(directory), registry };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (declared) throw new Error(`Project registry declared in ${directory}/package.json does not exist: ${registry}`);
    }
  }
}

async function packagesIn(directory: string): Promise<ProjectPackage[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const packages: ProjectPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const pkg = await packageAt(join(directory, entry.name));
    if (pkg) packages.push(pkg);
  }
  return packages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function discoverProjectPackages(source: ProjectSourceOptions = {}): Promise<ProjectPackage[]> {
  const root = resolve(source.root ?? process.cwd());
  if (source.registry) return [{ slug: basename(root), registry: resolve(root, source.registry) }];
  const [currentPackage, publicPackages, privatePackages] = await Promise.all([
    packageAt(root), packagesIn(join(root, 'projects')), packagesIn(join(root, 'projects/private')),
  ]);
  return [...(currentPackage ? [currentPackage] : []), ...publicPackages, ...privatePackages];
}

async function loadRegistry(pkg: ProjectPackage): Promise<Record<string, ProjectType<any, any>>> {
  const module = await import(pathToFileURL(pkg.registry).href);
  if (!module.projects || typeof module.projects !== 'object') {
    throw new Error(`${pkg.registry} must export a projects map`);
  }
  return module.projects;
}

export async function listProjects(source: ProjectSourceOptions = {}): Promise<string[]> {
  const registries = await Promise.all((await discoverProjectPackages(source)).map(loadRegistry));
  const names = registries.flatMap(registry => Object.keys(registry));
  if (new Set(names).size !== names.length) throw new Error('Duplicate simulation names in project registries');
  return names.sort();
}

/** Prefer the matching package so an unrelated private project cannot break a public command. */
export async function loadProject(name: string, source: ProjectSourceOptions = {}): Promise<ProjectType<any, any>> {
  const packages = await discoverProjectPackages(source);
  const matching = packages.filter(pkg => name === pkg.slug || name.startsWith(`${pkg.slug}-`));
  const candidates = matching.length ? matching : packages;
  for (const pkg of candidates) {
    const registry = await loadRegistry(pkg);
    if (Object.hasOwn(registry, name)) return registry[name];
  }
  throw new Error(`Unknown project "${name}". Run simulant list-projects to see available simulations.`);
}
