// Composant générique de génération de formulaires basé sur un schéma
import { createEffect, For, Match, Switch } from "solid-js";
import { createStore } from "solid-js/store"
import type { SetStoreFunction } from "solid-js/store"

import type { EditorSchema, EditorField } from "@bramas/simulant-core/types/editor-schema";

export interface GenericEditorProps {
  schema: EditorSchema;
  onInput: (value: any) => void;
  value?: any;
}

function commitNativeEdit(
  element: HTMLTextAreaElement,
  replacement: string,
  start: number,
  end: number,
  selectionStart: number,
  selectionEnd: number,
  onInput: (value: string) => void
) {
  element.setRangeText(replacement, start, end, 'end');
  element.setSelectionRange(selectionStart, selectionEnd);
  onInput(element.value);
}

function getTouchedLineRange(value: string, selectionStart: number, selectionEnd: number) {
  const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let effectiveEnd = selectionEnd;

  if (selectionEnd > selectionStart && value[selectionEnd - 1] === '\n') {
    effectiveEnd -= 1;
  }

  const nextNewLine = value.indexOf('\n', Math.max(blockStart, effectiveEnd));
  const blockEnd = nextNewLine === -1 ? value.length : nextNewLine;

  return { blockStart, blockEnd };
}

function indentSelectedLines(
  element: HTMLTextAreaElement,
  onInput: (value: string) => void,
  indentUnit: string,
  selectionStart: number,
  selectionEnd: number
) {
  const value = element.value;
  const { blockStart, blockEnd } = getTouchedLineRange(value, selectionStart, selectionEnd);
  const selectedBlock = value.slice(blockStart, blockEnd);
  const lines = selectedBlock.split('\n');
  const replacement = lines.map((line) => `${indentUnit}${line}`).join('\n');

  const startOffset = selectionStart === selectionEnd ? indentUnit.length : selectionStart - blockStart + indentUnit.length;
  const endOffset = selectionEnd - blockStart + indentUnit.length * lines.length;

  commitNativeEdit(
    element,
    replacement,
    blockStart,
    blockEnd,
    blockStart + startOffset,
    blockStart + endOffset,
    onInput,
  );
}

function unindentSelectedLines(
  element: HTMLTextAreaElement,
  onInput: (value: string) => void,
  selectionStart: number,
  selectionEnd: number
) {
  const value = element.value;
  const { blockStart, blockEnd } = getTouchedLineRange(value, selectionStart, selectionEnd);
  const selectedBlock = value.slice(blockStart, blockEnd);
  const lines = selectedBlock.split('\n');

  let removedBeforeSelectionStart = 0;
  let removedBeforeSelectionEnd = 0;

  const replacement = lines.map((line, index) => {
    let removal = 0;
    if (line.startsWith('  ')) {
      removal = 2;
    } else if (line.startsWith('\t')) {
      removal = 1;
    }

    if (removal > 0) {
      if (index === 0) {
        removedBeforeSelectionStart = Math.min(removal, Math.max(0, selectionStart - blockStart));
      }
      removedBeforeSelectionEnd += removal;
    }

    return line.slice(removal);
  }).join('\n');

  const nextSelectionStart = Math.max(blockStart, selectionStart - removedBeforeSelectionStart);
  const nextSelectionEnd = Math.max(nextSelectionStart, selectionEnd - removedBeforeSelectionEnd);

  commitNativeEdit(
    element,
    replacement,
    blockStart,
    blockEnd,
    nextSelectionStart,
    nextSelectionEnd,
    onInput,
  );
}

function CodeEditor(props: {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  let textareaRef: HTMLTextAreaElement | undefined;
  let gutterRef: HTMLDivElement | undefined;

  const lineNumbers = () => {
    const lineCount = Math.max(1, props.value.split('\n').length);
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  };

  const syncScroll = () => {
    if (textareaRef && gutterRef) {
      gutterRef.scrollTop = textareaRef.scrollTop;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = textarea;

    if (event.key === 'Tab') {
      event.preventDefault();
      const hasSelection = selectionEnd > selectionStart;
      const touchesMultipleLines = value.slice(selectionStart, selectionEnd).includes('\n');

      if (event.shiftKey) {
        unindentSelectedLines(textarea, props.onInput, selectionStart, selectionEnd);
        return;
      }

      const indentation = '  ';

      if (hasSelection || touchesMultipleLines) {
        indentSelectedLines(textarea, props.onInput, indentation, selectionStart, selectionEnd);
        return;
      }

      commitNativeEdit(
        textarea,
        indentation,
        selectionStart,
        selectionEnd,
        selectionStart + indentation.length,
        selectionStart + indentation.length,
        props.onInput,
      );
      return;
    }

    if (event.key === 'Enter') {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const indentation = currentLine.match(/^[\t ]*/)?.[0] ?? '';

      if (indentation.length > 0) {
        event.preventDefault();
        const insert = `\n${indentation}`;
        const cursor = selectionStart + insert.length;
        commitNativeEdit(
          textarea,
          insert,
          selectionStart,
          selectionEnd,
          cursor,
          cursor,
          props.onInput,
        );
      }
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        'grid-template-columns': '3.5em minmax(0, 1fr)',
        border: '1px solid #c9d2dc',
        'border-radius': '6px',
        overflow: 'hidden',
        'background-color': '#f8fafc'
      }}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        style={{
          'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          'font-size': '0.9em',
          'line-height': '1.5',
          padding: '0.75em 0.5em',
          'text-align': 'right',
          color: '#6b7280',
          'background-color': '#eef2f7',
          'border-right': '1px solid #d7dee7',
          overflow: 'hidden',
          'user-select': 'none'
        }}
      >
        <For each={lineNumbers()}>
          {(lineNumber) => <div>{lineNumber}</div>}
        </For>
      </div>
      <textarea
        ref={textareaRef}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        placeholder={props.placeholder}
        rows={props.rows ?? 12}
        spellcheck={false}
        style={{
          width: '100%',
          margin: '0',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          padding: '0.75em',
          'background-color': '#fcfdff',
          color: '#17202a',
          'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          'font-size': '0.9em',
          'line-height': '1.5',
          'white-space': 'pre',
          'tab-size': '2'
        }}
      />
    </div>
  );
}

function renderTextArea(
  field: Extract<EditorField, { type: 'text' | 'textarea' | 'code' }>,
  fieldStore: { [key: string]: any; },
  setFieldStore: SetStoreFunction<{ [key: string]: any; }>
) {
  const isCodeEditor = field.type === 'code';

  return (
    <div>
      <label>
        {field.label}:{' '}
        {'placeholder' in field && field.placeholder && (
          <span style={{ "font-size": "0.9em", color: "#666" }}>({field.placeholder})</span>
        )}
        <br/>
        {isCodeEditor ? (
          <CodeEditor
            value={fieldStore[field.key] ?? ''}
            onInput={(value) => setFieldStore(field.key, value)}
            placeholder={'placeholder' in field ? field.placeholder : undefined}
            rows={'rows' in field && field.rows ? field.rows : 12}
          />
        ) : (
          <textarea
            value={fieldStore[field.key] ?? ''}
            onInput={(e) => setFieldStore(field.key, e.currentTarget.value)}
            placeholder={'placeholder' in field ? field.placeholder : undefined}
            rows={'rows' in field && field.rows ? field.rows : 4}
            spellcheck={field.type === 'textarea' ? field.spellcheck : false}
          />
        )}
      </label>
      <br/>
    </div>
  );
}

function RenderField(props: {field: EditorField, fieldStore: {[key: string]: any;}, setFieldStore: SetStoreFunction<{[key: string]: any;}>}) {

    return (
      <Switch>
        <Match when={props.field.type === 'number' && props.field}>
          {(f) => (
            <div>
              <label>
                {f().label}:{' '}
                <input 
                  type="number" 
                  value={props.fieldStore[props.field.key]} 
                  onInput={(e) => props.setFieldStore(props.field.key, parseFloat(e.currentTarget.value) || props.field.defaultValue)}
                  min={'min' in props.field ? props.field.min : undefined}
                  max={'max' in props.field ? props.field.max : undefined}
                  step={'step' in props.field ? props.field.step : undefined}
                />
              </label>
              <br/>
            </div>
          )}
        </Match>
        
        <Match when={props.field.type === 'text' && props.field && !('multiline' in props.field && props.field.multiline)}>
          <div>
            <label>
              {props.field.label}:{' '}
              {'placeholder' in props.field && props.field.placeholder && (
                <span style={{ "font-size": "0.9em", color: "#666" }}>({props.field.placeholder})</span>
              )}
              <br/>
              <input 
                type="text" 
                value={props.fieldStore[props.field.key] ?? ''} 
                onInput={(e) => props.setFieldStore(props.field.key, e.currentTarget.value)}
                placeholder={'placeholder' in props.field ? props.field.placeholder : undefined}
                pattern={'pattern' in props.field ? props.field.pattern : undefined}
              />
            </label>
            <br/>
          </div>
        </Match>

        <Match when={props.field.type === 'code' || props.field.type === 'textarea' || (props.field.type === 'text' && 'multiline' in props.field && props.field.multiline)}>
          {renderTextArea(
            props.field as Extract<EditorField, { type: 'text' | 'textarea' | 'code' }>,
            props.fieldStore,
            props.setFieldStore
          )}
        </Match>
        
        <Match when={props.field.type === 'boolean' && props.field}>
          {(f) => (
            <div>
              <label>
                <input 
                  type="checkbox" 
                  checked={props.fieldStore[props.field.key]} 
                  onInput={(e) => props.setFieldStore(props.field.key, e.currentTarget.checked)}
                />
                {' '}{props.field.label}
              </label>
              <br/>
            </div>
          )}
        </Match>
        
        <Match when={props.field.type === 'select' && props.field}>
          {(f) => (
            <div>
              <label>
                {props.field.label}:{' '}
                <select 
                  value={props.fieldStore[props.field.key]} 
                  onInput={(e) => props.setFieldStore(props.field.key,
                    typeof props.field.defaultValue === 'number' 
                      ? parseFloat(e.currentTarget.value)
                      : e.currentTarget.value
                  )}
                >
                  <For each={'options' in f() ? f().options : []}>
                    {(option) => <option value={option.value}>{option.label}</option>}
                  </For>
                </select>
              </label>
              <br/>
            </div>
          )}
        </Match>
      </Switch>
    );
  };


export function GenericEditor(props: GenericEditorProps) {

  const [fieldStore, setFieldStore] = createStore<{[key: string]: any}>({});
  
  // Update store when props.value changes
  createEffect(() => {
    const result: any = {};
    for (const field of props.schema.fields) {
      result[field.key] = (field as any).defaultValue;
      if (props.value && props.value[field.key] !== undefined) {
        result[field.key] = props.value[field.key];
      }
    }
    setFieldStore(result);
  });
  
  // Emit changes when any field changes
  createEffect(() => {
    const result: any = {};
    for (const [key, value] of Object.entries(fieldStore)) {
      result[key] = value;
    }
    props.onInput(result);
  });
  
  
  return (
    <div>
      <For each={props.schema.fields}>
        {(field) => <RenderField 
          field={field} 
          fieldStore={fieldStore} 
          setFieldStore={setFieldStore} />
        }
      </For>
    </div>
  );
}
