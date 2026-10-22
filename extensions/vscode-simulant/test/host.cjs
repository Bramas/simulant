const assert = require('node:assert/strict');
const vscode = require('vscode');

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for VS Code compiler diagnostics.');
}

exports.run = async () => {
  const extension = vscode.extensions.getExtension('bramas.simulant');
  assert.ok(extension, 'The development extension is registered.');
  await extension.activate();
  const source = `import "std/examples.sim"
def helper (x : Nat) : Nat := x + 1
experiment e where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [5]
  param site : Pos in [pos 2]
  agents := helper 1
  position i := pos 0
`;
  const doc = await vscode.workspace.openTextDocument({ language: 'simulant', content: source });
  assert.equal(doc.languageId, 'simulant');
  const cursor = doc.positionAt(source.indexOf('blackHoleRobots') + 2);
  const hover = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, cursor);
  assert.ok(hover.length > 0, 'Hover provider is active.');
  const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, cursor);
  assert.ok(definitions.length > 0, 'Definition provider is active.');
  const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, cursor);
  assert.ok(completion.items.some(item => item.label === 'blackHoleRobots'), 'Completion provider is active.');
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri);
  assert.ok(symbols.some(symbol => symbol.name === 'e'), 'Document outline is active.');
  const edits = await vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', doc.uri, doc.positionAt(source.indexOf('helper') + 1), 'renamedHelper');
  assert.equal(edits.get(doc.uri).length, 2, 'Rename follows the declaration and its use.');
  const start = source.indexOf('helper 1');
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(start), doc.positionAt(start + 8)), 'true');
  assert.equal(await vscode.workspace.applyEdit(edit), true);
  await until(() => vscode.languages.getDiagnostics(doc.uri).some(d => /Nat|Bool/.test(d.message)));
  console.log('SIMULANT_EXTENSION_HOST_OK: activation, language mode, hover, definition, completion, outline, rename and live diagnostics.');
};
