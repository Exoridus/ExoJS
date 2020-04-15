import { Signal } from "core/Signal";

export const audioContext: AudioContext = new AudioContext();

export const offlineAudioContext: OfflineAudioContext = new OfflineAudioContext(1, 2, audioContext.sampleRate);

export const isAudioContextReady = (): boolean => audioContext.state === "running";

export const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => offlineAudioContext.decodeAudioData(arrayBuffer);

export const onAudioContextReady = new Signal<AudioContext>();

const onUserInteraction = () => {
    document.removeEventListener('mousedown', onUserInteraction, false);
    document.removeEventListener('touchstart', onUserInteraction, false);
    document.removeEventListener('touchend', onUserInteraction, false);

    if (isAudioContextReady()) {
        onAudioContextReady.dispatch(audioContext);
    } else {
        audioContext.resume().then(() => onAudioContextReady.dispatch(audioContext!))
    }
};

document.addEventListener('mousedown', onUserInteraction, false);
document.addEventListener('touchstart', onUserInteraction, false);
document.addEventListener('touchend', onUserInteraction, false);