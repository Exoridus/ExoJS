/**
 * Render-fail surface (S3 diagnostics, minimal slice) — contract 9:
 *
 *  9. Banner: showDevErrorOverlay creates one element per canvas, updates in
 *     place (×2), dismiss removes it, hideDevErrorOverlay is idempotent.
 */

import { hideDevErrorOverlay, showDevErrorOverlay } from '#core/devErrorOverlay';

function overlayFor(canvas: HTMLCanvasElement): HTMLElement | null {
  const host = canvas.parentElement ?? document.body;

  return host.querySelector('[data-exojs-error-overlay]');
}

function overlayCount(): number {
  return document.querySelectorAll('[data-exojs-error-overlay]').length;
}

describe('devErrorOverlay (contract 9)', () => {
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    host = document.createElement('div');
    canvas = document.createElement('canvas');
    host.append(canvas);
    document.body.append(host);
  });

  afterEach(() => {
    hideDevErrorOverlay(canvas);
    host.remove();
    document.body.querySelectorAll('[data-exojs-error-overlay]').forEach(el => {
      el.remove();
    });
  });

  test('creates one element per canvas', () => {
    showDevErrorOverlay(canvas, 'shader failed to compile');

    expect(overlayCount()).toBe(1);
    expect(overlayFor(canvas)?.textContent).toContain('shader failed to compile');
  });

  test('repeated calls update in place and show a ×N counter', () => {
    showDevErrorOverlay(canvas, 'same failure');
    showDevErrorOverlay(canvas, 'same failure');

    expect(overlayCount()).toBe(1);
    expect(overlayFor(canvas)?.textContent).toContain('×2');

    showDevErrorOverlay(canvas, 'same failure');
    expect(overlayFor(canvas)?.textContent).toContain('×3');
  });

  test('two canvases get independent banners', () => {
    const otherHost = document.createElement('div');
    const otherCanvas = document.createElement('canvas');

    otherHost.append(otherCanvas);
    document.body.append(otherHost);

    try {
      showDevErrorOverlay(canvas, 'error A');
      showDevErrorOverlay(otherCanvas, 'error B');

      expect(overlayCount()).toBe(2);
      expect(overlayFor(canvas)?.textContent).toContain('error A');
      expect(overlayFor(otherCanvas)?.textContent).toContain('error B');
    } finally {
      hideDevErrorOverlay(otherCanvas);
      otherHost.remove();
    }
  });

  test('fatal option prepends "Rendering halted —"', () => {
    showDevErrorOverlay(canvas, 'persistent failure', { fatal: true });

    expect(overlayFor(canvas)?.textContent).toContain('Rendering halted —');
  });

  test('the dismiss button removes the banner; a subsequent error re-shows it', () => {
    showDevErrorOverlay(canvas, 'boom');

    const dismiss = overlayFor(canvas)?.querySelector('button');

    expect(dismiss).not.toBeNull();

    dismiss!.click();

    expect(overlayCount()).toBe(0);

    showDevErrorOverlay(canvas, 'boom again');
    expect(overlayCount()).toBe(1);
    expect(overlayFor(canvas)?.textContent).toContain('boom again');
  });

  test('hideDevErrorOverlay removes the banner and is idempotent', () => {
    showDevErrorOverlay(canvas, 'boom');

    hideDevErrorOverlay(canvas);
    expect(overlayCount()).toBe(0);

    expect(() => {
      hideDevErrorOverlay(canvas);
    }).not.toThrow();
    expect(overlayCount()).toBe(0);
  });

  test('a canvas without a parent falls back to document.body', () => {
    const orphan = document.createElement('canvas');

    try {
      showDevErrorOverlay(orphan, 'orphan error');

      expect(document.body.querySelectorAll('[data-exojs-error-overlay]').length).toBe(1);
    } finally {
      hideDevErrorOverlay(orphan);
    }
  });

  test('driver logs render as text, never as markup', () => {
    showDevErrorOverlay(canvas, 'error <img src=x onerror=alert(1)>');

    expect(overlayFor(canvas)?.querySelector('img')).toBeNull();
    expect(overlayFor(canvas)?.textContent).toContain('<img');
  });
});
