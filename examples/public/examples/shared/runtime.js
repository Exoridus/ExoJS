export function getExampleMeta() {
    const meta = globalThis.__EXAMPLE_META__;

    return meta && typeof meta === 'object' ? meta : {};
}

export function supportsWebGpu() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function createInfoElement(maxWidth = '430px') {
    const element = document.createElement('aside');

    Object.assign(element.style, {
        position: 'fixed',
        top: '16px',
        left: '16px',
        maxWidth,
        padding: '14px 16px',
        borderRadius: '12px',
        background: 'rgba(8, 12, 20, 0.82)',
        border: '1px solid rgba(154, 193, 255, 0.26)',
        color: '#f3f7ff',
        fontFamily: '"Segoe UI", sans-serif',
        fontSize: '13px',
        lineHeight: '1.5',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
        zIndex: '1',
        pointerEvents: 'none',
        whiteSpace: 'normal',
    });

    return element;
}

export function showInfo(element, title, detail, isError = false) {
    if (!element.isConnected) {
        document.body.append(element);
    }

    const titleElement = document.createElement('strong');
    const detailElement = document.createElement('span');

    titleElement.textContent = title;
    detailElement.textContent = detail;

    Object.assign(titleElement.style, {
        display: 'block',
        marginBottom: '6px',
        fontSize: '14px',
        color: isError ? '#ffb4b4' : '#ffffff',
    });

    element.replaceChildren(titleElement, detailElement);
}

export function formatErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
