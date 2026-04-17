import { Signal } from 'core/Signal';

interface AudioContextEventTarget {
    addEventListener?: (type: string, listener: () => void) => void;
}

const interactionEvents = ['mousedown', 'touchstart', 'touchend'] as const;

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
        const audioContext = getOrCreateAudioContext();

        internalOfflineAudioContext = new OfflineAudioContext(1, 2, audioContext.sampleRate);
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

    if (!audioContext || audioContext.state !== 'running' || readyDispatched) {
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

const ensureAudioContextReadyMonitoring = (): void => {
    const audioContext = getOrCreateAudioContext();
    const audioContextEventTarget = audioContext as unknown as AudioContextEventTarget;

    if (!stateChangeListenerAdded && typeof audioContextEventTarget.addEventListener === 'function') {
        audioContextEventTarget.addEventListener('statechange', onAudioContextStateChange);
        stateChangeListenerAdded = true;
    }

    dispatchReadyIfRunning();

    if (!readyDispatched) {
        addInteractionListeners();
    }
};

const onUserInteraction = (): void => {
    const audioContext = getOrCreateAudioContext();

    if (audioContext.state === 'running') {
        dispatchReadyIfRunning();

        return;
    }

    void audioContext.resume().then(() => {
        dispatchReadyIfRunning();
    });
};

class AudioContextReadySignal extends Signal<[AudioContext]> {
    public override add(handler: (audioContext: AudioContext) => void | boolean, context?: object): this {
        super.add(handler, context);
        ensureAudioContextReadyMonitoring();

        return this;
    }

    public override once(handler: (audioContext: AudioContext) => void | boolean, context?: object): this {
        super.once(handler, context);
        ensureAudioContextReadyMonitoring();

        return this;
    }
}

export const onAudioContextReady = new AudioContextReadySignal();

export const getAudioContext = (): AudioContext => {
    const audioContext = getOrCreateAudioContext();

    ensureAudioContextReadyMonitoring();

    return audioContext;
};

export const isAudioContextReady = (): boolean => {
    const audioContext = getExistingAudioContext();

    return audioContext !== null && audioContext.state === 'running';
};

export const getOfflineAudioContext = (): OfflineAudioContext => getOrCreateOfflineAudioContext();

// Decodes audio data using a shared OfflineAudioContext whose sample rate is derived from
// the live AudioContext. OfflineAudioContext.decodeAudioData is spec-compliant and works
// in all major browsers. On some older mobile WebKit versions, decodeAudioData may only
// succeed on a live (running) AudioContext — in those environments, sound loading may
// fail with a browser-level error rather than an ExoJS-shaped error.
export const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => getOrCreateOfflineAudioContext().decodeAudioData(arrayBuffer);
