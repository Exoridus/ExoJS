import { noop } from "./core";

export const supportsWebAudio: boolean = ('AudioContext' in window);

export const supportsIndexedDB = ('indexedDB' in window);

export const supportsTouchEvents: boolean = ('ontouchstart' in window);

export const supportsPointerEvents: boolean = ('PointerEvent' in window);

export const supportsEventOptions: boolean = ((): boolean => {
    let supportsPassive = false;

    try {
        window.addEventListener('test', noop, {
            get passive() {
                supportsPassive = true;

                return false;
            }
        });
    } catch (e) {
        // do nothing
    }

    return supportsPassive;
})();
