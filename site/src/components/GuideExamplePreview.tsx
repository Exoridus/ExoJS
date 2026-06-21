import { useEffect, useMemo, useState } from 'react';

import type { Capability } from '../lib/examples-catalog';
import type { Example } from '../lib/types';
import { configureUrlsFromLocation } from '../lib/url-builder';
import { EditorPreview } from './EditorPreview';
import styles from './GuideExamplePreview.module.scss';
import { css } from './react-utils';

const EMPTY_CAPABILITIES: Capability[] = [];

export interface GuideExamplePreviewProps {
    capabilities?: Capability[] | string;
    chapter: string;
    slug: string;
    sourceCode: string;
    title: string;
}

export function GuideExamplePreview({ capabilities = EMPTY_CAPABILITIES, chapter, slug, sourceCode, title }: GuideExamplePreviewProps): JSX.Element {
    const [started, setStarted] = useState(false);

    useEffect(() => {
        configureUrlsFromLocation();
    }, []);

    const parsedCapabilities = useMemo(() => parseCapabilities(capabilities), [capabilities]);
    const exampleMeta: Example = useMemo(
        () => ({
            slug,
            path: `${chapter}/${slug}.js`,
            title: title || slug,
            description: '',
            backend: 'core',
            section: chapter,
            tags: [],
            capabilities: parsedCapabilities,
        }),
        [chapter, parsedCapabilities, slug, title],
    );

    if (!started) {
        const previewTitle = title || slug;
        return (
            <div className={css(styles, 'root')}>
                <div className={css(styles, 'preview-gate')}>
                    <button type="button" className={css(styles, 'preview-play')} aria-label={`Play ${previewTitle} preview`} onClick={() => setStarted(true)}>
                        <span className={css(styles, 'preview-play__icon')} aria-hidden="true" />
                        <span>Play Preview</span>
                    </button>
                    <p className={css(styles, 'preview-hint')}>Preview is paused until you click Play.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={css(styles, 'root')}>
            <div className={css(styles, 'preview')}>
                <EditorPreview sourceCode={sourceCode} exampleMeta={exampleMeta} selectedVersionId="current" />
            </div>
        </div>
    );
}

function parseCapabilities(value: Capability[] | string): Capability[] {
    if (Array.isArray(value)) return value;
    try {
        const raw = JSON.parse(value) as unknown;
        return Array.isArray(raw) ? (raw as Capability[]) : [];
    } catch {
        return [];
    }
}
