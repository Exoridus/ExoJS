import { useEffect, useState } from 'react';

import styles from './LanguagePicker.module.scss';
import { css, cx } from './react-utils';

const STORAGE_KEY = 'exo-language';

type Language = 'en' | 'de';

export interface LanguagePickerProps {
    baseUrl: string;
    currentPath: string;
    locale: Language;
}

export function LanguagePicker({ baseUrl, locale }: LanguagePickerProps): JSX.Element {
    const [language, setLanguage] = useState<Language>(locale === 'de' ? 'de' : 'en');

    useEffect(() => {
        const nextLanguage = locale === 'de' ? 'de' : 'en';
        setLanguage(nextLanguage);
        document.documentElement.setAttribute('lang', nextLanguage);
        window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    }, [locale]);

    const chooseLanguage = (nextLanguage: Language): void => {
        if (language === nextLanguage) return;
        window.localStorage.setItem(STORAGE_KEY, nextLanguage);
        window.location.assign(buildLocaleHref(baseUrl, nextLanguage));
    };

    return (
        <div className={cx(css(styles, 'root'), css(styles, 'lang'))} role="group" aria-label="Language selector">
            <button type="button" data-active={language === 'en' ? 'true' : 'false'} aria-pressed={language === 'en'} onClick={() => chooseLanguage('en')}>
                EN
            </button>
            <button type="button" data-active={language === 'de' ? 'true' : 'false'} aria-pressed={language === 'de'} onClick={() => chooseLanguage('de')}>
                DE
            </button>
        </div>
    );
}

function buildLocaleHref(baseUrl: string, language: Language): string {
    const url = new URL(window.location.href);
    const basePath = new URL(baseUrl, window.location.href).pathname;
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const pathname = url.pathname.startsWith(normalizedBase) ? url.pathname.slice(normalizedBase.length) : url.pathname.replace(/^\//, '');

    const segments = pathname.split('/').filter(Boolean);
    const restSegments = segments[0] === 'en' || segments[0] === 'de' ? segments.slice(1) : segments;
    const localizedPath = `${normalizedBase}${language}/${restSegments.join('/')}`;
    const withTrailingSlash = localizedPath.endsWith('/') ? localizedPath : `${localizedPath}/`;

    return `${url.origin}${withTrailingSlash}${url.search}${url.hash}`;
}
