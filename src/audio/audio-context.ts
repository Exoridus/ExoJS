import { Signal } from '#core/Signal';

interface AudioContextEventTarget {
  addEventListener?: (type: string, listener: () => void) => void;
}

const interactionEvents = ['mousedown', 'touchstart', 'touchend', 'keydown'] as const;

/**
 * Sample rate used for the decoding {@link OfflineAudioContext} when no live
 * {@link AudioContext} exists yet. 44.1 kHz is universally supported; decoded
 * buffers at this rate are transparently resampled by any playback context that
 * later runs at a different rate, so this never forces a live context into
 * existence merely to decode audio before the first user gesture (AU2).
 */
const DEFAULT_SAMPLE_RATE = 44100;

let internalAudioContext: AudioContext | null = null;
let internalOfflineAudioContext: OfflineAudioContext | null = null;
let interactionListenersAdded = false;
let stateChangeListenerAdded = false;
let readyDispatched = false;

const supportsAudioContext = (): boolean => typeof AudioContext !== 'undefined';
const supportsOfflineAudioContext = (): boolean => typeof OfflineAudioContext !== 'undefined';
const canUseDocument = (): boolean => typeof document !== 'undefined';

const getExistingAudioContext = (): AudioContext | null => internalAudioContext;

const getOrCreateAudioContext = (): AudioContext => {
  if (!supportsAudioContext()) {
    throw new Error('This environment does not support AudioContext.');
  }

  if (internalAudioContext === null) {
    internalAudioContext = new AudioContext();
  }

  return internalAudioContext;
};

const getOrCreateOfflineAudioContext = (): OfflineAudioContext => {
  if (!supportsOfflineAudioContext()) {
    throw new Error('This environment does not support OfflineAudioContext.');
  }

  if (internalOfflineAudioContext === null) {
    // Derive the sample rate from an already-live context when one exists, but
    // never CREATE one just to read `sampleRate` — decoding audio at load time
    // (before any user gesture) must not spawn a suspended live AudioContext
    // (AU2). Buffers decoded at DEFAULT_SAMPLE_RATE resample transparently on
    // playback if the live context later runs at a different rate.
    const sampleRate = internalAudioContext?.sampleRate ?? DEFAULT_SAMPLE_RATE;

    internalOfflineAudioContext = new OfflineAudioContext(1, 2, sampleRate);
  }

  return internalOfflineAudioContext;
};

const removeInteractionListeners = (): void => {
  if (!interactionListenersAdded || !canUseDocument()) {
    return;
  }

  for (const eventName of interactionEvents) {
    document.removeEventListener(eventName, onUserInteraction, false);
  }

  interactionListenersAdded = false;
};

const dispatchReadyIfRunning = (): void => {
  const audioContext = getExistingAudioContext();

  if (audioContext?.state !== 'running' || readyDispatched) {
    return;
  }

  readyDispatched = true;
  removeInteractionListeners();
  onAudioContextReady.dispatch(audioContext);
};

const onAudioContextStateChange = (): void => {
  dispatchReadyIfRunning();
};

const addInteractionListeners = (): void => {
  if (interactionListenersAdded || !canUseDocument()) {
    return;
  }

  for (const eventName of interactionEvents) {
    document.addEventListener(eventName, onUserInteraction, false);
  }

  interactionListenersAdded = true;
};

const ensureStateChangeListener = (audioContext: AudioContext): void => {
  const audioContextEventTarget = audioContext as unknown as AudioContextEventTarget;

  if (!stateChangeListenerAdded && typeof audioContextEventTarget.addEventListener === 'function') {
    audioContextEventTarget.addEventListener('statechange', onAudioContextStateChange);
    stateChangeListenerAdded = true;
  }
};

const ensureAudioContextReadyMonitoring = (): void => {
  // Do NOT create a live AudioContext here — merely observing readiness must not
  // spawn a suspended context before the first user gesture (AU2). If a context
  // already exists (created explicitly via getAudioContext, or on the first
  // gesture) wire up its statechange listener and check whether it is running.
  const audioContext = getExistingAudioContext();

  if (audioContext !== null) {
    ensureStateChangeListener(audioContext);
    dispatchReadyIfRunning();
  }

  if (!readyDispatched) {
    addInteractionListeners();
  }
};

const onUserInteraction = (): void => {
  // The first gesture is where the live context is finally created and resumed —
  // the browser's autoplay policy requires resume() to run inside a user gesture.
  const audioContext = getOrCreateAudioContext();
  ensureStateChangeListener(audioContext);

  if (audioContext.state === 'running') {
    dispatchReadyIfRunning();

    return;
  }

  void audioContext.resume().then(() => {
    dispatchReadyIfRunning();
  });
};

/**
 * Specialised {@link Signal} that fires once the global `AudioContext` reaches
 * the `running` state. Subscribing via `add` or `once` automatically begins
 * monitoring for user-interaction events that are required to resume a
 * suspended context in browsers with autoplay policy.
 *
 * @internal
 */
class AudioContextReadySignal extends Signal<[AudioContext]> {
  /** Subscribe and immediately start interaction monitoring. */
  public override add(handler: (audioContext: AudioContext) => void | boolean): this {
    super.add(handler);
    ensureAudioContextReadyMonitoring();

    return this;
  }

  /** Subscribe once and immediately start interaction monitoring. */
  public override once(handler: (audioContext: AudioContext) => void | boolean): this {
    super.once(handler);
    ensureAudioContextReadyMonitoring();

    return this;
  }
}

/**
 * Signal that dispatches once the global `AudioContext` enters the `running`
 * state. Handles browser autoplay-policy by listening for user-interaction
 * events (`mousedown`, `touchstart`, `touchend`) and resuming a suspended
 * context automatically.
 *
 * @example
 * ```ts
 * onAudioContextReady.once((ctx) => {
 *   // safe to schedule audio nodes
 * });
 * ```
 */
export const onAudioContextReady = new AudioContextReadySignal();

/**
 * Return the global singleton `AudioContext`, creating it if it does not yet
 * exist. Also starts interaction-unlock monitoring so the context will resume
 * on the first user gesture. Throws if `AudioContext` is not available in the
 * current environment.
 */
export const getAudioContext = (): AudioContext => {
  const audioContext = getOrCreateAudioContext();

  ensureAudioContextReadyMonitoring();

  return audioContext;
};

/**
 * Return `true` if the global `AudioContext` has been created and is currently
 * in the `running` state. Safe to call before `getAudioContext`; returns
 * `false` if no context exists yet.
 */
export const isAudioContextReady = (): boolean => {
  const audioContext = getExistingAudioContext();

  return audioContext !== null && audioContext.state === 'running';
};

/**
 * Return the shared singleton `OfflineAudioContext` used for audio decoding.
 * Its sample rate matches the live `AudioContext` when one already exists,
 * otherwise a 44.1 kHz default is used. Never creates a live `AudioContext` —
 * decoding before the first user gesture must not spawn a suspended context
 * (AU2); buffers resample transparently on playback if the rates differ.
 */
export const getOfflineAudioContext = (): OfflineAudioContext => getOrCreateOfflineAudioContext();

/**
 * Decode raw audio bytes into an `AudioBuffer` using the shared
 * `OfflineAudioContext`. The context's sample rate matches the live
 * `AudioContext` when one exists, else defaults to 44.1 kHz — decoding never
 * forces a live context into existence.
 *
 * Note: on some older mobile WebKit versions `decodeAudioData` requires a
 * running (live) context — decoding may fail with a browser-level error rather
 * than an ExoJS-shaped error in those environments.
 */
export const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => getOrCreateOfflineAudioContext().decodeAudioData(arrayBuffer);
