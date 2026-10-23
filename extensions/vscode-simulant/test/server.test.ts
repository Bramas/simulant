import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter, NullLogger, TextDocument } from 'vscode-languageserver-protocol/node';

test('a bundled stdio LSP server handles incremental edits, imported buffers, navigation and shutdown', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-lsp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = join(directory, 'server.cjs');
  await build({ entryPoints: [fileURLToPath(new URL('../../../packages/language-server/src/node.ts', import.meta.url))], outfile: server, bundle: true, platform: 'node', format: 'cjs', target: 'node20' });
  const source = `import "std/examples.sim"
import "./helper.sim"
experiment e where
  model := blackHoleSearch (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [5]
  param site : Pos in [pos 2]
  agents := amount
  position i := pos 0
`;
  const main = pathToFileURL(join(directory, 'main.sim')).href;
  const helper = pathToFileURL(join(directory, 'helper.sim')).href;
  await writeFile(fileURLToPath(main), source);
  await writeFile(fileURLToPath(helper), 'def amount : Nat := 2\n');
  const child = spawn(process.execPath, [server, '--stdio'], { env: { ...process.env, SIMULANT_STDLIB: fileURLToPath(new URL('../../../packages/stdlib/sim', import.meta.url)) }, stdio: 'pipe' });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const connection = createProtocolConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin), NullLogger);
  t.after(() => { connection.dispose(); child.kill(); });
  const history: any[] = [], listeners: ((p: any) => void)[] = [];
  connection.onNotification('textDocument/publishDiagnostics', p => { history.push(p); for (const listener of listeners) listener(p); });
  const diagnostic = (predicate: (p: any) => boolean) => new Promise<any>((resolve, reject) => {
    const previous = history.find(predicate);
    if (previous) { resolve(previous); return; }
    const timer = setTimeout(() => reject(new Error(`No matching diagnostics. ${stderr}`)), 5000);
    listeners.push(p => { if (predicate(p)) { clearTimeout(timer); resolve(p); } });
  });
  connection.listen();
  const initialized: any = await connection.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(directory).href,
    capabilities: {}, workspaceFolders: [{ uri: pathToFileURL(directory).href, name: 'fixture' }] });
  assert.equal(initialized.capabilities.textDocumentSync, 2);
  assert.equal(initialized.capabilities.renameProvider.prepareProvider, true);
  await connection.sendNotification('initialized', {});
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: main, languageId: 'simulant', version: 1, text: source } });
  await diagnostic(p => p.uri === main && p.version === 1 && p.diagnostics.length === 0);
  const doc = TextDocument.create(main, 'simulant', 1, source);
  const start = doc.positionAt(source.indexOf('amount')), end = doc.positionAt(source.indexOf('amount') + 6);
  const definition: any = await connection.sendRequest('textDocument/definition', { textDocument: { uri: main }, position: start });
  assert.equal(definition.uri, helper);
  const completion: any = await connection.sendRequest('textDocument/completion', { textDocument: { uri: main }, position: start });
  assert.ok(completion.some((item: any) => item.label === 'amount'));
  await connection.sendNotification('textDocument/didChange', { textDocument: { uri: main, version: 2 }, contentChanges: [{ range: { start, end }, text: 'true' }] });
  const bad = await diagnostic(p => p.uri === main && p.version === 2 && p.diagnostics.length > 0);
  assert.match(bad.diagnostics[0].message, /Nat|Bool/);
  await connection.sendNotification('textDocument/didChange', { textDocument: { uri: main, version: 3 }, contentChanges: [{ range: { start, end: { ...start, character: start.character + 4 } }, text: 'amount' }] });
  await diagnostic(p => p.uri === main && p.version === 3 && p.diagnostics.length === 0);
  history.length = 0;
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: helper, languageId: 'simulant', version: 1, text: 'invalid source\n' } });
  await diagnostic(p => p.uri === helper && p.diagnostics.length > 0);
  history.length = 0;
  await connection.sendNotification('textDocument/didClose', { textDocument: { uri: helper } });
  await diagnostic(p => p.uri === helper && p.diagnostics.length === 0);
  const hover: any = await connection.sendRequest('textDocument/hover', { textDocument: { uri: main }, position: start });
  assert.match(hover.contents.value, /amount/);
  await connection.sendRequest('shutdown');
  await connection.sendNotification('exit');
  assert.equal(stderr, '');
});
