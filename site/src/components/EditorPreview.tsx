import {
    forwardRef,
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
    type SyntheticEvent,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';

import { assets } from '../lib/asset-catalog';
import type { Capability } from '../lib/examples-catalog';
import { detectRuntimeSupport, getMissingCapabilities } from '../lib/runtime-support';
import type { Example, PreviewErrorEntry, UrlParams } from '../lib/types';
import { buildIframeUrl } from '../lib/url-builder';
import styles from './EditorPreview.module.scss';
import { LoadingSpinner } from './LoadingSpinner';
import { css } from './react-utils';

const CAPABILITY_LABELS: Record<Capability, string> = {
    webgl2: 'WebGL2',
    webgpu: 'WebGPU',
    pointer: 'Pointer (mouse / pen)',
    keyboard: 'Keyboard',
    gamepad: 'Gamepad',
    touch: 'Touch',
    audio: 'Web Audio',
    fullscreen: 'Fullscreen API',
    vibration: 'Vibration API',
    offscreenCanvas: 'OffscreenCanvas',
    webWorkers: 'Web Workers',
};

const PREVIEW_SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'End', 'Home', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']);

export interface CanvasSizeEvent {
    height: number;
    width: number;
    zoom: number;
}

export interface EditorPreviewHandle {
    focusPreviewSurface(): void;
    openPreviewInTab(): void;
}

export interface EditorPreviewProps {
    exampleMeta: Example | null;
    selectedVersionId: string;
    sourceCode: string | null;
    onCanvasSize?(event: CanvasSizeEvent): void;
    onPreviewErrors?(errors: PreviewErrorEntry[]): void;
}

export const EditorPreview = forwardRef<EditorPreviewHandle, EditorPreviewProps>(function EditorPreview(
    { exampleMeta, onCanvasSize, onPreviewErrors, selectedVersionId, sourceCode },
    ref,
) {
    const [updateId, setUpdateId] = useState(0);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const sourceRef = useRef<string | null>(sourceCode);
    const exampleRef = useRef<Example | null>(exampleMeta);
    const versionRef = useRef(selectedVersionId);
    const canvasMutationObserverRef = useRef<MutationObserver | null>(null);
    const canvasAttributeObserverRef = useRef<MutationObserver | null>(null);
    const currentCanvasRef = useRef({ width: 0, height: 0, zoom: 1 });

    sourceRef.current = sourceCode;
    exampleRef.current = exampleMeta;
    versionRef.current = selectedVersionId;

    useEffect(() => {
        // Bump the iframe cache-buster to force a reload when the source changes.
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- reload preview on source change
        setUpdateId(value => value + 1);
        disconnectCanvasObservers(canvasMutationObserverRef, canvasAttributeObserverRef);
        currentCanvasRef.current = { width: 0, height: 0, zoom: 1 };
        rootRef.current?.style.removeProperty('--canvas-w');
        rootRef.current?.style.removeProperty('--canvas-h');
        rootRef.current?.style.removeProperty('--preview-zoom');
        onCanvasSize?.({ width: 0, height: 0, zoom: 1 });
    }, [onCanvasSize, sourceCode]);

    useEffect(() => {
        const recalculateZoom = (): void => {
            const { width, height } = currentCanvasRef.current;
            if (!width) return;
            const zoom = measureFillZoom(rootRef.current, width, height);
            currentCanvasRef.current = { width, height, zoom };
            rootRef.current?.style.setProperty('--preview-zoom', String(zoom));
            onCanvasSize?.({ width, height, zoom });
        };

        const preventScroll = (event: KeyboardEvent): void => {
            if (document.activeElement !== iframeRef.current) return;
            if (PREVIEW_SCROLL_KEYS.has(event.key)) {
                event.preventDefault();
            }
        };

        window.addEventListener('resize', recalculateZoom);
        window.addEventListener('keydown', preventScroll);
        return () => {
            window.removeEventListener('resize', recalculateZoom);
            window.removeEventListener('keydown', preventScroll);
            disconnectCanvasObservers(canvasMutationObserverRef, canvasAttributeObserverRef);
        };
    }, [onCanvasSize]);

    useImperativeHandle(
        ref,
        () => ({
            focusPreviewSurface(): void {
                focusPreviewSurface(iframeRef.current);
            },
            openPreviewInTab(): void {
                const source = sourceRef.current;
                if (!source) return;
                const storageKey = `exo-preview-source:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                window.sessionStorage.setItem(storageKey, source);
                const target = buildPreviewUrl({ noCache: Date.now(), sourceKey: storageKey }, versionRef.current);
                window.open(target, '_blank', 'noopener,noreferrer');
            },
        }),
        [],
    );

    const syncPreviewErrors = (errors: PreviewErrorEntry[]): void => {
        onPreviewErrors?.(errors.filter(error => Boolean(error.summary)));
    };

    const applyCanvasSize = (width: number, height: number): void => {
        if (!width || !height) return;
        const zoom = measureFillZoom(rootRef.current, width, height);
        currentCanvasRef.current = { width, height, zoom };
        rootRef.current?.style.setProperty('--canvas-w', `${width}px`);
        rootRef.current?.style.setProperty('--canvas-h', `${height}px`);
        rootRef.current?.style.setProperty('--preview-zoom', String(zoom));
        onCanvasSize?.({ width, height, zoom });
    };

    const observeCanvas = (canvas: HTMLCanvasElement): void => {
        applyCanvasSize(canvas.width, canvas.height);
        canvasAttributeObserverRef.current = new MutationObserver(() => {
            applyCanvasSize(canvas.width, canvas.height);
        });
        canvasAttributeObserverRef.current.observe(canvas, {
            attributes: true,
            attributeFilter: ['width', 'height'],
        });
    };

    const watchForCanvas = (iframeBody: HTMLBodyElement): void => {
        disconnectCanvasObservers(canvasMutationObserverRef, canvasAttributeObserverRef);

        // NB: a plain truthy check, NOT `instanceof HTMLCanvasElement`. The
        // canvas lives in the iframe's realm, so it is an instance of the
        // iframe's `HTMLCanvasElement`, not this document's — a cross-realm
        // `instanceof` is always false and silently broke canvas-size detection
        // (the whole --canvas-w/h/zoom sizing never ran). `querySelector('canvas')`
        // is already typed `HTMLCanvasElement | null`, so a null check narrows fine.
        const existing = iframeBody.querySelector('canvas');
        if (existing) {
            observeCanvas(existing);
            return;
        }

        canvasMutationObserverRef.current = new MutationObserver(() => {
            const canvas = iframeBody.querySelector('canvas');
            if (!canvas) return;
            canvasMutationObserverRef.current?.disconnect();
            canvasMutationObserverRef.current = null;
            observeCanvas(canvas);
        });
        canvasMutationObserverRef.current.observe(iframeBody, { childList: true, subtree: true });
    };

    const onLoadIframe = (event: SyntheticEvent<HTMLIFrameElement>): void => {
        const iframe = event.currentTarget;
        const iframeBody = (iframe.contentDocument ?? iframe.contentWindow?.document)?.body as HTMLBodyElement | null;
        const source = sourceRef.current;
        if (!iframeBody || !source) return;

        const iframeWindow = iframe.contentWindow;
        syncPreviewErrors([]);

        if (iframeWindow) {
            iframeWindow.__EXAMPLE_META__ = exampleRef.current;
            iframeWindow.assets = assets;
            installPreviewErrorHandlers(iframeWindow, iframeBody, syncPreviewErrors);
        }

        iframeBody.tabIndex = -1;
        void executePreviewSource(iframeBody, source, exampleRef.current, syncPreviewErrors);
        watchForCanvas(iframeBody);
        focusPreviewSurface(iframe);
    };

    if (!sourceCode) {
        return (
            <div ref={rootRef} className={css(styles, 'root')}>
                <LoadingSpinner centered />
            </div>
        );
    }

    return (
        <div ref={rootRef} className={css(styles, 'root')}>
            <iframe
                ref={iframeRef}
                className={css(styles, 'preview')}
                onLoad={onLoadIframe}
                onError={() => syncPreviewErrors([{ summary: 'The preview iframe failed to load.', details: 'The preview iframe failed to load.' }])}
                onPointerDown={() => focusPreviewSurface(iframeRef.current)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLIFrameElement>) => {
                    if (event.key === 'Enter') focusPreviewSurface(iframeRef.current);
                }}
                allow="autoplay"
                tabIndex={0}
                src={buildPreviewUrl({ noCache: updateId }, selectedVersionId)}
            />
        </div>
    );
});

// Scale the canvas to fill the available preview-panel width rather than
// sitting at native size with empty gutters. The iframe itself is a fixed
// 1280x720 stage that uniformly transform-scales its content (see
// public/preview.html), so scaling the outer container up is crop-free and
// keeps DOM overlays aligned — unlike engine-level `fill`, which would resize
// the backing store and crop fixed coordinates. We measure the surrounding
// `.preview-surface` (a layout-driven width, not the shrink-to-fit wrapper)
// and allow upscaling past 1, capping height at ~72vh so a small native canvas
// never overflows the viewport.
function measureFillZoom(root: HTMLElement | null, width: number, height: number): number {
    if (!width || !height) return 1;
    const surface = root?.closest<HTMLElement>('[data-preview-surface]');
    const availableWidth = surface?.clientWidth ?? window.innerWidth;
    const widthZoom = availableWidth / width;
    const heightZoom = (window.innerHeight * 0.72) / height;
    return Math.max(0.1, Math.min(widthZoom, heightZoom));
}

function buildPreviewUrl(options: { noCache: number; sourceKey?: string }, selectedVersionId: string): string {
    const params: UrlParams = { 'no-cache': options.noCache };
    if (selectedVersionId) params.v = selectedVersionId;
    if (options.sourceKey) params['source-key'] = options.sourceKey;
    return buildIframeUrl(params);
}

function focusPreviewSurface(iframe: HTMLIFrameElement | null): void {
    iframe?.focus();
    iframe?.contentWindow?.focus();
    iframe?.contentDocument?.body?.focus();
}

function installPreviewErrorHandlers(
    iframeWindow: Window,
    iframeBody: HTMLBodyElement,
    syncPreviewErrors: (errors: PreviewErrorEntry[]) => void,
): void {
    iframeWindow.__EXAMPLE_PREVIEW_ERROR_RENDERED__ = false;

    iframeWindow.onerror = (message, _source, _lineno, _colno, error) => {
        const previewError = createPreviewErrorEntry(error, message);
        if (isRecoverablePreviewError(previewError.summary)) {
            blankPreviewSurface(iframeBody);
            return true;
        }
        syncPreviewErrors([previewError]);
        renderExecutionError(iframeBody);
        return true;
    };

    iframeWindow.onunhandledrejection = (event: PromiseRejectionEvent) => {
        const previewError = createPreviewErrorEntry(event.reason);
        if (isRecoverablePreviewError(previewError.summary)) {
            event.preventDefault();
            blankPreviewSurface(iframeBody);
            return;
        }
        event.preventDefault();
        syncPreviewErrors([previewError]);
        renderExecutionError(iframeBody);
    };
}

async function executePreviewSource(
    iframeBody: HTMLBodyElement,
    sourceCode: string,
    exampleMeta: Example | null,
    _syncPreviewErrors: (errors: PreviewErrorEntry[]) => void,
): Promise<void> {
    const required = exampleMeta?.capabilities ?? [];
    if (required.length > 0) {
        let missing = getMissingCapabilities(required);
        if (missing === null) {
            await detectRuntimeSupport();
            missing = getMissingCapabilities(required);
        }
        if (missing && missing.length > 0) {
            renderCapabilityOverlay(iframeBody, required, missing);
            return;
        }
    }

    const script = iframeBody.ownerDocument.createElement('script');
    script.type = 'module';
    script.textContent = `${sourceCode}\n`;
    iframeBody.appendChild(script);
}

function disconnectCanvasObservers(
    canvasMutationObserver: RefObject<MutationObserver | null>,
    canvasAttributeObserver: RefObject<MutationObserver | null>,
): void {
    canvasMutationObserver.current?.disconnect();
    canvasMutationObserver.current = null;
    canvasAttributeObserver.current?.disconnect();
    canvasAttributeObserver.current = null;
}

function isRecoverablePreviewError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes('does not support webgl') ||
        normalized.includes('failed to create a webgl') ||
        normalized.includes('webgl is not supported') ||
        normalized.includes('requires browser webgpu support') ||
        normalized.includes('requires advanced webgpu support') ||
        normalized.includes('webgpu unavailable') ||
        normalized.includes('could not acquire a webgpu adapter') ||
        normalized.includes('webgpu setup failed')
    );
}

function blankPreviewSurface(iframeBody: HTMLBodyElement): void {
    const iframeWindow = iframeBody.ownerDocument.defaultView;
    if (iframeWindow?.__EXAMPLE_PREVIEW_ERROR_RENDERED__) return;
    if (iframeWindow) iframeWindow.__EXAMPLE_PREVIEW_ERROR_RENDERED__ = true;
    iframeBody.setAttribute('data-preview-blanked', '');
    iframeBody.replaceChildren();
    Object.assign(iframeBody.style, {
        display: 'block',
        background: '#0b0d12',
        color: '#f4f6fb',
        fontFamily: '"Segoe UI", sans-serif',
    });
}

function renderExecutionError(iframeBody: HTMLBodyElement): void {
    iframeBody.replaceChildren();
    Object.assign(iframeBody.style, {
        display: 'block',
        background: '#0b0d12',
        color: '#f4f6fb',
        fontFamily: '"Segoe UI", sans-serif',
    });
}

function createPreviewErrorEntry(error: unknown, fallbackMessage?: string | Event): PreviewErrorEntry {
    if (error instanceof Error) {
        return {
            summary: error.message,
            details: error.stack ?? error.message,
        };
    }

    if (typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
        return {
            summary: fallbackMessage,
            details: typeof error === 'string' && error.trim() ? error : fallbackMessage,
        };
    }

    const details = stringifyPreviewError(error);
    return {
        summary: details,
        details,
    };
}

function stringifyPreviewError(error: unknown): string {
    if (typeof error === 'string') return error;
    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') return String(error);
    if (error === null) return 'null';
    if (error === undefined) return 'Unknown preview error';

    try {
        const serialized = JSON.stringify(error);
        if (typeof serialized === 'string') return serialized;
    } catch {
        // Fall through to Object.prototype formatting.
    }

    return Object.prototype.toString.call(error);
}

function renderCapabilityOverlay(iframeBody: HTMLBodyElement, required: ReadonlyArray<Capability>, missing: ReadonlyArray<Capability>): void {
    const doc = iframeBody.ownerDocument;
    const iframeWindow = doc.defaultView;
    if (iframeWindow) iframeWindow.__EXAMPLE_PREVIEW_ERROR_RENDERED__ = true;

    iframeBody.setAttribute('data-preview-blanked', 'capabilities');
    iframeBody.replaceChildren();
    Object.assign(iframeBody.style, {
        margin: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0b0d12',
        color: '#f4f6fb',
        fontFamily: '"Segoe UI", sans-serif',
        padding: '2rem',
        boxSizing: 'border-box',
    });

    const overlay = doc.createElement('div');
    Object.assign(overlay.style, {
        maxWidth: '480px',
        border: '1px solid rgba(248, 113, 113, 0.45)',
        borderRadius: '12px',
        background: 'rgba(15, 23, 42, 0.85)',
        padding: '1.5rem 1.75rem',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
    });
    overlay.setAttribute('role', 'alert');

    const heading = doc.createElement('div');
    Object.assign(heading.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        marginBottom: '0.75rem',
        fontSize: '1.05rem',
        fontWeight: '600',
        color: '#fca5a5',
    });
    heading.textContent = 'Missing browser capabilities';
    overlay.appendChild(heading);

    const intro = doc.createElement('p');
    Object.assign(intro.style, { margin: '0 0 0.9rem', fontSize: '0.92rem', lineHeight: '1.5', color: '#cbd5e1' });
    intro.textContent = 'This example needs browser features that are not available in the current environment. Required capabilities:';
    overlay.appendChild(intro);

    const list = doc.createElement('ul');
    Object.assign(list.style, { margin: '0', padding: '0', listStyle: 'none', display: 'grid', gap: '0.4rem' });
    const missingSet = new Set(missing);
    for (const capability of required) {
        const item = doc.createElement('li');
        const isMissing = missingSet.has(capability);
        Object.assign(item.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.4rem 0.6rem',
            borderRadius: '6px',
            background: isMissing ? 'rgba(248, 113, 113, 0.15)' : 'rgba(34, 197, 94, 0.12)',
            color: isMissing ? '#fecaca' : '#bbf7d0',
            fontSize: '0.88rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        });
        const dot = doc.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = isMissing ? 'x' : 'ok';
        Object.assign(dot.style, { fontWeight: '700' });
        item.appendChild(dot);
        const text = doc.createElement('span');
        text.textContent = `${CAPABILITY_LABELS[capability]} (${capability})`;
        item.appendChild(text);
        list.appendChild(item);
    }
    overlay.appendChild(list);
    iframeBody.appendChild(overlay);
}
