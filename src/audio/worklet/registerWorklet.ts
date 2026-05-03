const _registered = new WeakMap<BaseAudioContext, Set<string>>();
const _pending = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Registers an AudioWorkletProcessor (defined by `source`) with the given
 * AudioContext under `processorName`. Idempotent: subsequent calls with the
 * same context+name return immediately. Concurrent calls (race-condition
 * protection) share a single in-flight registration promise.
 *
 * Source is bundled at build time as a JavaScript string and turned into a
 * Blob URL at runtime — no separate worklet asset file is shipped.
 */
export async function registerWorkletProcessor(
    audioContext: BaseAudioContext,
    processorName: string,
    source: string,
): Promise<void> {
    let registered = _registered.get(audioContext);
    if (!registered) {
        registered = new Set();
        _registered.set(audioContext, registered);
    }
    if (registered.has(processorName)) return;

    let pending = _pending.get(audioContext);
    if (!pending) {
        pending = new Map();
        _pending.set(audioContext, pending);
    }
    const inFlight = pending.get(processorName);
    if (inFlight) return inFlight;

    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    const promise = audioContext.audioWorklet.addModule(url).finally(() => {
        URL.revokeObjectURL(url);
    }).then(() => {
        registered!.add(processorName);
        pending!.delete(processorName);
    }).catch((error) => {
        pending!.delete(processorName);
        throw error;
    });

    pending.set(processorName, promise);
    return promise;
}
