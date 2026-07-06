import { logger, LogSeverity } from '#core/logging';
import { Texture } from '#rendering/texture/Texture';
import { textureSeamlessAdapter } from '#resources/seamless';

describe('textureSeamlessAdapter', () => {
  test("createPlaceholder returns an empty 'loading' texture", () => {
    const handle = textureSeamlessAdapter.createPlaceholder();

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(textureSeamlessAdapter.stateOf(handle)).toBe('loading');
    expect(handle.width).toBe(0);
    expect(handle.height).toBe(0);
  });

  test('fill transplants source and sampler state in place and settles ready', async () => {
    const handle = textureSeamlessAdapter.createPlaceholder();
    const versionBefore = handle.version;
    const canvas = document.createElement('canvas');

    canvas.width = 16;
    canvas.height = 16;

    const donor = new Texture(canvas, { flipY: true, generateMipMap: false });

    textureSeamlessAdapter.fill(handle, donor);

    expect(handle.loadState).toBe('ready');
    expect(handle.source).toBe(donor.source);
    expect(handle.width).toBe(16);
    expect(handle.flipY).toBe(true);
    expect(handle.generateMipMap).toBe(false);
    expect(handle.version).toBeGreaterThan(versionBefore);
    await expect(handle.loaded).resolves.toBe(handle);
  });

  test('fail shows the missing checker and rejects loaded', async () => {
    const handle = textureSeamlessAdapter.createPlaceholder();

    textureSeamlessAdapter.fail(handle, new Error('404'));

    expect(handle.loadState).toBe('failed');
    expect(handle.source).toBe(Texture.missing.source);
    expect(handle.width).toBe(8);
    await expect(handle.loaded).rejects.toThrow('404');
  });

  test("begin re-arms a failed handle to 'loading' with a fresh loaded promise", async () => {
    const handle = textureSeamlessAdapter.createPlaceholder();

    textureSeamlessAdapter.fail(handle, new Error('404'));
    const rejected = handle.loaded;

    await expect(rejected).rejects.toThrow('404');

    textureSeamlessAdapter.begin(handle);

    expect(handle.loadState).toBe('loading');
    expect(handle.loaded).not.toBe(rejected);
  });

  test('createPlaceholder pre-sizes from options and stays loading', () => {
    const handle = textureSeamlessAdapter.createPlaceholder({ width: 64, height: 32 });

    expect(handle.width).toBe(64);
    expect(handle.height).toBe(32);
    expect(handle.loadState).toBe('loading');
  });

  test('fill warns once when the payload size mismatches the pre-size', () => {
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      const handle = textureSeamlessAdapter.createPlaceholder({ width: 64, height: 64 });
      const canvas = document.createElement('canvas');

      canvas.width = 16;
      canvas.height = 16;
      textureSeamlessAdapter.fill(handle, new Texture(canvas));

      expect(handle.width).toBe(16);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('pre-size');
    } finally {
      removeSink();
    }
  });

  test('fill does not warn without a pre-size, and fail consumes the pre-size (no warn on heal)', () => {
    const warnings: string[] = [];
    const removeSink = logger.addSink(entry => {
      if (entry.severity === LogSeverity.Warning) warnings.push(entry.message);
    });

    try {
      const plain = textureSeamlessAdapter.createPlaceholder();
      const canvas = document.createElement('canvas');

      canvas.width = 16;
      canvas.height = 16;
      textureSeamlessAdapter.fill(plain, new Texture(canvas));
      expect(warnings).toHaveLength(0);

      const presized = textureSeamlessAdapter.createPlaceholder({ width: 64, height: 64 });

      textureSeamlessAdapter.fail(presized, new Error('404'));
      textureSeamlessAdapter.begin(presized);
      textureSeamlessAdapter.fill(presized, new Texture(canvas));
      expect(warnings).toHaveLength(0); // pre-size was consumed by fail — healing is not a mismatch
    } finally {
      removeSink();
    }
  });
});
