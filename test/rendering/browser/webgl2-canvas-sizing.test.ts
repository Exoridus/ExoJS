/**
 * Canvas sizing against a real layout engine and a real `ResizeObserver`.
 *
 * The unit suite drives the policies through a stubbed observer and hand-set
 * `clientWidth`/`clientHeight`, which proves the arithmetic but not that a host
 * resize actually reaches a policy, nor that the CSS box a policy writes is the
 * box the browser lays out. Both need a browser, so the acceptance matrix is
 * measured here: one application per policy, walked across a series of host
 * sizes.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Application } from '#core/Application';
import type { CanvasSizing } from '#core/sizing/CanvasSizing';
import { CappedResolutionCanvasSizing } from '#core/sizing/CappedResolutionCanvasSizing';
import { FixedResolutionCanvasSizing } from '#core/sizing/FixedResolutionCanvasSizing';
import { ManualCanvasSizing } from '#core/sizing/ManualCanvasSizing';
import { ResponsiveCanvasSizing } from '#core/sizing/ResponsiveCanvasSizing';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/** A host element of an exact CSS size, with a canvas inside it. */
const createHost = (width: number, height: number): { host: HTMLDivElement; canvas: HTMLCanvasElement } => {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');

  host.style.cssText = `position: absolute; left: -10000px; top: 0; width: ${width}px; height: ${height}px;`;
  host.append(canvas);
  document.body.append(host);

  return { host, canvas };
};

/**
 * Wait for a host resize to have been observed and committed. A `ResizeObserver`
 * callback runs after layout and before paint, so the frame after the one that
 * saw the change has the committed geometry.
 */
const settle = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
};

const cssBox = (canvas: HTMLCanvasElement): { width: number; height: number } => {
  const rect = canvas.getBoundingClientRect();

  return { width: rect.width, height: rect.height };
};

interface SizingCase {
  readonly host: readonly [number, number];
  readonly css: readonly [number, number];
  readonly backing: readonly [number, number];
  readonly logical: readonly [number, number];
}

/**
 * Drive one policy across every host size in `cases` and check all three axes
 * after each step. One application for the whole walk, so the observer is
 * exercised rather than re-created per case - and so the suite holds one WebGL
 * context per policy rather than one per row.
 */
const walkHostSizes = async (sizing: CanvasSizing, pixelRatio: number, cases: readonly SizingCase[]): Promise<void> => {
  const first = cases[0]!;
  const { host, canvas } = createHost(first.host[0], first.host[1]);
  const app = new Application({
    hello: false,
    backend: { type: 'webgl2' },
    canvas: { element: canvas, width: BASE_WIDTH, height: BASE_HEIGHT, pixelRatio, sizing },
  });

  try {
    for (const step of cases) {
      host.style.width = `${step.host[0]}px`;
      host.style.height = `${step.host[1]}px`;
      await settle();

      const box = cssBox(canvas);
      const label = `host ${step.host[0]}x${step.host[1]}`;

      expect.soft(box.width, `${label}: css width`).toBeCloseTo(step.css[0], 1);
      expect.soft(box.height, `${label}: css height`).toBeCloseTo(step.css[1], 1);
      expect.soft(app.canvas.width, `${label}: backing width`).toBe(step.backing[0]);
      expect.soft(app.canvas.height, `${label}: backing height`).toBe(step.backing[1]);
      expect.soft(app.width, `${label}: logical width`).toBeCloseTo(step.logical[0], 1);
      expect.soft(app.height, `${label}: logical height`).toBeCloseTo(step.logical[1], 1);
    }
  } finally {
    await app.destroy();
    host.remove();
  }
};

describe('FixedResolutionCanvasSizing against a real host', () => {
  test('fits the CSS box to the host and never moves the resolution', async () => {
    await walkHostSizes(new FixedResolutionCanvasSizing(), 2, [
      { host: [1920, 1080], css: [1920, 1080], backing: [2560, 1440], logical: [1280, 720] },
      { host: [960, 768], css: [960, 540], backing: [2560, 1440], logical: [1280, 720] },
      { host: [1024, 768], css: [1024, 576], backing: [2560, 1440], logical: [1280, 720] },
      { host: [440, 956], css: [440, 247.5], backing: [2560, 1440], logical: [1280, 720] },
      { host: [2560, 1080], css: [1920, 1080], backing: [2560, 1440], logical: [1280, 720] },
    ]);
  });
});

describe('CappedResolutionCanvasSizing against a real host', () => {
  test('follows the host down and stops at the base resolution going up', async () => {
    await walkHostSizes(new CappedResolutionCanvasSizing(), 2, [
      { host: [1920, 1080], css: [1920, 1080], backing: [2560, 1440], logical: [1280, 720] },
      { host: [960, 768], css: [960, 540], backing: [1920, 1080], logical: [1280, 720] },
      { host: [1024, 768], css: [1024, 576], backing: [2048, 1152], logical: [1280, 720] },
      { host: [440, 956], css: [440, 247.5], backing: [880, 495], logical: [1280, 720] },
      { host: [2560, 1080], css: [1920, 1080], backing: [2560, 1440], logical: [1280, 720] },
    ]);
  });
});

describe('ResponsiveCanvasSizing against a real host', () => {
  test('takes the whole host and opens up the axis it has spare', async () => {
    await walkHostSizes(new ResponsiveCanvasSizing(), 1, [
      { host: [1920, 1080], css: [1920, 1080], backing: [1920, 1080], logical: [1280, 720] },
      { host: [960, 768], css: [960, 768], backing: [960, 768], logical: [1280, 1024] },
      { host: [1024, 768], css: [1024, 768], backing: [1024, 768], logical: [1280, 960] },
      { host: [440, 956], css: [440, 956], backing: [440, 956], logical: [1280, 2781.1] },
      { host: [2560, 1080], css: [2560, 1080], backing: [2560, 1080], logical: [1706.7, 720] },
    ]);
  });

  test('scales the backing store with the pixel ratio, not the logical view', async () => {
    await walkHostSizes(new ResponsiveCanvasSizing(), 2, [
      { host: [1920, 1080], css: [1920, 1080], backing: [3840, 2160], logical: [1280, 720] },
      { host: [1024, 768], css: [1024, 768], backing: [2048, 1536], logical: [1280, 960] },
    ]);
  });

  test('crops horizontally down to minAspect and only then grows vertically', async () => {
    await walkHostSizes(new ResponsiveCanvasSizing({ minAspect: 1 }), 1, [
      // 16:9, 3:2 and 4:3 all sit above minAspect: the base height holds and
      // the view narrows with the host.
      { host: [1280, 720], css: [1280, 720], backing: [1280, 720], logical: [1280, 720] },
      { host: [1080, 720], css: [1080, 720], backing: [1080, 720], logical: [1080, 720] },
      { host: [960, 720], css: [960, 720], backing: [960, 720], logical: [960, 720] },
      // Exactly minAspect - the square view, and the boundary both branches meet at.
      { host: [720, 720], css: [720, 720], backing: [720, 720], logical: [720, 720] },
      // Just above and just below it: the view moves continuously across.
      { host: [721, 720], css: [721, 720], backing: [721, 720], logical: [721, 720] },
      { host: [719, 720], css: [719, 720], backing: [719, 720], logical: [720, 721] },
      { host: [440, 956], css: [440, 956], backing: [440, 956], logical: [720, 1564.4] },
    ]);
  });
});

describe('sizing policies and the host element', () => {
  test('a policy never writes to the host, whatever shape it ends up with', async () => {
    const { host, canvas } = createHost(1024, 768);

    host.style.background = 'rgb(255, 0, 0)';

    const app = new Application({
      hello: false,
      backend: { type: 'webgl2' },
      canvas: { element: canvas, width: BASE_WIDTH, height: BASE_HEIGHT, pixelRatio: 1, sizing: new FixedResolutionCanvasSizing() },
    });

    try {
      await settle();

      // A 16:9 canvas in a 4:3 host leaves 192px of unused height, and how that
      // area looks is the page's decision, not the engine's.
      expect(cssBox(canvas).height).toBeCloseTo(576, 1);
      expect(host.style.display).toBe('');
      expect(host.style.alignItems).toBe('');
      expect(host.style.justifyContent).toBe('');
      expect(host.style.overflow).toBe('');
      expect(host.style.background).toBe('rgb(255, 0, 0)');
    } finally {
      await app.destroy();
      host.remove();
    }
  });

  test('destroy() stops the policy following the host', async () => {
    const { host, canvas } = createHost(1024, 768);
    const app = new Application({
      hello: false,
      backend: { type: 'webgl2' },
      canvas: { element: canvas, width: BASE_WIDTH, height: BASE_HEIGHT, pixelRatio: 1, sizing: new CappedResolutionCanvasSizing() },
    });

    await settle();

    const backingBefore = app.canvas.width;
    const cssBefore = canvas.style.width;

    await app.destroy();

    host.style.width = '400px';
    await settle();

    try {
      // The observation stops, and the canvas keeps the geometry it was last
      // given - it is showing a frozen last frame, and collapsing its box out
      // from under that would be a visible artefact.
      expect(app.canvas.width).toBe(backingBefore);
      expect(canvas.style.width).toBe(cssBefore);
    } finally {
      host.remove();
    }
  });

  test('a manually sized canvas keeps the CSS box the page gave it', async () => {
    const { host, canvas } = createHost(1024, 768);

    canvas.style.width = '300px';
    canvas.style.height = '200px';

    const app = new Application({
      hello: false,
      backend: { type: 'webgl2' },
      canvas: { element: canvas, width: BASE_WIDTH, height: BASE_HEIGHT, pixelRatio: 1, sizing: new ManualCanvasSizing() },
    });

    try {
      host.style.width = '400px';
      await settle();

      expect(cssBox(canvas).width).toBeCloseTo(300, 1);
      expect(app.canvas.width).toBe(BASE_WIDTH);

      app.resize(640, 360);

      expect(app.canvas.width).toBe(640);
      expect(cssBox(canvas).width).toBeCloseTo(300, 1);
    } finally {
      await app.destroy();
      host.remove();
    }
  });
});

describe('pointer mapping follows the logical view', () => {
  /** The design-space point a client coordinate maps to, through the live surface metrics. */
  const designPointAt = (app: Application, clientX: number, clientY: number): { x: number; y: number } => {
    const rect = app.platform.getSurfaceMetrics();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;

    return app._backingStoreToLogical(u * rect.backingWidth, v * rect.backingHeight);
  };

  test('a click at the canvas edge reads the logical size under every policy', async () => {
    for (const sizing of [new FixedResolutionCanvasSizing(), new CappedResolutionCanvasSizing(), new ResponsiveCanvasSizing()]) {
      const { host, canvas } = createHost(960, 768);
      const app = new Application({
        hello: false,
        backend: { type: 'webgl2' },
        canvas: { element: canvas, width: BASE_WIDTH, height: BASE_HEIGHT, pixelRatio: 2, sizing },
      });

      try {
        await settle();

        const rect = canvas.getBoundingClientRect();
        const centre = designPointAt(app, rect.left + rect.width / 2, rect.top + rect.height / 2);
        const corner = designPointAt(app, rect.right, rect.bottom);
        const label = sizing.constructor.name;

        expect.soft(centre.x, `${label}: centre x`).toBeCloseTo(app.width / 2, 1);
        expect.soft(centre.y, `${label}: centre y`).toBeCloseTo(app.height / 2, 1);
        expect.soft(corner.x, `${label}: corner x`).toBeCloseTo(app.width, 1);
        expect.soft(corner.y, `${label}: corner y`).toBeCloseTo(app.height, 1);
      } finally {
        await app.destroy();
        host.remove();
      }
    }
  });
});
