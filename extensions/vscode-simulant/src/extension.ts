import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.sim');
  context.subscriptions.push(watcher);
  const start = async () => {
    await client?.stop();
    const server = context.asAbsolutePath('dist/server.cjs');
    client = new LanguageClient('simulant', 'Simulant', { run: { module: server, transport: TransportKind.ipc },
      debug: { module: server, transport: TransportKind.ipc } }, {
      documentSelector: [{ language: 'simulant', scheme: 'file' }, { language: 'simulant', scheme: 'untitled' }],
      initializationOptions: () => ({ stdlibPath: vscode.workspace.getConfiguration('simulant').get<string>('stdlibPath', '') }),
      synchronize: { fileEvents: watcher },
    });
    await client.start();
  };
  context.subscriptions.push(vscode.commands.registerCommand('simulant.restartLanguageServer', start));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('simulant.stdlibPath')) void start();
  }));
  await start();
}

export async function deactivate() { await client?.stop(); client = undefined; }
