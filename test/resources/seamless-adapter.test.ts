import { Sound } from '#audio/Sound';
import { logger, LogSeverity } from '#core/logging';
import { Texture } from '#rendering/texture/Texture';
import { soundSeamlessAdapter, textureSeamlessAdapter } from '#resources/seamless';

function bufferStub(duration = 2): AudioBuffer {
  return { duration } as AudioBuffer;
}

describe('textureSeamlessAdapter', () => {
  test("createPlaceholder returns an empty 'loading' texture", () => {
    const handle = textureSeamlessAdapter.createPlaceholder();

    expect(handle).toBeInstanceOf(Texture);
    expect(handle.loadState).toBe('loading');
    expect(textureSeamlessAdapter.stateOf(handle)).toBe('loading');
    expect(handle.width).toBe(0);
    expect(handle.height).toBe(0);
  });

  test('createPlaceholder applies the handle-OWN sampler options from samplerOptions', () => {
    const handle = textureSeamlessAdapter.createPlaceholder({ samplerOptions: { flipY: true, generateMipMap: false } });

    expect(handle.flipY).toBe(true);
    expect(handle.generateMipMap).toBe(false);
  });

  test('fill transplants ONLY the decoded source and settles ready — the handle keeps its own sampler', async () => {
    // Per-handle sampler: the placeholder carries flipY:false; fill must NOT copy
    // the donor's flipY:true (shared decode, independent samplers).
    const handle = textureSeamlessAdapter.createPlaceholder({ samplerOptions: { flipY: false, generateMipMap: true } });
    const versionBefore = handle.version;
    const canvas = document.createElement('canvas');

    canvas.width = 16;
    canvas.height = 16;

    const donor = new Texture(canvas, { flipY: true, generateMipMap: false });

    textureSeamlessAdapter.fill(handle, donor);

    expect(handle.loadState).toBe('ready');
    expect(handle.source).toBe(donor.source); // decoded source transplanted
    expect(handle.width).toBe(16);
    expect(handle.flipY).toBe(false); // kept its OWN sampler, not the donor's
    expect(handle.generateMipMap).toBe(true);
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

describe('soundSeamlessAdapter', () => {
  test('createPlaceholder yields a loading Sound with no buffer', () => {
    const handle = soundSeamlessAdapter.createPlaceholder();
    expect(handle).toBeInstanceOf(Sound);
    expect(handle.loadState).toBe('loading');
    expect(handle.audioBuffer).toBeNull();
  });

  test('fill transplants the donor buffer in place and settles ready', async () => {
    const handle = soundSeamlessAdapter.createPlaceholder();
    const donor = new Sound(bufferStub(3));
    soundSeamlessAdapter.fill(handle, donor);
    expect(handle.loadState).toBe('ready');
    expect(handle.duration).toBe(3);
    await expect(handle.loaded).resolves.toBe(handle);
  });

  test('fail settles failed and .loaded rejects', async () => {
    const handle = soundSeamlessAdapter.createPlaceholder();
    soundSeamlessAdapter.fail(handle, new Error('nope'));
    expect(handle.loadState).toBe('failed');
    await expect(handle.loaded).rejects.toThrow('nope');
  });

  test('evict drops the payload and re-arms for a heal', () => {
    const handle = soundSeamlessAdapter.createPlaceholder();
    soundSeamlessAdapter.fill(handle, new Sound(bufferStub(3)));
    soundSeamlessAdapter.evict(handle);
    expect(handle.audioBuffer).toBeNull();
    expect(handle.loadState).toBe('loading');
  });

  test('fill throws when the donor carries no decoded buffer', () => {
    const handle = soundSeamlessAdapter.createPlaceholder();
    expect(() => soundSeamlessAdapter.fill(handle, new Sound(null))).toThrow('no decoded buffer');
  });
});

describe('textureSeamlessAdapter.evict', () => {
  test('drops the real source and re-arms for a heal', () => {
    const handle = textureSeamlessAdapter.createPlaceholder();
    const canvas = document.createElement('canvas');

    canvas.width = 16;
    canvas.height = 16;

    const donor = new Texture(canvas);

    textureSeamlessAdapter.fill(handle, donor);

    // Precondition: a real payload is present after the fill.
    expect(handle.loadState).toBe('ready');
    expect(handle.source).toBe(canvas);
    expect(handle.width).toBe(16);
    expect(handle.height).toBe(16);

    textureSeamlessAdapter.evict(handle);

    // The drop must actually free the source and reset the size — these fail on a no-op evict.
    expect(handle.source).toBeNull();
    expect(handle.width).toBe(0);
    expect(handle.height).toBe(0);
    expect(handle.loadState).toBe('loading');
  });
});
