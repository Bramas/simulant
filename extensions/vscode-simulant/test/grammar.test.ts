import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { Registry, parseRawGrammar, INITIAL } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

test('the actual TextMate grammar colors declarations, imports, Unicode operators and nested comments', async () => {
  const require = createRequire(import.meta.url);
  const wasm = new Uint8Array(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'))).buffer;
  await loadWASM(wasm);
  const path = new URL('../syntaxes/simulant.tmLanguage.json', import.meta.url);
  const registry = new Registry({ onigLib: Promise.resolve({ createOnigScanner: p => new OnigScanner(p), createOnigString: s => new OnigString(s) }),
    loadGrammar: async () => parseRawGrammar(readFileSync(path, 'utf8'), path.pathname) });
  const grammar = (await registry.loadGrammar('source.simulant'))!;
  const colored = (line: string) => grammar.tokenizeLine(line, INITIAL).tokens.map(t => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }));
  assert.ok(colored('import "std/models.sim"').some(t => t.text === 'import' && t.scopes.some(s => s.startsWith('keyword'))));
  assert.ok(colored('def rotate (v : List Bool) : Nat := 2').some(t => t.text === 'rotate' && t.scopes.includes('entity.name.function.simulant')));
  assert.ok(colored('move .cw').some(t => t.text === '.cw' && t.scopes.includes('constant.other.constructor.simulant')));
  assert.ok(colored('if x ≥ 2 ∧ !b then').some(t => t.text === '≥' && t.scopes.includes('keyword.operator.simulant')));
  let stack = grammar.tokenizeLine('/- outer /- nested', INITIAL).ruleStack;
  const inner = grammar.tokenizeLine('def hidden := 1 -/ still outer', stack);
  assert.ok(inner.tokens.every(t => t.scopes.some(s => s.startsWith('comment.block'))));
  stack = inner.ruleStack;
  const outside = grammar.tokenizeLine('-/ def visible := 1', stack);
  assert.ok(outside.tokens.some(t => t.scopes.includes('entity.name.function.simulant')));
  registry.dispose();
});
