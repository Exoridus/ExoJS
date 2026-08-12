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
 * once" — the state a re-lock happens from.
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
  // and warns — recommending `onUnlock`, the path that had just failed.
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
    // across any number of further lock cycles — otherwise the menu music
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
  // `onAudioContextReady.add(...)` branch — but that signal is a documented
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
});
