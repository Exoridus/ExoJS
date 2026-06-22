import { useSyncExternalStore } from 'react';

import { css, cx } from './react-utils';
import styles from './ThemeToggle.module.scss';

const STORAGE_KEY = 'exo-theme';

type Theme = 'dark' | 'light';

function subscribeTheme(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
}

function getThemeSnapshot(): Theme {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function ThemeToggle(): JSX.Element {
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
                <span aria-hidden="true">Dark</span>
            </button>
            <button
                type="button"
                aria-label="Use light theme"
                data-active={theme === 'light' ? 'true' : 'false'}
                aria-pressed={theme === 'light'}
                onClick={() => chooseTheme('light')}
            >
                <span aria-hidden="true">Light</span>
            </button>
        </div>
    );
}

function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
}
