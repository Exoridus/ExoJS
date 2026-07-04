/**
 * Focused unit tests for BaseVoice — the shared control surface (volume,
 * fade, stop, effects chain, bus routing, spatialization) mixed into every
 * concrete voice. Exercised through SoundVoice/Sound, the simplest concrete
 * subclass, since BaseVoice itself is abstract.
 *
 * Other test files (fade.test.ts, voice-effects.test.ts, sound-voice.test.ts,
 * sound-spatial.test.ts) cover BaseVoice indirectly through everyday usage;
 * this file targets the remaining branches — post-`ended` no-ops, the
 * deferred-bus-connect path, and the panner-position fallback API.
 */
import { getAudioContext, onAudioContextReady } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import type { AudioEffect } from '#audio/AudioEffect';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

const createAudioBufferStub = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

interface MockBufferSource {
  connect: MockInstance;
  disconnect: MockInstance;
  start: MockInstance;
  stop: MockInstance;
  playbackRate: { value: number; setTargetAtTime: MockInstance };
  detune: { value: number; setTargetAtTime: MockInstance };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const setupSourceSpy = (): { sources: MockBufferSource[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: MockBufferSource[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node: MockBufferSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      playbackRate: { value: 1, setTargetAtTime: vi.fn() },
      detune: { value: 0, setTargetAtTime: vi.fn() },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      buffer: null,
    };
    sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

const makeStubEffect = (): AudioEffect => {
  const inputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  return { inputNode, outputNode, destroy: vi.fn(), ready: Promise.resolve() } as unknown as AudioEffect;
};

interface MockGainNode {
  connect: MockInstance;
  disconnect: MockInstance;
  gain: {
    setTargetAtTime: MockInstance;
    cancelScheduledValues: MockInstance;
    setValueAtTime: MockInstance;
    linearRampToValueAtTime: MockInstance;
    value: number;
  };
}

/** Capture the first createGain call after this helper runs — the voice's output gain. */
const captureVoiceOutput = (): { get node(): MockGainNode | null; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };
  const original = ctx.createGain.bind(ctx);
  let captured: MockGainNode | null = null;
  const spy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    if (captured === null) {
      captured = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), value: 1 },
      };
      return captured as unknown as GainNode;
    }
    return original();
  });
  return {
    get node() {
      return captured;
    },
    restore: () => spy.mockRestore(),
  };
};

interface MockPanner {
  connect: MockInstance;
  disconnect: MockInstance;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  positionX: { setValueAtTime: MockInstance };
  positionY: { setValueAtTime: MockInstance };
  positionZ: { setValueAtTime: MockInstance };
}

const setupPannerSpy = (): { panners: MockPanner[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPanner[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPanner = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

describe('BaseVoice — post-ended no-ops', () => {
  afterEach(() => vi.restoreAllMocks());

  test('volume setter is a no-op once the voice has ended', () => {
    const manager = new AudioManager(); // before capture, so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    out.node!.gain.setTargetAtTime.mockClear();

    voice.volume = 0.3;
    expect(voice.volume).toBe(0.3);
    expect(out.node!.gain.setTargetAtTime).not.toHaveBeenCalled();

    out.restore();
    sound.destroy();
  });

  test('bus setter after ended just swaps the reference without touching the graph', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    const newBus = new AudioBus('side', { parent: manager.master });

    voice.bus = newBus;
    expect(voice.bus).toBe(newBus);

    sound.destroy();
  });

  test('addEffect() after ended is a no-op that still returns the voice', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    const fx = makeStubEffect();

    voice.stop();
    expect(voice.addEffect(fx)).toBe(voice);
    expect((fx.inputNode as unknown as { connect: MockInstance }).connect).not.toHaveBeenCalled();

    sound.destroy();
  });

  test('removeEffect() with an effect that was never added is a no-op', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    const fx = makeStubEffect();

    expect(voice.removeEffect(fx)).toBe(voice);
    expect((fx.outputNode as unknown as { disconnect: MockInstance }).disconnect).not.toHaveBeenCalled();

    sound.destroy();
  });

  test('fade() after ended is a no-op', () => {
    const manager = new AudioManager(); // before capture, so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    out.node!.gain.setTargetAtTime.mockClear();

    expect(() => voice.fade(1, 200)).not.toThrow();
    expect(out.node!.gain.setTargetAtTime).not.toHaveBeenCalled();

    out.restore();
    sound.destroy();
  });

  test('stop() a second time is a no-op (idempotent _finish)', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    expect(voice.ended).toBe(true);
    expect(() => voice.stop()).not.toThrow();
    expect(voice.ended).toBe(true);
  });

  test('_finish() itself is idempotent if invoked again after the voice already ended', () => {
    // `stop()` already guards against a second call reaching `_finish()` (see
    // the test above); this exercises `_finish()`'s own internal guard, which
    // protects against a second trigger reaching it via a different path (e.g.
    // a subclass's natural-end callback firing after an explicit stop()).
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    const onEndSpy = vi.fn();
    voice.onEnd.add(onEndSpy);

    voice.stop();
    expect(onEndSpy).toHaveBeenCalledTimes(1);

    expect(() => (voice as unknown as { _finish: () => void })._finish()).not.toThrow();
    // onEnd was already destroyed by the first _finish() — dispatch is a no-op now.
    expect(onEndSpy).toHaveBeenCalledTimes(1);
  });

  test('position setter after ended is a no-op', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    voice.position = { x: 1, y: 2 };
    expect(voice.position).toBeNull();

    sound.destroy();
  });

  test('follow() after ended is a no-op', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.stop();
    const node = { getGlobalTransform: vi.fn() };
    expect(() => voice.follow(node as never)).not.toThrow();
    expect(node.getGlobalTransform).not.toHaveBeenCalled();

    sound.destroy();
  });
});

describe('BaseVoice — fade()', () => {
  afterEach(() => vi.restoreAllMocks());

  test('fade(to, 0) applies the target value immediately via setTargetAtTime', () => {
    const manager = new AudioManager(); // before capture, so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.fade(0.2, 0);

    expect(voice.volume).toBe(0.2);
    expect(out.node!.gain.setTargetAtTime).toHaveBeenCalledWith(0.2, expect.any(Number), 0.01);
    expect(out.node!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    out.restore();
    sound.destroy();
  });

  test('fade(to, ms) schedules a linear ramp and clamps the target to [0, 1]', () => {
    const manager = new AudioManager(); // before capture, so bus gains are not captured
    const out = captureVoiceOutput();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.fade(5, 300);

    expect(voice.volume).toBe(1); // clamped
    expect(out.node!.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(out.node!.gain.setValueAtTime).toHaveBeenCalled();
    expect(out.node!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));

    out.restore();
    sound.destroy();
  });
});

describe('BaseVoice — position edge cases', () => {
  afterEach(() => vi.restoreAllMocks());

  test('setting position to null when a position exists destroys the vector', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.position = { x: 1, y: 2 };
    expect(voice.position).not.toBeNull();

    voice.position = null;
    expect(voice.position).toBeNull();

    pannerSpy.restore();
    sound.destroy();
  });

  test('setting position to null when already null is a no-op', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    expect(voice.position).toBeNull();
    expect(() => (voice.position = null)).not.toThrow();
    expect(voice.position).toBeNull();

    sound.destroy();
  });

  test('setting position twice updates the existing Vector in place and does not recreate the panner', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.position = { x: 1, y: 2 };
    voice.position = { x: 3, y: 4 };

    expect(voice.position!.x).toBe(3);
    expect(voice.position!.y).toBe(4);
    // Only one PannerNode is ever created — the second call's _ensurePanner() no-ops.
    expect(pannerSpy.panners.length).toBe(1);

    pannerSpy.restore();
    sound.destroy();
  });

  test('follow(null) clears the follow target without touching the panner', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    expect(() => voice.follow(null)).not.toThrow();
    // No spatialization was ever triggered by following null.
    expect(pannerSpy.panners.length).toBe(0);

    pannerSpy.restore();
    sound.destroy();
  });
});

describe('BaseVoice — _tickSpatial()', () => {
  afterEach(() => vi.restoreAllMocks());

  test('_tickSpatial() is a no-op if the voice was never spatialized (no panner)', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    expect(() => voice._tickSpatial()).not.toThrow();

    sound.destroy();
  });

  test('_tickSpatial() is a no-op once the voice has ended', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.position = { x: 1, y: 2 };
    voice.stop();

    expect(() => voice._tickSpatial()).not.toThrow();

    pannerSpy.restore();
    sound.destroy();
  });

  test('_tickSpatial() returns without writing to the panner once position is cleared and there is no follow target', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.position = { x: 1, y: 2 }; // creates the panner, registers as spatial
    voice.position = null; // clears position but the panner remains registered

    const panner = pannerSpy.panners[0];
    panner.positionX.setValueAtTime.mockClear();

    voice._tickSpatial();
    expect(panner.positionX.setValueAtTime).not.toHaveBeenCalled();

    pannerSpy.restore();
    sound.destroy();
  });

  test('_tickSpatial() falls back to panner.setPosition() when positionX/Y/Z AudioParams are unavailable', () => {
    const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
    const setPosition = vi.fn();
    const spy = vi.spyOn(ctx, 'createPanner').mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      setPosition,
    } as unknown as PannerNode);

    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.position = { x: 7, y: 8 };
    voice._tickSpatial();

    expect(setPosition).toHaveBeenCalledWith(7, 8, 0);

    spy.mockRestore();
    sound.destroy();
  });

  test('_tickSpatial() silently no-ops when the panner exposes neither AudioParams nor setPosition', () => {
    const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
    const spy = vi.spyOn(ctx, 'createPanner').mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
    } as unknown as PannerNode);

    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.position = { x: 1, y: 2 };
    expect(() => voice._tickSpatial()).not.toThrow();

    spy.mockRestore();
    sound.destroy();
  });
});

describe('BaseVoice — effect chain / bus routing', () => {
  afterEach(() => vi.restoreAllMocks());

  test('_tail() returns the last effect output once an effect chain exists (bus change rewires it)', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    const fx = makeStubEffect();

    voice.addEffect(fx);
    const newBus = new AudioBus('side', { parent: manager.master });
    voice.bus = newBus;

    // The effect's outputNode (not the raw voice output) was connected onward
    // to the new bus's input — proving _tail() returned the effect chain's tail.
    expect((fx.outputNode as unknown as { connect: MockInstance }).connect).toHaveBeenCalledWith(newBus._getInputNode());

    sound.destroy();
  });
});

describe('BaseVoice — spatial registration internals', () => {
  afterEach(() => vi.restoreAllMocks());

  test('_ensurePanner() does not re-register as a spatial voice once already registered (defensive guard)', () => {
    const pannerSpy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    voice.position = { x: 1, y: 2 }; // creates the panner and registers as spatial

    const registerSpy = vi.spyOn(manager, '_registerSpatial');
    // Force back past the "already have a panner" short-circuit to exercise the
    // (structurally unreachable via the public API) `_spatialRegistered` guard.
    (voice as unknown as { _panner: unknown })._panner = null;
    (voice as unknown as { _ensurePanner: () => void })._ensurePanner();

    expect(registerSpy).not.toHaveBeenCalled();

    pannerSpy.restore();
    sound.destroy();
  });

  test('_rebuildEffectChain() is a no-op once the voice has ended (defensive guard)', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.stop();
    expect(() => (voice as unknown as { _rebuildEffectChain: () => void })._rebuildEffectChain()).not.toThrow();

    sound.destroy();
  });
});

describe('BaseVoice — deferred bus connect while the bus is not yet set up', () => {
  afterEach(() => vi.restoreAllMocks());

  test('a voice created before its bus is ready connects to the destination, then reconnects once the bus comes online', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager(); // constructed while the context is running — its own busses set up normally
    const ctx = getAudioContext();
    const destination = ctx.destination;

    // A bus constructed while the context is suspended has no input node yet.
    const originalState = ctx.state;
    ctx.state = 'suspended';
    const bus = new AudioBus('deferred', { parent: null });
    expect(bus._getInputNode()).toBeNull();

    const sound = new Sound(createAudioBufferStub());
    const output = captureVoiceOutput();
    const voice = manager.play(sound, { bus });

    // Routed to the destination for now (bus is still locked).
    expect(output.node!.connect).toHaveBeenCalledWith(destination);

    // The bus comes online once the context becomes ready: dispatching
    // onAudioContextReady runs the bus's own pending setup handler first
    // (registered in its constructor), then the voice's deferred reconnect
    // handler (registered via `bus.onceSetup` in `_connectTail`), which now
    // finds a real input node and rewires the tail onto it.
    ctx.state = originalState;
    onAudioContextReady.dispatch(ctx);

    expect(bus._getInputNode()).not.toBeNull();
    expect(output.node!.disconnect).toHaveBeenCalled();
    expect(output.node!.connect).toHaveBeenCalledWith(bus._getInputNode());
    expect(voice.ended).toBe(false);

    output.restore();
    factory.restore();
    sound.destroy();
  });
});
