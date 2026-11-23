import { CanvasFrameSource } from '#rendering/texture/CanvasFrameSource';
import type { FrameSource } from '#rendering/texture/FrameSource';
import { FrameTexture } from '#rendering/texture/FrameTexture';
import { VideoFrameSource } from '#rendering/texture/VideoFrameSource';
import { VideoTexture } from '#rendering/video/VideoTexture';

const createVideo = (options: { width?: number; height?: number; frameCallback?: boolean } = {}) => {
  const element = document.createElement('video');
  let width = options.width ?? 0;
  let height = options.height ?? 0;
  let time = 0;
  const handles: Array<(now: number, metadata: unknown) => void> = [];
  const request = vi.fn((callback: (now: number, metadata: unknown) => void) => {
    handles.push(callback);

    return handles.length;
  });
  const cancel = vi.fn();

  Object.defineProperty(element, 'videoWidth', { configurable: true, get: () => width });
  Object.defineProperty(element, 'videoHeight', { configurable: true, get: () => height });
  Object.defineProperty(element, 'readyState', { configurable: true, get: () => (width > 0 ? 4 : 0) });
  Object.defineProperty(element, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    },
  });

  if (options.frameCallback === true) {
    Object.assign(element, { requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel });
  }

  return {
    element,
    request,
    cancel,
    present: (): void => handles.at(-1)?.(0, {}),
    resize: (w: number, h: number): void => {
      width = w;
      height = h;
      element.dispatchEvent(new Event('resize'));
    },
  };
};

class ManualSource implements FrameSource {
  public width = 4;
  public height = 4;
  public image = document.createElement('canvas');
  public revision = 0;
  public destroyed = false;

  public destroy(): void {
    this.destroyed = true;
  }
}

describe('FrameTexture', () => {
  test('reading the version uploads a new revision once and an unchanged one never', () => {
    const source = new ManualSource();
    const texture = new FrameTexture(source);
    const first = texture.version;

    expect(texture.version).toBe(first);
    expect(texture.version).toBe(first);

    source.revision++;
    const second = texture.version;

    expect(second).toBeGreaterThan(first);
    expect(texture.version).toBe(second);
    texture.destroy();
  });

  test('a size change resizes the texture', () => {
    const source = new ManualSource();
    const texture = new FrameTexture(source);

    source.image.width = 16;
    source.image.height = 8;
    source.revision++;
    void texture.version;

    expect(texture.width).toBe(16);
    expect(texture.height).toBe(8);
    texture.destroy();
  });

  test('a destroyed texture no longer syncs, and destroys only a source it owns', () => {
    const shared = new ManualSource();
    const owned = new ManualSource();
    const borrowing = new FrameTexture(shared);
    const owning = new FrameTexture(owned, { ownsSource: true });

    borrowing.destroy();
    owning.destroy();
    shared.revision++;

    expect(() => borrowing.version).not.toThrow();
    expect(shared.destroyed).toBe(false);
    expect(owned.destroyed).toBe(true);
  });
});

describe('VideoFrameSource', () => {
  test('presented-frame callbacks advance the revision and reschedule; a paused video stays put', () => {
    const video = createVideo({ width: 32, height: 16, frameCallback: true });
    const source = new VideoFrameSource(video.element);
    const frames = vi.fn();

    source.onFrame.add(frames);
    const before = source.revision;

    expect(source.revision).toBe(before);

    video.present();

    expect(source.revision).toBe(before + 1);
    expect(frames).toHaveBeenCalledTimes(1);
    expect(video.request).toHaveBeenCalledTimes(2);

    // Without a presented frame the playback position is ignored once callbacks arrive.
    video.element.currentTime = 5;
    expect(source.revision).toBe(before + 1);
    source.destroy();
  });

  test('without frame callbacks the revision follows the playback position', () => {
    const video = createVideo({ width: 32, height: 16 });
    const source = new VideoFrameSource(video.element);
    const before = source.revision;

    expect(source.revision).toBe(before);

    video.element.currentTime = 0.5;
    expect(source.revision).toBe(before + 1);
    expect(source.revision).toBe(before + 1);
    source.destroy();
  });

  test('a resize advances the revision and reports the new size', () => {
    const video = createVideo({ frameCallback: true });
    const source = new VideoFrameSource(video.element);

    expect(source.ready).toBe(false);

    const before = source.revision;

    video.resize(64, 48);

    const after = source.revision;

    expect(after).toBeGreaterThan(before);
    expect(source.revision).toBe(after);
    expect(source.width).toBe(64);
    expect(source.ready).toBe(true);
    source.destroy();
  });

  test('destroy cancels the pending callback, removes listeners and freezes the revision', () => {
    const video = createVideo({ width: 8, height: 8, frameCallback: true });
    const source = new VideoFrameSource(video.element);
    const remove = vi.spyOn(video.element, 'removeEventListener');

    source.destroy();
    const frozen = source.revision;

    video.resize(16, 16);
    video.element.currentTime = 3;

    expect(video.cancel).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledTimes(6);
    expect(source.revision).toBe(frozen);
    expect(source.image).toBeNull();
  });
});

describe('VideoTexture', () => {
  test('one texture follows the video and uploads each presented frame once', () => {
    const video = createVideo({ width: 32, height: 16, frameCallback: true });
    const texture = new VideoTexture(video.element);
    const first = texture.version;

    expect(texture.source).toBe(video.element);
    expect(texture.width).toBe(32);
    expect(texture.version).toBe(first);

    video.present();

    const second = texture.version;

    expect(second).toBeGreaterThan(first);
    expect(texture.version).toBe(second);

    texture.destroy();
    expect(video.cancel).toHaveBeenCalled();
  });
});

describe('CanvasFrameSource', () => {
  test('invalidate and resize advance the revision; destroy stops it', () => {
    const canvas = document.createElement('canvas');
    const source = new CanvasFrameSource(canvas);
    const texture = new FrameTexture(source, { ownsSource: true });
    const first = texture.version;

    expect(texture.version).toBe(first);

    source.invalidate();
    expect(texture.version).toBeGreaterThan(first);

    canvas.width = 640;
    void texture.version;
    expect(texture.width).toBe(640);

    texture.destroy();
    const frozen = source.revision;

    source.invalidate();
    expect(source.revision).toBe(frozen);
  });
});
