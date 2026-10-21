import { For, type JSX } from 'solid-js';
import { keywords as languageKeywords } from '../../../packages/language-service/src/catalog';

/** The language's keywords, and the experiment fields a reader looks for first. */
const keywords = [...new Set([...languageKeywords, 'model', 'agents', 'position', 'init', 'limits', 'theorem'])];
const keywordPattern = new RegExp(`^(${keywords.join('|')})$`);
const tokenPattern = new RegExp(
  `(/-[\\s\\S]*?-/|--.*|".*?"|:=|[{}()[\\].,:]|\\b(?:${keywords.join('|')})\\b|\\b[A-Z][A-Za-z0-9_]*\\b|\\b\\d+\\b)`,
  'g',
);

export const highlight = (code: string) =>
  code.split(tokenPattern).filter(Boolean).map((part) => {
    if (keywordPattern.test(part)) return <span class="tok-keyword">{part}</span>;
    if (/^(\/-[\s\S]*-\/|--.*)$/.test(part)) return <span class="tok-comment">{part}</span>;
    if (/^".*"$/.test(part)) return <span class="tok-string">{part}</span>;
    if (/^[A-Z][A-Za-z0-9_]*$/.test(part)) return <span class="tok-type">{part}</span>;
    if (/^\d+$/.test(part)) return <span class="tok-number">{part}</span>;
    if (/^(:=|[{}()[\].,:])$/.test(part)) return <span class="tok-punctuation">{part}</span>;
    return part;
  });

export const Code = (props: { code: string }) => <pre class="code"><code>{highlight(props.code)}</code></pre>;

/** Inline Markdown of doc comments: paragraphs and `code`. */
export function Prose(props: { text: string }) {
  return (
    <For each={props.text.split(/\n\s*\n/)}>
      {(paragraph) => (
        <p>
          {paragraph.replace(/\s*\n\s*/g, ' ').split(/(`[^`]+`)/).map((part) =>
            part.startsWith('`') ? <code>{part.slice(1, -1)}</code> : part)}
        </p>
      )}
    </For>
  );
}

export type Page = 'home' | 'guide' | 'library' | 'builder';

/** Pages are built as `index.html`, `guide/`, `library/` and `builder/`; links are relative to `root`. */
export function Nav(props: { page: Page; root: string }) {
  const href = (path: string) => `${props.root}${path}`;
  return (
    <nav class="nav" aria-label="Main navigation">
      <a class="brand" href={props.page === 'home' ? '#top' : href('')}>Simulant</a>
      <div class="nav-links">
        <a href={href('guide/')} aria-current={props.page === 'guide' ? 'page' : undefined}>Guide</a>
        <a href={href('library/')} aria-current={props.page === 'library' ? 'page' : undefined}>Library</a>
        <a href={href('builder/')} aria-current={props.page === 'builder' ? 'page' : undefined}>Builder</a>
        <a class="secondary" href={href('#projects')}>Projects</a>
        <a class="secondary" href="https://github.com/bramas/simulant">GitHub</a>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer class="footer">
      <span>Simulant · CeCILL-B · Quentin Bramas</span>
      <span>
        Please cite: F. Bonnet, Q. Bramas, A. Lamani. <em>Searching for an Eventually-Emerging Black Hole in Rings</em>, SAND 2026.
      </span>
    </footer>
  );
}

export const icon = (path: JSX.Element) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {path}
  </svg>
);
