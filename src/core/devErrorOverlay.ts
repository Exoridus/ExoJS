/**
 * Dev-mode DOM error banner. Renderer-independent by design: when rendering is
 * broken, an engine-drawn overlay may itself fail, so the banner is a plain DOM
 * element positioned over the canvas that takes only strings and never imports
 * (or recurses into) the renderer.
 *
 * The entire module body is `__DEV__`-gated so production builds tree-shake it.
 * @internal
 */

/** One banner element per canvas, so repeated errors update in place. */
const banners = new WeakMap<HTMLCanvasElement, HTMLDivElement>();
/** Live repeat counter per banner (how many times it has been shown/refreshed). */
const bannerCounts = new WeakMap<HTMLDivElement, number>();

const bannerBaseStyle = [
  'position: absolute',
  'top: 0',
  'left: 0',
  'right: 0',
  'max-height: 40%',
  'overflow-y: auto',
  'margin: 0',
  'padding: 8px 32px 8px 8px',
  'box-sizing: border-box',
  'background: rgba(120, 0, 0, 0.9)',
  'color: #fff',
  'font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  'white-space: pre-wrap',
  'word-break: break-word',
  'z-index: 9999',
  'pointer-events: auto',
].join('; ');

/**
 * Show (or update) the dev error banner over `canvas`. No-op in production
 * builds and when `document` is unavailable. Repeated calls for the same canvas
 * update the existing banner in place and increment a visible `×N` counter.
 * @internal
 */
export function showDevErrorOverlay(canvas: HTMLCanvasElement, message: string, options?: { fatal?: boolean }): void {
  if (!__DEV__ || typeof document === 'undefined') {
    return;
  }

  const fatal = options?.fatal === true;
  let banner = banners.get(canvas);

  if (banner === undefined) {
    banner = document.createElement('div');
    banner.setAttribute('data-exojs-error-overlay', '');
    banners.set(canvas, banner);
    bannerCounts.set(banner, 0);

    const host = canvas.parentElement;

    if (host !== null) {
      // The banner is absolutely positioned; ensure the host establishes a
      // containing block so `top/left/right: 0` pins it over the canvas.
      if (host.style.position === '' || host.style.position === 'static') {
        host.style.position = 'relative';
      }

      host.append(banner);
    } else {
      // No parent to anchor to: fall back to body + fixed positioning so the
      // banner is still visible (acceptable v1 behavior per the spec).
      banner.style.position = 'fixed';
      document.body.append(banner);
    }
  }

  const count = (bannerCounts.get(banner) ?? 0) + 1;

  bannerCounts.set(banner, count);

  banner.style.cssText = `${bannerBaseStyle}; border-bottom: ${fatal ? '3px solid #ff4d4d' : '1px solid rgba(255, 120, 120, 0.6)'};`;

  const headline = fatal ? `Rendering halted — ${message}` : message;
  const suffix = count > 1 ? `  ×${count}` : '';

  // Rebuild the banner content: bold first line, a dismiss button, and the
  // message body. textContent throughout — never innerHTML — so a driver log
  // can never inject markup.
  banner.replaceChildren();

  const dismiss = document.createElement('button');

  dismiss.type = 'button';
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.style.cssText = [
    'position: absolute',
    'top: 4px',
    'right: 4px',
    'width: 20px',
    'height: 20px',
    'padding: 0',
    'border: none',
    'border-radius: 3px',
    'background: rgba(0, 0, 0, 0.3)',
    'color: #fff',
    'font: 12px/1 monospace',
    'cursor: pointer',
  ].join('; ');
  dismiss.addEventListener('click', () => {
    hideDevErrorOverlay(canvas);
  });

  const firstLine = document.createElement('strong');

  firstLine.textContent = `${headline.split('\n', 1)[0] ?? ''}${suffix}`;

  const rest = headline.slice((headline.split('\n', 1)[0] ?? '').length);

  banner.append(dismiss, firstLine);

  if (rest.length > 0) {
    banner.append(document.createTextNode(rest));
  }
}

/**
 * Remove the banner for `canvas` if present. Idempotent — safe to call when no
 * banner exists. No-op in production builds and when `document` is unavailable.
 * @internal
 */
export function hideDevErrorOverlay(canvas: HTMLCanvasElement): void {
  if (!__DEV__ || typeof document === 'undefined') {
    return;
  }

  const banner = banners.get(canvas);

  if (banner !== undefined) {
    banner.remove();
    banners.delete(canvas);
    bannerCounts.delete(banner);
  }
}
