import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { ConsoleSeverity, OutputEntry, PreviewConsole } from '../lib/preview-console';
import type { PreviewErrorEntry } from '../lib/types';
import styles from './OutputPanel.module.scss';
import { css, cx } from './react-utils';

export interface OutputPanelProps {
  output: PreviewConsole;
  /** Failures outside the preview - the catalog or the example source failed to load. */
  systemErrors: readonly PreviewErrorEntry[];
}

type OutputFilter = 'error' | 'warn' | 'info' | 'log';

const FILTERS: ReadonlyArray<{ id: OutputFilter; label: string }> = [
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
  { id: 'log', label: 'Logs' },
];

const FILTER_OF: Record<ConsoleSeverity, OutputFilter> = { error: 'error', warn: 'warn', info: 'info', log: 'log', debug: 'log' };

const SEVERITY_LABEL: Record<ConsoleSeverity, string> = { error: 'Error', warn: 'Warning', info: 'Info', log: 'Log', debug: 'Debug' };

const ALL_FILTERS: ReadonlySet<OutputFilter> = new Set(FILTERS.map(filter => filter.id));

const STORAGE_KEY = 'exo-playground-output-open';

const readStoredOpen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const storeOpen = (open: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Storage disabled - the panel still toggles for the session.
  }
};

const subscribeNever = (): (() => void) => () => undefined;

/**
 * The preview's console, collapsed to one line under the preview by default.
 * Plain logs never open it; the first uncaught error of a preview run, or a
 * failed source load, does - unless the visitor collapsed it during that run.
 */
export const OutputPanel = ({ output, systemErrors }: OutputPanelProps): JSX.Element | null => {
  const snapshot = useSyncExternalStore(output.subscribe, output.getSnapshot, output.getSnapshot);
  const storedOpen = useSyncExternalStore(subscribeNever, readStoredOpen, () => false);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [dismissedGeneration, setDismissedGeneration] = useState(-1);
  const [filters, setFilters] = useState<ReadonlySet<OutputFilter>>(ALL_FILTERS);
  const [copied, setCopied] = useState(false);
  const listId = useId();
  const listRef = useRef<HTMLOListElement | null>(null);
  const pinnedToBottomRef = useRef(true);

  const hasFailure = snapshot.exceptions > 0 || systemErrors.length > 0;
  const userOpen = openChoice ?? storedOpen;
  const open = userOpen || (hasFailure && dismissedGeneration !== snapshot.generation);

  const visible = open ? snapshot.entries.filter(entry => filters.has(FILTER_OF[entry.severity])) : [];
  const errorCount = snapshot.counts.error + systemErrors.length;
  const warningCount = snapshot.counts.warn;
  const total = snapshot.counts.log + snapshot.counts.info + snapshot.counts.debug + warningCount + snapshot.counts.error;
  const latest = snapshot.entries[snapshot.entries.length - 1] ?? null;

  useLayoutEffect(() => {
    const list = listRef.current;

    if (list && pinnedToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [open, snapshot]);

  const toggle = (): void => {
    const next = !open;

    setOpenChoice(next);
    storeOpen(next);

    if (!next) {
      setDismissedGeneration(snapshot.generation);
    }
  };

  const toggleFilter = (id: OutputFilter): void => {
    setFilters(current => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  // Clearing also clears the failure that may have opened the panel; the
  // visitor is looking at it, so it stays open.
  const clear = (): void => {
    setOpenChoice(true);
    output.clear();
  };

  const copyAll = (): void => {
    const text = [
      ...systemErrors.map(error => `[error] ${error.summary}${error.details ? `\n${error.details}` : ''}`),
      ...snapshot.entries.map(formatEntryForCopy),
    ].join('\n');

    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  if (snapshot.entries.length === 0 && systemErrors.length === 0) {
    return null;
  }

  return (
    <section className={css(styles, 'root')} data-open={open ? 'true' : undefined} aria-label="Preview output">
      <div className={css(styles, 'bar')}>
        <button type="button" className={css(styles, 'toggle')} aria-expanded={open} aria-controls={listId} onClick={toggle}>
          <svg className={css(styles, 'chevron')} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={css(styles, 'title')}>Output</span>
          {errorCount > 0 && (
            <span className={cx(css(styles, 'badge'), css(styles, 'badge--error'))}>
              {errorCount} error{errorCount === 1 ? '' : 's'}
            </span>
          )}
          {warningCount > 0 && (
            <span className={cx(css(styles, 'badge'), css(styles, 'badge--warn'))}>
              {warningCount} warning{warningCount === 1 ? '' : 's'}
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className={css(styles, 'quiet-count')}>{total === 0 ? 'No messages' : `${total} message${total === 1 ? '' : 's'}`}</span>
          )}
        </button>
        {!open && latest && (
          <span className={css(styles, 'latest')} data-severity={latest.severity} title={latest.text}>
            {latest.text}
          </span>
        )}
        {open && (
          <div className={css(styles, 'tools')}>
            <div className={css(styles, 'filters')} role="group" aria-label="Show messages">
              {FILTERS.map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  className={css(styles, 'filter')}
                  data-filter={filter.id}
                  aria-pressed={filters.has(filter.id)}
                  onClick={() => toggleFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={css(styles, 'action')}
              onClick={copyAll}
              onBlur={() => setCopied(false)}
              disabled={total === 0 && systemErrors.length === 0}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className={css(styles, 'action')} onClick={clear} disabled={snapshot.entries.length === 0}>
              Clear
            </button>
          </div>
        )}
      </div>
      <ol
        ref={listRef}
        id={listId}
        className={css(styles, 'list')}
        hidden={!open}
        tabIndex={open ? 0 : -1}
        aria-label="Output messages"
        onScroll={event => {
          const list = event.currentTarget;

          pinnedToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
        }}
      >
        {open &&
          filters.has('error') &&
          systemErrors.map(error => <SystemErrorRow key={`${error.summary}::${error.details ?? ''}`} error={error} />)}
        {open && snapshot.evicted > 0 && (
          <li className={css(styles, 'notice')}>{snapshot.evicted} older messages were removed to keep the list short.</li>
        )}
        {visible.map(entry => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
        {open && visible.length === 0 && systemErrors.length === 0 && (
          <li className={css(styles, 'notice')}>
            {snapshot.entries.length === 0 ? 'The example has not logged anything yet.' : 'No messages match the selected filters.'}
          </li>
        )}
      </ol>
      <span className={css(styles, 'sr-only')} role="status" aria-live="polite">
        {snapshot.exceptions > 0 ? `${snapshot.exceptions} runtime error${snapshot.exceptions === 1 ? '' : 's'} in the preview` : ''}
      </span>
    </section>
  );
};

const EntryRow = ({ entry }: { entry: OutputEntry }): JSX.Element => (
  <li className={css(styles, 'entry')} data-severity={entry.severity} data-kind={entry.kind}>
    <span className={css(styles, 'time')}>{formatTime(entry.time)}</span>
    <span className={css(styles, 'severity')}>
      <span className={css(styles, 'sr-only')}>{entry.kind === 'exception' ? 'Uncaught error' : SEVERITY_LABEL[entry.severity]}: </span>
    </span>
    <div className={css(styles, 'body')}>
      {entry.kind === 'exception' && <span className={css(styles, 'kind')}>Uncaught</span>}
      <span className={css(styles, 'text')}>{entry.text}</span>
      {entry.count > 1 && (
        <span className={css(styles, 'repeat')} title={`Repeated ${entry.count} times`}>
          x{entry.count}
        </span>
      )}
      {entry.details && (
        <details className={css(styles, 'details')}>
          <summary>Stack</summary>
          <pre>{entry.details}</pre>
        </details>
      )}
    </div>
  </li>
);

const SystemErrorRow = ({ error }: { error: PreviewErrorEntry }): JSX.Element => (
  <li className={css(styles, 'entry')} data-severity="error" data-kind="system">
    <span className={css(styles, 'time')} aria-hidden="true">
      -
    </span>
    <span className={css(styles, 'severity')} />
    <div className={css(styles, 'body')}>
      <span className={css(styles, 'text')}>{error.summary}</span>
      {error.details && error.details !== error.summary && (
        <details className={css(styles, 'details')} open>
          <summary>Details</summary>
          <pre>{error.details}</pre>
        </details>
      )}
    </div>
  </li>
);

const formatTime = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(2)}s`;

const formatEntryForCopy = (entry: OutputEntry): string => {
  const label = entry.kind === 'exception' ? 'uncaught' : entry.severity;
  const repeat = entry.count > 1 ? ` (x${entry.count})` : '';

  return `[${formatTime(entry.time)}] [${label}] ${entry.text}${repeat}${entry.details ? `\n${entry.details}` : ''}`;
};
