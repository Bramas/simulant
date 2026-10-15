import { TextDocuments, TextDocumentSyncKind, ResponseError, ErrorCodes, type Connection, type InitializeParams, type Diagnostic } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageService } from '../../language-service/src/service';

export function attachServer(connection: Connection, createService: (params: InitializeParams) => LanguageService) {
  const documents = new TextDocuments(TextDocument);
  let service: LanguageService;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let published = new Set<string>();

  const validate = () => {
    clearTimeout(timer);
    const all = new Map<string, Diagnostic[]>();
    for (const doc of documents.all()) {
      for (const [uri, diagnostics] of service.analyze(doc.uri).diagnostics) {
        const previous = all.get(uri) ?? [];
        const keys = new Set(previous.map(d => JSON.stringify(d)));
        all.set(uri, [...previous, ...diagnostics.filter(d => !keys.has(JSON.stringify(d)))]);
      }
      if (!all.has(doc.uri)) all.set(doc.uri, []);
    }
    for (const uri of new Set([...published, ...all.keys()])) {
      void connection.sendDiagnostics({ uri, version: documents.get(uri)?.version, diagnostics: all.get(uri) ?? [] });
    }
    published = new Set(all.keys());
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(validate, 100); };

  connection.onInitialize(params => {
    service = createService(params);
    return { capabilities: {
      positionEncoding: 'utf-16', textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['.', '"', '/'] }, hoverProvider: true, definitionProvider: true,
      referencesProvider: true, renameProvider: { prepareProvider: true }, documentSymbolProvider: true,
      workspaceSymbolProvider: true, foldingRangeProvider: true, signatureHelpProvider: { triggerCharacters: [' ', '('] },
    }, serverInfo: { name: 'Simulant', version: '0.1.0' } };
  });
  documents.onDidChangeContent(({ document }) => {
    service.setDocument(document.uri, document.getText(), document.version);
    schedule();
  });
  documents.onDidClose(({ document }) => { service.closeDocument(document.uri); schedule(); });
  connection.onDidChangeWatchedFiles(() => { service.invalidate(); schedule(); });
  connection.onCompletion(p => service.completion(p.textDocument.uri, p.position));
  connection.onHover(p => service.hover(p.textDocument.uri, p.position) ?? null);
  connection.onDefinition(p => service.definition(p.textDocument.uri, p.position) ?? null);
  connection.onReferences(p => service.references(p.textDocument.uri, p.position, p.context.includeDeclaration));
  connection.onPrepareRename(p => service.prepareRename(p.textDocument.uri, p.position) ?? null);
  connection.onRenameRequest(p => {
    try { return service.rename(p.textDocument.uri, p.position, p.newName); }
    catch (error) { throw new ResponseError(ErrorCodes.InvalidParams, error instanceof Error ? error.message : String(error)); }
  });
  connection.onDocumentSymbol(p => service.documentSymbols(p.textDocument.uri));
  connection.onWorkspaceSymbol(p => service.workspaceSymbols(p.query));
  connection.onFoldingRanges(p => service.foldingRanges(p.textDocument.uri));
  connection.onSignatureHelp(p => service.signatureHelp(p.textDocument.uri, p.position) ?? null);
  connection.onShutdown(() => { clearTimeout(timer); });
  documents.listen(connection);
  return { invalidate: () => { service.invalidate(); schedule(); } };
}
