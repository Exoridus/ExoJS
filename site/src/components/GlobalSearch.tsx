import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

import styles from './GlobalSearch.module.scss';
import { css, useClientValue } from './react-utils';

// Pagefind is generated into dist/pagefind/ by the build (`pagefind --site
// dist` runs after `astro build`), so the module only exists on a built site.
// It is loaded lazily on first search; in `astro dev` the import fails and the
// UI reports the index as unavailable instead of breaking the header.

interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: Record<string, string>;
}

interface PagefindResult {
  data: () => Promise<PagefindResultData>;
}

interface PagefindModule {
  search: (query: string) => Promise<{ results: Array<PagefindResult> }>;
}

let pagefindModule: Promise<PagefindModule | null> | null = null;

const loadPagefind = (baseUrl: string): Promise<PagefindModule | null> => {
  pagefindModule ??= import(/* @vite-ignore */ `${baseUrl}pagefind/pagefind.js`).then(module => module as PagefindModule).catch(() => null);
  return pagefindModule;
};

// Pagefind resolves result URLs against its own bundle location, so they
// usually already carry the site base path (`/ExoJS/en/guide/...`). Only
// prefix when it is genuinely missing.
const toHref = (baseUrl: string, url: string): string => {
  if (url.startsWith(baseUrl)) return url;
  if (url.startsWith('/')) return `${baseUrl.replace(/\/$/, '')}${url}`;
  return url;
};

const groupForUrl = (url: string): string => {
  if (url.includes('/guide/')) return 'Guide';
  if (url.includes('/api/')) return 'API';
  if (url.includes('/playground/')) return 'Playground';
  return 'Site';
};

interface SearchHit {
  href: string;
  title: string;
  excerpt: string;
  group: string;
}

type SearchStatus = 'idle' | 'searching' | 'done' | 'unavailable';

// A settled search, tagged with the query it was computed for. Keeping the
// query alongside the results is what lets `status` and `hits` be derived
// during render instead of reset from inside the effect.
interface SearchResult {
  query: string;
  hits: ReadonlyArray<SearchHit>;
  status: 'done' | 'unavailable';
}

const MAX_HITS = 12;
const DEBOUNCE_MS = 140;

const NO_HITS: ReadonlyArray<SearchHit> = [];
const NO_RESULT: SearchResult = { query: '', hits: NO_HITS, status: 'done' };

const useGlobalSearch = (baseUrl: string): { query: string; setQuery: (value: string) => void; hits: ReadonlyArray<SearchHit>; status: SearchStatus } => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>(NO_RESULT);
  const requestIdRef = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      // Invalidate any in-flight search; the derived status below already
      // reads 'idle' for an empty query, so there is nothing to reset.
      requestIdRef.current += 1;
      return;
    }

    const id = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const pagefind = await loadPagefind(baseUrl);
        if (id !== requestIdRef.current) return;
        if (!pagefind) {
          setResult({ query: trimmed, hits: NO_HITS, status: 'unavailable' });
          return;
        }
        const response = await pagefind.search(trimmed);
        if (id !== requestIdRef.current) return;
        const data = await Promise.all(response.results.slice(0, MAX_HITS).map(entry => entry.data()));
        if (id !== requestIdRef.current) return;
        setResult({
          query: trimmed,
          hits: data.map(entry => ({
            href: toHref(baseUrl, entry.url),
            title: entry.meta.title ?? entry.url,
            excerpt: entry.excerpt,
            group: groupForUrl(entry.url),
          })),
          status: 'done',
        });
      })();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, baseUrl]);

  // Everything the UI needs falls out of comparing the live query to the one
  // the last settled result was computed for - no state writes in the effect.
  const settled = result.query === trimmed;
  let status: SearchStatus = 'idle';
  if (trimmed) status = settled ? result.status : 'searching';

  return { query, setQuery, hits: settled ? result.hits : NO_HITS, status };
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const ENTITY_PATTERN = /&(#\d+|#[Xx][\dA-Fa-f]+|[A-Za-z]+);/g;
const MARK_PATTERN = /<mark>([\S\s]*?)<\/mark>/g;

const decodeEntities = (text: string): string =>
  text.replace(ENTITY_PATTERN, (entity, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10_ff_ff) return entity;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? entity;
  });

/**
 * Pagefind excerpts are HTML: matches are wrapped in `<mark>` and the
 * surrounding text is entity-escaped. Rather than trusting that escaping with
 * `dangerouslySetInnerHTML`, split on the mark tags and hand the pieces to
 * React as text - anything Pagefind failed to escape renders literally instead
 * of becoming markup.
 */
const renderExcerpt = (excerpt: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of excerpt.matchAll(MARK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(decodeEntities(excerpt.slice(cursor, start)));
    nodes.push(<mark key={start}>{decodeEntities(match[1] ?? '')}</mark>);
    cursor = start + match[0].length;
  }

  if (cursor < excerpt.length) nodes.push(decodeEntities(excerpt.slice(cursor)));
  return nodes;
};

export interface GlobalSearchPanelProps {
  baseUrl: string;
  onNavigate?: () => void;
}

export function GlobalSearchPanel({ baseUrl, onNavigate }: GlobalSearchPanelProps): JSX.Element {
  const { query, setQuery, hits, status } = useGlobalSearch(baseUrl);
  const [activeIndex, setActiveIndex] = useState(0);
  const [indexedHits, setIndexedHits] = useState(hits);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset the highlight when a new result set arrives. Adjusting state during
  // render (rather than in an effect) is React's documented pattern for this:
  // the re-render happens before the browser sees the stale index.
  if (indexedHits !== hits) {
    setIndexedHits(hits);
    setActiveIndex(0);
  }

  const moveActive = (delta: number): void => {
    if (hits.length === 0) return;
    setActiveIndex(current => {
      const next = (current + delta + hits.length) % hits.length;
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
      return next;
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      const hit = hits[activeIndex];
      if (hit) {
        onNavigate?.();
        window.location.assign(hit.href);
      }
    }
  };

  return (
    <div className={css(styles, 'panel')}>
      <div className={css(styles, 'input-row')}>
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="5.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.8 12.8L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          className={css(styles, 'input')}
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="global-search-results"
          aria-label="Search docs"
          placeholder="Search guide, API, playground..."
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {status === 'unavailable' && (
        <p className={css(styles, 'status')}>The search index is generated at build time — run a full build to enable search in this environment.</p>
      )}
      {status === 'done' && hits.length === 0 && <p className={css(styles, 'status')}>No results for “{query.trim()}”.</p>}
      {hits.length > 0 && (
        <ul className={css(styles, 'results')} id="global-search-results" ref={listRef} role="listbox">
          {hits.map((hit, index) => (
            <li key={hit.href} role="option" aria-selected={index === activeIndex}>
              <a
                className={css(styles, 'hit')}
                href={hit.href}
                data-active={index === activeIndex ? 'true' : 'false'}
                onClick={() => onNavigate?.()}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className={css(styles, 'hit-head')}>
                  <span className={css(styles, 'hit-title')}>{hit.title}</span>
                  <span className={css(styles, 'hit-group')}>{hit.group}</span>
                </span>
                <span className={css(styles, 'hit-excerpt')}>{renderExcerpt(hit.excerpt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface GlobalSearchProps {
  baseUrl: string;
}

const getIsMac = (): boolean => /Mac|iP(ad|hone|od)/.test(window.navigator.platform);

export function GlobalSearch({ baseUrl }: GlobalSearchProps): JSX.Element {
  const [open, setOpen] = useState(false);
  // The platform never changes after load - a read, not state.
  const isMac = useClientValue(getIsMac, false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button className={css(styles, 'trigger')} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="5.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.8 12.8L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Search</span>
        <kbd className={css(styles, 'trigger-kbd')}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <dialog
        className={css(styles, 'dialog')}
        ref={dialogRef}
        aria-label="Search docs"
        onClose={() => setOpen(false)}
        onClick={event => {
          // Native <dialog>: a click on the backdrop targets the dialog
          // element itself; clicks inside land on children.
          if (event.target === dialogRef.current) setOpen(false);
        }}
      >
        {open && <GlobalSearchPanel baseUrl={baseUrl} onNavigate={() => setOpen(false)} />}
        <div className={css(styles, 'footer')}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </dialog>
    </>
  );
}
