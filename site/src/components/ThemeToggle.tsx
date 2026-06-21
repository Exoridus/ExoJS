import { useEffect, useState } from 'react';

import { css, cx } from './react-utils';
import styles from './ThemeToggle.module.scss';

const STORAGE_KEY = 'exo-theme';

type Theme = 'dark' | 'light';

function resolveInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark';
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage === 'dark' || fromStorage === 'light') return fromStorage;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle(): JSX.Element {
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        const initial = resolveInitialTheme();
        setTheme(initial);
        applyTheme(initial);
    }, []);

    const chooseTheme = (nextTheme: Theme): void => {
        setTheme(nextTheme);
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
