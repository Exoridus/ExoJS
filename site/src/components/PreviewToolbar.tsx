import type { Ref } from 'react';

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
    layout: 'split' | 'stacked';
    selectedVersionId: string;
    showSidebarToggle: boolean;
    sidebarOpen: boolean;
    sidebarToggleRef: Ref<HTMLButtonElement>;
    zoom: number;
    onOpenTab(): void;
    onReload(): void;
    onToggleExpand(): void;
    onToggleLayout(): void;
    onToggleSidebar(): void;
}

export function PreviewToolbar({
    canvasHeight,
    canvasWidth,
    capabilities,
    disabled,
    exampleTitle,
    expanded,
    layout,
    selectedVersionId,
    showSidebarToggle,
    sidebarOpen,
    sidebarToggleRef,
    zoom,
    onOpenTab,
    onReload,
    onToggleExpand,
    onToggleLayout,
    onToggleSidebar,
}: PreviewToolbarProps): JSX.Element {
    const hasDimensions = canvasWidth > 0 && canvasHeight > 0;
    const zoomPercent = hasDimensions && Math.abs(zoom - 1) > 0.01 ? Math.round(zoom * 100) : null;

    return (
        <div className={css(styles, 'root')}>
            {showSidebarToggle && (
                <button
                    ref={sidebarToggleRef}
                    className={cx(css(styles, 'button'), css(styles, 'button--icon'))}
                    type="button"
                    title={sidebarOpen ? 'Hide example list' : 'Show example list'}
                    aria-label={sidebarOpen ? 'Hide example list' : 'Show example list'}
                    aria-expanded={sidebarOpen}
                    aria-controls="playground-navigation"
                    onClick={onToggleSidebar}
                >
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                        <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
            )}
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
                    className={cx(css(styles, 'button'), css(styles, 'button--ghost'), css(styles, 'button--layout'))}
                    type="button"
                    title={layout === 'split' ? 'Stack the preview above the editor' : 'Show editor and preview side by side'}
                    aria-label={layout === 'split' ? 'Switch to stacked layout' : 'Switch to split layout'}
                    onClick={onToggleLayout}
                >
                    {layout === 'split' ? 'Stack' : 'Split'}
                </button>
                {layout === 'stacked' && (
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
                )}
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
