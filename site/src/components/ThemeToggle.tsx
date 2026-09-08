import { useSyncExternalStore } from 'react';

import { css, cx } from './react-utils';
import styles from './ThemeToggle.module.scss';

const STORAGE_KEY = 'exo-theme';

type Theme = 'dark' | 'light';

const subscribeTheme = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

const getThemeSnapshot = (): Theme => {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
};

export const ThemeToggle = (): JSX.Element => {
  // The DOM `data-theme` is the source of truth (set pre-hydration by the AppShell
  // inline script). Subscribing to it keeps the toggle in sync without a
  // setState-in-effect and stays hydration-safe via the 'dark' server snapshot.
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'dark');

  const chooseTheme = (nextTheme: Theme): void => {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div className={cx(css(styles, 'root'), css(styles, 'theme-toggle'))} role="group" aria-label="Theme selector">
      <button
        type="button"
        aria-label="Use dark theme"
        data-active={theme === 'dark' ? 'true' : 'false'}
        aria-pressed={theme === 'dark'}
        onClick={() => chooseTheme('dark')}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
          <path d="M17.5 10.66A7.5 7.5 0 1 1 9.34 2.5a5.83 5.83 0 0 0 8.16 8.16z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Use light theme"
        data-active={theme === 'light' ? 'true' : 'false'}
        aria-pressed={theme === 'light'}
        onClick={() => chooseTheme('light')}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
};
