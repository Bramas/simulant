// Compile runtime packages while retaining their module boundaries and Solid JSX.
import ts from 'typescript';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspace = fileURLToPath(new URL('..', import.meta.url));
export const packageDirectories = ['packages/stdlib', 'packages/lang', 'packages/engine', 'packages/core',
  'packages/lean-gen', 'packages/vite-plugin', 'packages/simulator-ui', 'lean', 'packages/cli', 'packages/create-simulant'];
const outputExtension = file => file.endsWith('.tsx') ? '.jsx' : '.js';

function moduleSpecifier(file, text) {
  if (!text.startsWith('.')) return text;
  const target = resolve(dirname(file), text);
  if (/\.tsx?$/.test(text)) return text.replace(/\.tsx?$/, outputExtension(text));
  if (extname(text)) return text;
  for (const extension of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(target + extension)) return text + extension.replace(/\.tsx?$/, outputExtension(extension));
  }
  return text;
}

function imports(file) {
  return context => {
    const visit = node => {
      if (ts.isStringLiteral(node) && ((ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent))
        || (ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword))) {
        return ts.factory.createStringLiteral(moduleSpecifier(file, node.text));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  };
}

export function buildPackages() {
  for (const directory of packageDirectories) {
    const manifest = JSON.parse(readFileSync(join(workspace, directory, 'package.json'), 'utf8'));
    cpSync(join(workspace, 'LICENCE.txt'), join(workspace, directory, 'LICENCE.txt'));
    const source = join(workspace, directory, 'src');
    if (!existsSync(source)) continue;
    const output = join(workspace, directory, 'dist');
    rmSync(output, { recursive: true, force: true });
    for (const relative of readdirSync(source, { recursive: true, withFileTypes: false })) {
      const file = join(source, relative);
      if (!/\.(?:ts|tsx|mjs|css)$/.test(file) || file.endsWith('.d.ts')) continue;
      const destination = join(output, relative.replace(/\.tsx?$/, outputExtension(file)));
      mkdirSync(dirname(destination), { recursive: true });
      if (file.endsWith('.css')) { cpSync(file, destination); continue; }
      const text = readFileSync(file, 'utf8');
      const checkImports = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const dependency = node.moduleSpecifier.text.match(/^(@bramas\/[^/]+)/)?.[1];
          if (dependency && dependency !== manifest.name && !manifest.dependencies?.[dependency] && !manifest.peerDependencies?.[dependency]) {
            throw new Error(`${manifest.name} imports ${dependency} without declaring it (${file}).`);
          }
        }
        ts.forEachChild(node, checkImports);
      };
      checkImports(ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true));
      const result = ts.transpileModule(text, {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve, verbatimModuleSyntax: true },
        transformers: { before: [imports(file)] },
      });
      writeFileSync(destination, result.outputText);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildPackages();
  console.log('Built Simulant runtime packages.');
}
