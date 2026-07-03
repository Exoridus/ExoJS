import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';

import styles from './GlobalSearch.module.scss';
import { css } from './react-utils';

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
    pagefindModule ??= import(/* @vite-ignore */ `${baseUrl}pagefind/pagefind.js`)
        .then(module => module as PagefindModule)
        .catch(() => null);
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

const MAX_HITS = 12;
const DEBOUNCE_MS = 140;

const useGlobalSearch = (baseUrl: string): { query: string; setQuery: (value: string) => void; hits: Array<SearchHit>; status: SearchStatus } => {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<Array<SearchHit>>([]);
    const [status, setStatus] = useState<SearchStatus>('idle');
    const requestId = useRef(0);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            requestId.current += 1;
            setHits([]);
            setStatus('idle');
            return;
        }

        const id = ++requestId.current;
        setStatus('searching');
        const timer = window.setTimeout(() => {
            void (async () => {
                const pagefind = await loadPagefind(baseUrl);
                if (id !== requestId.current) return;
                if (!pagefind) {
                    setHits([]);
                    setStatus('unavailable');
                    return;
                }
                const response = await pagefind.search(trimmed);
                if (id !== requestId.current) return;
                const data = await Promise.all(response.results.slice(0, MAX_HITS).map(result => result.data()));
                if (id !== requestId.current) return;
                setHits(
                    data.map(entry => ({
                        href: toHref(baseUrl, entry.url),
                        title: entry.meta.title ?? entry.url,
                        excerpt: entry.excerpt,
                        group: groupForUrl(entry.url),
                    })),
                );
                setStatus('done');
            })();
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [query, baseUrl]);

    return { query, setQuery, hits, status };
};

export interface GlobalSearchPanelProps {
    baseUrl: string;
    onNavigate?: () => void;
}

export function GlobalSearchPanel({ baseUrl, onNavigate }: GlobalSearchPanelProps): JSX.Element {
    const { query, setQuery, hits, status } = useGlobalSearch(baseUrl);
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        setActiveIndex(0);
    }, [hits]);

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
                                {/* Pagefind excerpts highlight matches with <mark>. */}
                                <span className={css(styles, 'hit-excerpt')} dangerouslySetInnerHTML={{ __html: hit.excerpt }} />
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

export function GlobalSearch({ baseUrl }: GlobalSearchProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const [isMac, setIsMac] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        setIsMac(/Mac|iP(hone|ad|od)/.test(window.navigator.platform));
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
