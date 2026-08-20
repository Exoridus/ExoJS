import { getAudioContext, onAudioContextReady } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import type { Time } from '#core/Time';

const frame = { seconds: 0.016 } as unknown as Time;

/** The shared mock context reports `'running'`; `state` is readonly on the real type. */
const setContextState = (state: AudioContextState): void => {
  (getAudioContext() as unknown as { state: AudioContextState }).state = state;
};

/**
 * Bring the module-global context into existence and let its one-shot ready
 * signal fire, so every case below starts from "audio has already unlocked
 * once" - the state a re-lock happens from.
 */
const settleFirstUnlock = async (): Promise<void> => {
  getAudioContext();
  setContextState('running');
  onAudioContextReady.add(() => undefined);
  await Promise.resolve();
};

describe('AudioManager.onUnlock contract', () => {
  beforeEach(async () => {
    await settleFirstUnlock();
  });

  afterEach(() => {
    setContextState('running');
    vi.restoreAllMocks();
  });

  test('a handler added while audio is usable is replayed exactly once', async () => {
    const manager = new AudioManager();
    const handler = vi.fn();

    manager.onUnlock.add(handler);
    expect(handler).not.toHaveBeenCalled(); // never synchronously inside add()

    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  // Finding 1: `add()` used to look only at "has this signal ever dispatched",
  // never at the CURRENT lock state. Inside a re-lock window (an iOS
  // audio-session interruption, a bfcache restore) that replayed the handler
  // immediately into a locked context, where `play()` answers with a NoopVoice
  // and warns - recommending `onUnlock`, the path that had just failed.
  test('a handler added during a re-lock window waits for the next unlock', async () => {
    const manager = new AudioManager();

    setContextState('suspended');
    manager.preUpdate(frame);

    const handler = vi.fn();
    manager.onUnlock.add(handler);
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();

    setContextState('running');
    manager.preUpdate(frame);

    expect(handler).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  test('a re-unlock never re-fires a handler that already ran', async () => {
    const manager = new AudioManager();

    setContextState('suspended');
    manager.preUpdate(frame);

    const registered = vi.fn();
    manager.onUnlock.add(registered);

    setContextState('running');
    manager.preUpdate(frame);
    expect(registered).toHaveBeenCalledTimes(1);

    // A replayed handler and a registered one must both stay at one call
    // across any number of further lock cycles - otherwise the menu music
    // starts a second time on top of the first after every interruption.
    const replayed = vi.fn();
    manager.onUnlock.add(replayed);
    await Promise.resolve();
    expect(replayed).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      setContextState('suspended');
      manager.preUpdate(frame);
      setContextState('running');
      manager.preUpdate(frame);
    }

    expect(registered).toHaveBeenCalledTimes(1);
    expect(replayed).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  // Finding 2: a manager constructed inside a re-lock window took the
  // `onAudioContextReady.add(...)` branch - but that signal is a documented
  // one-shot guarded by `readyDispatched`, which had long since fired. The
  // handler was never called, so `onUnlock` was dead for the manager's whole
  // lifetime.
  test('a manager constructed during a re-lock window still unlocks', async () => {
    setContextState('suspended');

    const manager = new AudioManager();
    const handler = vi.fn();

    manager.onUnlock.add(handler);
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    setContextState('running');
    manager.preUpdate(frame);

    expect(handler).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  test('the locked-playback warning re-arms across a lock cycle without preUpdate ordering luck', () => {
    const manager = new AudioManager();

    setContextState('suspended');
    manager.preUpdate(frame);
    setContextState('running');
    manager.preUpdate(frame);
    manager.preUpdate(frame);

    expect(manager.locked).toBe(false);

    manager.destroy();
  });

  // Finding 3: a queued replay could not be cancelled, because the replay path
  // never registered the handler for `remove()` to find. A scene subscribing in
  // `init` and cleaning up in `unload` still started music for a dead scene -
  // and a handler surviving `destroy()` calls `play()` on a destroyed manager,
  // which throws unobserved out of the microtask.
  describe('cancellation', () => {
    test('remove() cancels a replay queued in the same tick', async () => {
      const manager = new AudioManager();
      // Let construction settle, so the `add` below really takes the REPLAY
      // path rather than registering into a not-yet-dispatched signal.
      await Promise.resolve();

      const handler = vi.fn();

      manager.onUnlock.add(handler);
      manager.onUnlock.remove(handler);
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();

      manager.destroy();
    });

    test('remove() cancels a handler registered while locked', () => {
      const manager = new AudioManager();

      setContextState('suspended');
      manager.preUpdate(frame);

      const handler = vi.fn();
      manager.onUnlock.add(handler);
      manager.onUnlock.remove(handler);

      setContextState('running');
      manager.preUpdate(frame);

      expect(handler).not.toHaveBeenCalled();

      manager.destroy();
    });

    test('destroy() cancels a replay queued in the same tick', async () => {
      const manager = new AudioManager();
      await Promise.resolve(); // as above: force the replay path

      const handler = vi.fn();

      manager.onUnlock.add(handler);
      manager.destroy();
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
    });

    test('nothing fires for a handler added after destroy()', async () => {
      const manager = new AudioManager();
      manager.destroy();

      const handler = vi.fn();
      manager.onUnlock.add(handler);
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
    });

    test('a manager destroyed while locked never unlocks afterwards', () => {
      setContextState('suspended');

      const manager = new AudioManager();
      const handler = vi.fn();
      manager.onUnlock.add(handler);
      manager.destroy();

      setContextState('running');
      manager.preUpdate(frame);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // Finding 8: AudioBus and AudioListener both drop their global-ready
  // subscription in destroy(); AudioManager did not. A manager destroyed before
  // the first gesture still ran its handler from inside the global dispatch -
  // and per Signal's contract a handler that throws there terminates the OUTER
  // dispatch, taking every other Application's bus setup down with it.
  test('destroy() unsubscribes the manager from the global ready signal', () => {
    setContextState('suspended');

    const before = onAudioContextReady.count;
    const manager = new AudioManager();
    expect(onAudioContextReady.count).toBeGreaterThan(before);

    manager.destroy();

    expect(onAudioContextReady.count).toBe(before);
  });
});
