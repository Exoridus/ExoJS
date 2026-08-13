/** WebGPU pixel + draw-count coverage for Text atlas multi-texture batching. */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import type { FontWeight } from '#rendering/text/TextStyle';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuFrame } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

const width = 200;
const height = 96;
const cellWidth = 40;
const cellHeight = 48;
const weights: readonly FontWeight[] = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700'];

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const app = {
    canvas,
    options: { canvas: { width, height }, clearColor: Color.black },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const buildTexts = (count: number): { root: Container; texts: Text[] } => {
  const root = new Container();
  const texts = weights.slice(0, count).map((fontWeight, index) => {
    const text = new Text('M', { fontSize: 28, fontWeight, fillColor: Color.white });

    text.setPosition((index % 5) * cellWidth + 4, Math.floor(index / 5) * cellHeight + 4);
    root.addChild(text);

    return text;
  });

  return { root, texts };
};

const render = (backend: WebGpuBackend, root: Container): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

const cellHasInk = (frame: ArrayLike<number>, index: number): boolean => {
  const x0 = (index % 5) * cellWidth;
  const y0 = Math.floor(index / 5) * cellHeight;

  for (let y = y0; y < y0 + cellHeight; y++) {
    for (let x = x0; x < x0 + cellWidth; x++) {
      const offset = (y * width + x) * 4;

      if (frame[offset]! + frame[offset + 1]! + frame[offset + 2]! > 80) return true;
    }
  }

  return false;
};

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

describe('WebGPU Text atlas texture slots', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('four font atlases render in one draw with every glyph visible', async () => {
    const backend = await setupBackend();
    const scene = buildTexts(4);

    try {
      render(backend, scene.root);
      render(backend, scene.root);

      expect(backend.stats.drawCalls).toBe(1);

      const frame = readWebGpuFrame(backend, width);

      for (let index = 0; index < scene.texts.length; index++) {
        expect(cellHasInk(frame, index), `text cell ${index} has no glyph pixels`).toBe(true);
      }
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('nine compatible font atlases split only at the eight-slot limit', async () => {
    const backend = await setupBackend();
    const scene = buildTexts(9);

    try {
      render(backend, scene.root);
      render(backend, scene.root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('a four-atlas retained group records and replays one multi-texture batch', async () => {
    const backend = await setupBackend();
    const scene = buildTexts(4);
    const group = new RetainedContainer();

    scene.texts.forEach(text => group.addChild(text));
    scene.root.addChild(group);

    try {
      render(backend, scene.root);
      render(backend, scene.root);
      render(backend, scene.root);

      const fragment = (group as unknown as FragmentCarrier)._fragment;

      expect(fragment.instructions?.hasRecording).toBe(true);
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });
});
