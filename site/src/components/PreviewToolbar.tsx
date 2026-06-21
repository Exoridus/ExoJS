import type { Capability } from '../lib/examples-catalog';
import styles from './PreviewToolbar.module.scss';
import { css, cx } from './react-utils';

export interface PreviewToolbarProps {
    canvasHeight: number;
    canvasWidth: number;
    capabilities: Capability[];
    disabled: boolean;
    exampleTitle: string;
    expanded: boolean;
    selectedVersionId: string;
    zoom: number;
    onOpenTab(): void;
    onReload(): void;
    onToggleExpand(): void;
}

export function PreviewToolbar({
    canvasHeight,
    canvasWidth,
    capabilities,
    disabled,
    exampleTitle,
    expanded,
    selectedVersionId,
    zoom,
    onOpenTab,
    onReload,
    onToggleExpand,
}: PreviewToolbarProps): JSX.Element {
    const hasDimensions = canvasWidth > 0 && canvasHeight > 0;
    const zoomPercent = hasDimensions && Math.abs(zoom - 1) > 0.01 ? Math.round(zoom * 100) : null;

    return (
        <div className={css(styles, 'root')}>
            <div className={css(styles, 'meta')}>
                {exampleTitle && (
                    <span className={css(styles, 'title')} title={exampleTitle}>
                        {exampleTitle}
                    </span>
                )}
                {hasDimensions && <span className={css(styles, 'dot-sep')} aria-hidden="true">.</span>}
                {hasDimensions && (
                    <span className={css(styles, 'dimensions')} title="Preview canvas size">
                        {canvasWidth}x{canvasHeight}
                        {zoomPercent !== null ? ` - ${zoomPercent}%` : ''}
                    </span>
                )}
                {selectedVersionId && (
                    <>
                        <span className={css(styles, 'dot-sep')} aria-hidden="true">.</span>
                        <span className={css(styles, 'version')}>exojs@{selectedVersionId}</span>
                    </>
                )}
                {capabilities.slice(0, 2).map(capability => (
                    <span key={capability} className={css(styles, 'cap')}>
                        {capability}
                    </span>
                ))}
            </div>
            <div className={css(styles, 'actions')}>
                <button
                    className={cx(css(styles, 'button'), css(styles, 'button--ghost'))}
                    type="button"
                    title={expanded ? 'Collapse preview' : 'Expand preview to fill the screen'}
                    aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
                    disabled={disabled}
                    onClick={onToggleExpand}
                >
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                    className={cx(css(styles, 'button'), css(styles, 'button--ghost'))}
                    type="button"
                    title="Open preview in a new tab"
                    aria-label="Open in new tab"
                    disabled={disabled}
                    onClick={onOpenTab}
                >
                    Open
                </button>
                <button
                    className={cx(css(styles, 'button'), css(styles, 'button--primary'))}
                    type="button"
                    title="Reload preview (Ctrl+Enter)"
                    aria-label="Reload preview"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    disabled={disabled}
                    onClick={onReload}
                >
                    Reload
                </button>
            </div>
        </div>
    );
}
