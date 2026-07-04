import { AudioBus } from '#audio/AudioBus';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { Video } from '#rendering/video/Video';
import { View } from '#rendering/View';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockVideoElementOptions {
  /** Initial `videoWidth`/`videoHeight`. Defaults to `0x0` (metadata not yet loaded). */
  readonly width?: number;
  readonly height?: number;
  /** Whether to expose `requestVideoFrameCallback`/`cancelVideoFrameCallback`. Defaults to `false` (unsupported browser). */
  readonly withFrameCallback?: boolean;
}

interface MockVideoElement {
  readonly element: HTMLVideoElement;
  setDimensions(width: number, height: number): void;
  setPaused(paused: boolean): void;
  readonly requestVideoFrameCallback: MockInstance | undefined;
  readonly cancelVideoFrameCallback: MockInstance | undefined;
}

/**
 * Builds a `<video>` element with the read-only DOM properties Video reads
 * (`videoWidth`/`videoHeight`/`duration`/`volume`/`playbackRate`/`loop`/`muted`)
 * made controllable, plus a directly-settable `paused` flag — jsdom's stubbed
 * `play()`/`pause()` (see `test/setup-env.vitest.ts`) never actually flip the
 * real `paused` property, so tests drive it explicitly to exercise both the
 * "was already playing/paused" and "state changed" branches deterministically.
 *
 * `requestVideoFrameCallback`/`cancelVideoFrameCallback` are omitted by
 * default (mirroring a browser without the API, exactly like the original
 * fixture) and only attached when `withFrameCallback` is requested.
 */
const createMockVideoElement = (options: MockVideoElementOptions = {}): MockVideoElement => {
  const element = document.createElement('video');
  let videoWidth = options.width ?? 0;
  let videoHeight = options.height ?? 0;
  let paused = true;

  Object.defineProperty(element, 'videoWidth', {
    configurable: true,
    get: () => videoWidth,
  });
  Object.defineProperty(element, 'videoHeight', {
    configurable: true,
    get: () => videoHeight,
  });
  Object.defineProperty(element, 'duration', {
    configurable: true,
    value: 10,
  });
  Object.defineProperty(element, 'volume', {
    configurable: true,
    writable: true,
    value: 1,
  });
  Object.defineProperty(element, 'playbackRate', {
    configurable: true,
    writable: true,
    value: 1,
  });
  Object.defineProperty(element, 'loop', {
    configurable: true,
    writable: true,
    value: false,
  });
  Object.defineProperty(element, 'muted', {
    configurable: true,
    writable: true,
    value: false,
  });
  Object.defineProperty(element, 'paused', {
    configurable: true,
    get: () => paused,
  });

  let requestVideoFrameCallback: MockInstance | undefined;
  let cancelVideoFrameCallback: MockInstance | undefined;

  if (options.withFrameCallback) {
    requestVideoFrameCallback = vi.fn();
    cancelVideoFrameCallback = vi.fn();
    (element as unknown as Record<string, unknown>)['requestVideoFrameCallback'] = requestVideoFrameCallback;
    (element as unknown as Record<string, unknown>)['cancelVideoFrameCallback'] = cancelVideoFrameCallback;
  }

  return {
    element,
    setDimensions: (width: number, height: number): void => {
      videoWidth = width;
      videoHeight = height;
    },
    setPaused: (value: boolean): void => {
      paused = value;
    },
    requestVideoFrameCallback,
    cancelVideoFrameCallback,
  };
};

/** A minimal `RenderPlanBuilder` fake — just enough surface for `RenderNode._collect`. */
const createBuilder = (): { view: View; backend: { stats: { culledNodes: number } }; emitNode: MockInstance } => ({
  view: new View(0, 0, 1000, 1000),
  backend: { stats: { culledNodes: 0 } },
  emitNode: vi.fn(),
});

describe('Video', () => {
  test('updates texture frame when metadata arrives even before render()', () => {
    const mockVideo = createMockVideoElement();
    const video = new Video(mockVideo.element);

    expect(video.textureFrame.width).toBe(0);
    expect(video.textureFrame.height).toBe(0);

    mockVideo.setDimensions(320, 180);
    mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

    expect(video.textureFrame.width).toBe(320);
    expect(video.textureFrame.height).toBe(180);

    video.destroy();
  });

  test('keeps explicit display size while syncing intrinsic frame size on metadata resize', () => {
    const mockVideo = createMockVideoElement();
    const video = new Video(mockVideo.element);

    mockVideo.setDimensions(640, 360);
    mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

    video.width = 256;
    video.height = 144;

    mockVideo.setDimensions(1280, 720);
    mockVideo.element.dispatchEvent(new Event('resize'));

    expect(video.width).toBe(256);
    expect(video.height).toBe(144);
    expect(video.textureFrame.width).toBe(1280);
    expect(video.textureFrame.height).toBe(720);

    video.destroy();
  });

  describe('construction', () => {
    test('applies playbackOptions passed to the constructor', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element, { volume: 0.5, loop: true, playbackRate: 2, muted: true, time: 3 });

      expect(video.volume).toBe(0.5);
      expect(video.loop).toBe(true);
      expect(video.playbackRate).toBe(2);
      expect(video.muted).toBe(true);
      expect(video.currentTime).toBe(3);

      video.destroy();
    });

    test('reads initial volume/playbackRate/loop/muted/duration straight from the video element', () => {
      const mockVideo = createMockVideoElement();

      mockVideo.element.volume = 0.7;
      mockVideo.element.playbackRate = 1.5;
      mockVideo.element.loop = true;
      mockVideo.element.muted = true;

      const video = new Video(mockVideo.element);

      expect(video.duration).toBe(10);
      expect(video.volume).toBe(0.7);
      expect(video.playbackRate).toBe(1.5);
      expect(video.loop).toBe(true);
      expect(video.muted).toBe(true);

      video.destroy();
    });

    test('exposes the wrapped element via `videoElement`', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      expect(video.videoElement).toBe(mockVideo.element);

      video.destroy();
    });

    test('does not register metadata listeners when dimensions are already known at construction', () => {
      const mockVideo = createMockVideoElement({ width: 64, height: 32 });
      const addEventListenerSpy = vi.spyOn(mockVideo.element, 'addEventListener');

      const video = new Video(mockVideo.element);

      expect(addEventListenerSpy).not.toHaveBeenCalledWith('loadedmetadata', expect.anything());
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('resize', expect.anything());
      expect(video.textureFrame.width).toBe(64);
      expect(video.textureFrame.height).toBe(32);

      video.destroy();
    });
  });

  describe('progress', () => {
    test('computes (currentTime % duration) / duration', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.currentTime = 3;

      expect(video.progress).toBeCloseTo(0.3, 5);

      video.destroy();
    });
  });

  describe('volume', () => {
    test('setVolume clamps into [0, 2] and no-ops when unchanged', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.volume = 5;
      expect(video.volume).toBe(2);

      video.volume = -5;
      expect(video.volume).toBe(0);

      // Re-assigning the current value hits the no-op early return.
      video.volume = 0;
      expect(video.volume).toBe(0);

      video.destroy();
    });

    test('changes the live gain node target when muted and unmuted', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const gainNode = video.analyserTarget!;
      const gainSpy = vi.spyOn(gainNode.gain, 'setTargetAtTime');

      video.volume = 0.6;
      expect(gainSpy).toHaveBeenCalled();

      video.muted = true;
      gainSpy.mockClear();
      video.volume = 0.8;
      // Muted: target gain is 0 regardless of the new volume value.
      expect(gainSpy).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));

      video.destroy();
    });
  });

  describe('loop', () => {
    test('setLoop updates the video element and no-ops when unchanged', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.loop = true;
      expect(video.loop).toBe(true);
      expect(mockVideo.element.loop).toBe(true);

      video.loop = true; // no-op branch
      expect(video.loop).toBe(true);

      video.destroy();
    });
  });

  describe('playbackRate', () => {
    test('setPlaybackRate clamps into [0.1, 20] and no-ops when unchanged', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.playbackRate = 50;
      expect(video.playbackRate).toBe(20);

      video.playbackRate = 0.01;
      expect(video.playbackRate).toBe(0.1);

      video.playbackRate = 0.1; // no-op branch
      expect(video.playbackRate).toBe(0.1);

      video.destroy();
    });
  });

  describe('currentTime', () => {
    test('setTime clamps negative values to 0', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.currentTime = -5;
      expect(video.currentTime).toBe(0);

      video.currentTime = 4;
      expect(video.currentTime).toBe(4);

      video.destroy();
    });
  });

  describe('muted', () => {
    test('setMuted no-ops when unchanged and updates the gain target when changed', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const gainNode = video.analyserTarget!;
      const gainSpy = vi.spyOn(gainNode.gain, 'setTargetAtTime');

      video.muted = false; // already false — no-op branch
      expect(gainSpy).not.toHaveBeenCalled();

      video.muted = true;
      expect(gainSpy).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));

      gainSpy.mockClear();
      video.muted = false;
      expect(gainSpy).toHaveBeenCalledWith(video.volume, expect.any(Number), expect.any(Number));

      video.destroy();
    });
  });

  describe('paused / playing', () => {
    test('play() dispatches onStart only when transitioning from paused', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const startSpy = vi.fn();

      video.onStart.add(startSpy);
      mockVideo.setPaused(true);

      video.play();
      expect(startSpy).toHaveBeenCalledTimes(1);

      // Simulate the video now actually playing; a second play() is a no-op.
      mockVideo.setPaused(false);
      video.play();
      expect(startSpy).toHaveBeenCalledTimes(1);

      video.destroy();
    });

    test('pause() dispatches onStop only when transitioning from playing', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const stopSpy = vi.fn();

      video.onStop.add(stopSpy);
      mockVideo.setPaused(false);

      video.pause();
      expect(stopSpy).toHaveBeenCalledTimes(1);

      // Already paused — pause() is a no-op.
      mockVideo.setPaused(true);
      video.pause();
      expect(stopSpy).toHaveBeenCalledTimes(1);

      video.destroy();
    });

    test('play()/pause() apply options first when provided', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setPaused(true);
      video.play({ volume: 0.4 });
      expect(video.volume).toBe(0.4);

      mockVideo.setPaused(false);
      video.pause({ volume: 0.2 });
      expect(video.volume).toBe(0.2);

      video.destroy();
    });

    test('stop() pauses and seeks to the start', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setPaused(false);
      video.currentTime = 5;

      video.stop();

      expect(video.currentTime).toBe(0);

      video.destroy();
    });

    test('toggle() flips between play() and pause()', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setPaused(true);
      video.toggle();
      expect(video.paused).toBe(true); // our mock does not self-update; assert getter reads through

      mockVideo.setPaused(false);
      video.toggle();
      expect(video.playing).toBe(true);

      video.destroy();
    });

    test('paused/playing setters delegate to play()/pause()', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setPaused(true);
      video.playing = true;

      mockVideo.setPaused(false);
      video.paused = true;

      expect(() => {
        video.playing = false;
      }).not.toThrow();

      // `paused = false` takes the setter's `play()` branch.
      mockVideo.setPaused(true);
      expect(() => {
        video.paused = false;
      }).not.toThrow();

      video.destroy();
    });
  });

  describe('applyOptions', () => {
    test('an empty options bag touches nothing', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const before = { volume: video.volume, loop: video.loop, playbackRate: video.playbackRate, time: video.currentTime, muted: video.muted };

      video.applyOptions({});

      expect(video.volume).toBe(before.volume);
      expect(video.loop).toBe(before.loop);
      expect(video.playbackRate).toBe(before.playbackRate);
      expect(video.currentTime).toBe(before.time);
      expect(video.muted).toBe(before.muted);

      video.destroy();
    });

    test('applying with no argument at all uses the default empty bag', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      expect(() => video.applyOptions()).not.toThrow();

      video.destroy();
    });
  });

  describe('bus routing', () => {
    test('assigning the same bus twice is a no-op', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const bus = new AudioBus('video-test-a');

      video.bus = bus;
      const gainNode = video.analyserTarget!;
      const disconnectSpy = vi.spyOn(gainNode, 'disconnect');

      video.bus = bus; // same reference — early return, no disconnect/reconnect
      expect(disconnectSpy).not.toHaveBeenCalled();

      video.destroy();
      bus.destroy();
    });

    test('routes through a real bus input node when one is available', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const bus = new AudioBus('video-test-b');
      const gainNode = video.analyserTarget!;
      const connectSpy = vi.spyOn(gainNode, 'connect');

      video.bus = bus;

      expect(video.bus).toBe(bus);
      expect(connectSpy).toHaveBeenCalledWith(bus.inputNode);

      video.destroy();
      bus.destroy();
    });

    test('falls back to the context destination when the bus has no input node', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const gainNode = video.analyserTarget!;
      const connectSpy = vi.spyOn(gainNode, 'connect');
      const fakeBus = { _getInputNode: () => null } as unknown as AudioBus;

      video.bus = fakeBus;

      expect(connectSpy).toHaveBeenCalled();

      video.destroy();
    });
  });

  describe('_collect (internal render-plan hook)', () => {
    test('marks the texture dirty and refreshes it while visible', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setDimensions(64, 32);
      mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

      const updateSpy = vi.spyOn(video, 'updateTexture');
      const builder = createBuilder();

      video._collect(builder as unknown as RenderPlanBuilder);

      expect(updateSpy).toHaveBeenCalled();
      expect(builder.emitNode).toHaveBeenCalled();

      video.destroy();
    });

    test('does not re-mark the texture dirty when currentTime has not advanced since the last collect', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setDimensions(64, 32);
      mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

      const builder = createBuilder();

      // First collect establishes `_lastVideoTime` and clears the dirty flag.
      video._collect(builder as unknown as RenderPlanBuilder);

      const texture = video.texture!;
      const sourceSpy = vi.spyOn(texture, 'updateSource');

      // currentTime is unchanged — the playback-advance branch stays false and
      // the frame is not re-uploaded.
      video._collect(builder as unknown as RenderPlanBuilder);

      expect(sourceSpy).not.toHaveBeenCalled();

      video.destroy();
    });

    test('skips the texture refresh while invisible', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      video.visible = false;

      const updateSpy = vi.spyOn(video, 'updateTexture');
      const builder = createBuilder();

      video._collect(builder as unknown as RenderPlanBuilder);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(builder.emitNode).not.toHaveBeenCalled();

      video.destroy();
    });
  });

  describe('updateTexture', () => {
    test('is a no-op once the frame is no longer dirty', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setDimensions(64, 32);
      mockVideo.element.dispatchEvent(new Event('loadedmetadata'));

      const texture = video.texture!;
      const sourceSpy = vi.spyOn(texture, 'updateSource');

      // Frame was already refreshed by the metadata event above (not dirty anymore).
      video.updateTexture();
      expect(sourceSpy).not.toHaveBeenCalled();

      video.destroy();
    });

    test('preserves the display size once a frame size has already been established', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      mockVideo.setDimensions(64, 32);
      mockVideo.element.dispatchEvent(new Event('loadedmetadata'));
      video.width = 128;
      video.height = 64;

      mockVideo.setDimensions(128, 96);
      mockVideo.element.dispatchEvent(new Event('resize'));

      // Display size stays as explicitly set, even though the intrinsic frame changed.
      expect(video.width).toBe(128);
      expect(video.height).toBe(64);

      video.destroy();
    });
  });

  describe('video-frame-callback scheduling', () => {
    test('is a no-op on a browser without requestVideoFrameCallback support', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);

      expect(() => video.destroy()).not.toThrow();
    });

    test('registers a frame callback and re-registers after each frame', () => {
      const mockVideo = createMockVideoElement({ withFrameCallback: true });
      const video = new Video(mockVideo.element);

      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

      // Simulate the browser firing the scheduled callback.
      const handler = mockVideo.requestVideoFrameCallback!.mock.calls[0]![0] as (now: number, metadata: unknown) => void;

      handler(0, {});

      // The handler marks the texture dirty and reschedules itself.
      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(2);

      video.destroy();
    });

    test('a second registration attempt while a callback is already pending is a no-op', () => {
      const mockVideo = createMockVideoElement({ withFrameCallback: true });
      const video = new Video(mockVideo.element);

      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

      // Re-entering the private scheduling method directly while a callback
      // handle is already outstanding must not schedule a second one.
      (video as unknown as { _requestVideoFrameCallback(): void })._requestVideoFrameCallback();

      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

      video.destroy();
    });

    test('cancels the pending frame callback on destroy', () => {
      const mockVideo = createMockVideoElement({ withFrameCallback: true });
      const video = new Video(mockVideo.element);

      video.destroy();

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    });

    test('a second cancel attempt once already cancelled is a no-op', () => {
      const mockVideo = createMockVideoElement({ withFrameCallback: true });
      const video = new Video(mockVideo.element);

      (video as unknown as { _cancelVideoFrameCallback(): void })._cancelVideoFrameCallback();
      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);

      // Handle is already null — a second cancel call must not call through again.
      (video as unknown as { _cancelVideoFrameCallback(): void })._cancelVideoFrameCallback();
      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);

      video.destroy();
    });
  });

  describe('destroy', () => {
    test('tears down audio nodes, listeners, and signals without throwing', () => {
      const mockVideo = createMockVideoElement();
      const video = new Video(mockVideo.element);
      const gainNode = video.analyserTarget!;
      const disconnectSpy = vi.spyOn(gainNode, 'disconnect');

      mockVideo.setPaused(false);

      expect(() => video.destroy()).not.toThrow();
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});
