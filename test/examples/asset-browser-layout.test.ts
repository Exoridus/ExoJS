import '../support/text-field-harness';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

import { choice, domDemoPanel, slider, toggle } from '../../examples/shared/runtime';

const source = readFileSync(resolve('examples/debug-layer/asset-browser.ts'), 'utf8');

const factory = (name: string, next: string, globals: Record<string, unknown> = {}) => {
  const body = source.slice(source.indexOf(`const ${name} =`), source.indexOf(`const ${next} =`));
  const compiled = ts.transpileModule(`${body}\n${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return runInNewContext(compiled, { ...Exo, ...globals });
};

it.each([128, 256])('relayouts atlas overlays for %i px frames without restarting animation or resetting settings', async frameWidth => {
  const area = { x: 272, width: 996, height: 796 };
  const image = document.createElement('canvas');
  image.width = 128 + frameWidth;
  image.height = 256;
  const texture = new Exo.Texture(image);
  const frame = (x: number, width = 128) => ({ frame: { x, y: 0, w: width, h: 128 } });
  const data = { frames: { first: frame(0), second: frame(128, frameWidth) } };
  const assets = { image: {}, atlas: {} };
  const open = factory('openSpritesheet', 'openMap', {
    assets,
    PREVIEW: area,
    checkerboard: () => new Exo.Graphics(),
    spritesheetSnippet: (_item: unknown, state: unknown) => JSON.stringify(state),
    choice: vi.fn(),
    slider: vi.fn(),
    toggle: vi.fn(),
  });
  const preview = await open({
    scene: {},
    item: { key: 'image', atlasKey: 'atlas' },
    scope: { load: (a: object) => Promise.resolve(a === assets.image ? texture : data) },
  });

  try {
    let change!: (key: string, value: unknown, state: object) => void;
    preview.mount((options: { onChange: typeof change }) => {
      change = options.onChange;

      return { status: vi.fn() };
    });
    change('fps', 20, { animation: 'Frame range', first: 0, last: 1, fps: 20, loop: true, scale: 6, bounds: true });
    preview.tap(180, 64);
    preview.update(Exo.Time.seconds(0.06));
    const animated = preview.overlay[2] as Exo.AnimatedSprite;
    const before = { snippet: preview.snippet(), frame: animated.currentFrame, selectedLabel: preview.overlay[3].text };
    area.width = 356;
    area.height = 376;
    expect(preview.resize).toBeTypeOf('function');
    preview.resize();
    expect(preview.snippet()).toBe(before.snippet);
    expect(animated.currentFrame).toBe(before.frame);
    expect(preview.overlay[3].text).toBe(before.selectedLabel);
    expect(preview.bounds).toEqual({ width: image.width, height: 256 });
    expect(preview.bottomInset).toBe(220);

    for (const node of preview.overlay) {
      const bounds = node.getBounds();
      expect(bounds.x).toBeGreaterThanOrEqual(area.x - 1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width + 1);
      expect(bounds.y).toBeGreaterThanOrEqual(area.height - 220 - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.height + 1);
    }

    animated.play('preview', { restart: true });
    preview.resize();
    preview.update(Exo.Time.seconds(0.06));
    expect(animated.getBounds().width).toBeLessThanOrEqual((area.width - 36) / 2 - 20);
  } finally {
    preview.dispose();
    texture.destroy();
  }
});

const videoFacts = async (media?: object) => {
  const open = factory('openVideo', 'measureContext', {
    assets: { video: {} },
    formatSeconds: String,
  });
  const preview = await open({
    scene: { app: { audio: {} } },
    item: { key: 'video' },
    scope: { load: () => Promise.resolve({ width: 128, height: 64, duration: 2, videoElement: { videoWidth: 128, videoHeight: 64 } }) },
    manifest: media === undefined ? undefined : { media },
  });

  return new Map(preview.facts);
};

it('does not report absent audio when optional metadata is unavailable', async () => {
  expect((await videoFacts()).has('Audio')).toBe(false);
  expect((await videoFacts({ video: {} })).has('Audio')).toBe(false);
  expect((await videoFacts({ audio: { codec: 'aac', channels: 2 } })).get('Audio')).toBe('aac, 2 ch');
});

it.each(['0/0', '30/0', '-1/1', '0/1', 'NaN/1', 'Infinity/1'])('omits invalid frame rate %s', async frameRate => {
  expect((await videoFacts({ video: { frameRate } })).has('Frame rate')).toBe(false);
});

it('reports valid rational frame rates without inventing unknown channel counts', async () => {
  const facts = await videoFacts({ video: { frameRate: '60000/1001' }, audio: { codec: 'opus' } });
  expect(facts.get('Frame rate')).toBe('59.94 fps');
  expect(facts.get('Audio')).toBe('opus');
});
it('fits atlas content entirely above its reserved frame strip', () => {
  const method = source.slice(source.indexOf('  fit(): void {'), source.indexOf('  setBackdrop('));
  const area = { x: 272, width: 356, height: 376 };
  const compiled = ts.transpileModule(`({ ${method} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { fit } = runInNewContext(compiled, { PREVIEW: area });
  let zoom = 0;
  let centerY = 0;
  fit.call({
    preview: { bounds: { width: 256, height: 256 }, bottomInset: 220 },
    view: {
      setZoom: (value: number) => {
        zoom = value;
      },
    },
    lookAt: (_x: number, y: number) => {
      centerY = y;
    },
    updateZoomReadout: vi.fn(),
  });
  const top = area.height / 2 - centerY * zoom;
  const bottom = top + 256 * zoom;
  expect(top).toBeGreaterThanOrEqual(0);
  expect(bottom).toBeLessThanOrEqual(area.height - 220);
});

it('reflows font samples at their new width while preserving the text, size, and colour', async () => {
  const area = { x: 272, width: 996, height: 796 };
  const open = factory('openFont', 'openData', {
    PREVIEW: area,
    assets: { font: { type: 'font' } },
    SAMPLE_TEXT: 'The quick brown fox jumps over the lazy dog',
    FONT: 'sans-serif',
    measureWidth: (text: string) => text.length * 20,
    fontSnippet: (_item: unknown, state: unknown) => JSON.stringify(state),
    slider: vi.fn(),
    choice: vi.fn(),
  });
  const preview = await open({ scene: {}, item: { key: 'font' }, scope: { load: () => Promise.resolve({ family: 'sans-serif' }) } });

  try {
    const before = preview.snippet();
    area.width = 356;
    expect(preview.resize).toBeTypeOf('function');
    preview.resize();
    expect(preview.snippet()).toBe(before);
    expect(preview.overlay).toHaveLength(3);

    for (const line of preview.overlay as Exo.Text[]) {
      expect(line.x).toBe(area.x + 32);
      expect(line.layout.maxWidth).toBe(area.width - 64);
    }
  } finally {
    preview.dispose();
  }
});

it.each([376, 796])('fits decoded stereo audio at %i px and relayouts without changing playback', async height => {
  const area = { x: 272, width: 596, height };
  const center = { x: 570, y: height / 2 };
  const samples = Float32Array.from({ length: 256 }, (_, index) => (index % 2 ? -1 : 1));
  const sound = { duration: 2, audioBuffer: { duration: 2, numberOfChannels: 2, getChannelData: () => samples } };
  const voice = { time: 0.8, ended: false, paused: false, stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), volume: 0.8 };
  const audio = { onUnlock: { add: (start: () => void) => start(), remove: vi.fn() }, play: vi.fn(() => voice), locked: false };
  const open = factory('openAudio', 'openVideo', {
    PREVIEW: area,
    PREVIEW_CENTER: center,
    MONO: 'sans-serif',
    assets: { sound: { type: 'sound' } },
    demoAssetCategories: { sound: 'sound' },
    AudioAnalyser: class {
      getWaveformFloat = () => samples;

      destroy() {}
    },
    formatSeconds: String,
    audioSnippet: (_item: unknown, state: unknown) => JSON.stringify(state),
    choice,
    slider,
    toggle,
  });
  const preview = await open({
    scene: { app: { audio } },
    item: { key: 'sound' },
    scope: { load: async () => sound },
    isCurrent: () => true,
  });
  let panel!: ReturnType<typeof domDemoPanel>;

  try {
    preview.mount((options: Parameters<typeof domDemoPanel>[0]) => (panel = domDemoPanel(options)));
    [...panel.element.querySelectorAll('button')].find(button => button.textContent === 'Play')!.click();
    panel.set('volume', 0.4);
    panel.set('position', 40);
    const snippet = preview.snippet();

    for (const nextHeight of [height, 376, 796]) {
      if (area.height !== nextHeight) {
        area.height = nextHeight;
        center.y = nextHeight / 2;
        preview.resize();
      }

      preview.update();
      expect(preview.snippet()).toBe(snippet);
      expect(voice.time).toBe(0.8);
      expect(voice.volume).toBe(0.4);

      for (const node of preview.overlay as Exo.RenderNode[]) {
        const bounds = node.getBounds();

        if (bounds.width > 0 && bounds.height > 0) {
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(nextHeight);
        }
      }
    }

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
  } finally {
    preview.dispose();
    panel?.dispose();
  }
});

it('keeps navigation focus across pending and repeated selections without taking focus from other controls', async () => {
  const items = ['first', 'second', 'third'].map(key => ({ id: key, key, name: key, group: 'Textures' }));
  const pending: Array<(preview: object) => void> = [];
  const body = source.slice(source.indexOf('class AssetBrowserScene'), source.indexOf('const chipStyle'));
  const compiled = ts.transpileModule(`${body}\nnew AssetBrowserScene();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scene = runInNewContext(compiled, {
    ...Exo,
    Scene: class {},
    document,
    window,
    performance,
    console,
    STAGE: { width: 1200, height: 480 },
    PREVIEW: { x: 272, width: 596, height: 376 },
    PREVIEW_CENTER: { x: 570, y: 188 },
    SIDEBAR_WIDTH: 272,
    INSPECTOR_WIDTH: 332,
    FONT: 'sans-serif',
    MONO: 'sans-serif',
    GROUPS: ['Textures'],
    ITEMS: items,
    assets: Object.fromEntries(items.map(item => [item.key, { source: item.key }])),
    fileName: String,
    chipStyle: () => ({}),
    demoPanel: domDemoPanel,
    unitsPerCssPixel: () => 1,
    isAbort: () => false,
    openPreview: () => new Promise(resolve => pending.push(resolve)),
  });
  const preview = () => ({ bounds: null, facts: [], dispose: vi.fn(), mount: (host: typeof domDemoPanel) => host({ controls: {} }) });
  scene.app = { canvas: document.createElement('canvas'), loader: { inspect: () => [] } };
  scene.loader = { createScope: () => ({ destroy() {} }) };
  scene.selected = items[0];
  scene.mountTransport();
  scene.mountPanel(preview());
  const search = document.createElement('input');
  document.body.append(search);
  const navigation = (label: string) =>
    [...scene.transport.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent === label) as HTMLButtonElement;

  try {
    const next = navigation('Next');
    next.focus();
    next.click();
    expect(scene.selected).toBe(items[1]);
    expect(document.activeElement).toBe(next);
    pending.shift()!(preview());
    await Promise.resolve();
    expect(document.activeElement).toBe(navigation('Next'));
    navigation('Next').click();
    expect(scene.selected).toBe(items[2]);
    navigation('Previous').focus();
    navigation('Previous').click();
    expect(scene.selected).toBe(items[1]);
    search.focus();
    pending.shift()!(preview());
    pending.shift()!(preview());
    await Promise.resolve();
    expect(document.activeElement).toBe(search);
  } finally {
    scene.closePreview();
    scene.message.destroy();
    scene.frame.destroy();
    scene.view.destroy();
    scene.transport.remove();
    scene.codePanel.remove();
    search.remove();
  }
});
