import { Signal } from "core/Signal";

const internalAudioContext: AudioContext = new AudioContext();
const internalOfflineAudioContext: OfflineAudioContext = new OfflineAudioContext(1, 2, internalAudioContext.sampleRate);

export const onAudioContextReady = new Signal<AudioContext>();

export const getAudioContext = (): AudioContext => internalAudioContext;
export const isAudioContextReady = (): boolean => internalAudioContext.state === "running";

export const getOfflineAudioContext = (): OfflineAudioContext => internalOfflineAudioContext;
export const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => internalOfflineAudioContext.decodeAudioData(arrayBuffer);


const onUserInteraction = (): void => {
    document.removeEventListener('mousedown', onUserInteraction, false);
    document.removeEventListener('touchstart', onUserInteraction, false);
    document.removeEventListener('touchend', onUserInteraction, false);

    if (isAudioContextReady()) {
        onAudioContextReady.dispatch(internalAudioContext);
    } else {
        internalAudioContext.resume().then(() => onAudioContextReady.dispatch(internalAudioContext!))
    }
};

document.addEventListener('mousedown', onUserInteraction, false);
document.addEventListener('touchstart', onUserInteraction, false);
document.addEventListener('touchend', onUserInteraction, false);