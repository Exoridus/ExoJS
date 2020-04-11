const canvas: HTMLCanvasElement = document.createElement('canvas');
const supportsContext: 'probablySupportsContext' | 'supportsContext' = ('probablySupportsContext' in canvas) ? 'probablySupportsContext' : 'supportsContext';

export const supportsWebAudio: boolean = ('AudioContext' in window);

export const supportsIndexedDB = ('indexedDB' in window);

export const supportsWebGL: boolean = (supportsContext in canvas)
        // @ts-ignore
        ? (canvas[supportsContext]('webgl') || canvas[supportsContext]('experimental-webgl'))
        : ('WebGLRenderingContext' in window);

export const supportsWebGL2: boolean = (supportsContext in canvas)
        // @ts-ignore
        ? canvas[supportsContext]('webgl2')
        : ('WebGL2RenderingContext' in window);

export const supportsTouchEvents: boolean = ('ontouchstart' in window);

export const supportsPointerEvents: boolean = ('PointerEvent' in window);

export const supportsEventOptions: boolean = (() => {
    let supportsPassive = false;

    try {
        window.addEventListener('test', () => {}, {
            get passive() {
                supportsPassive = true;
                return false;
            }
        });
    } catch (e) {}

    return supportsPassive;
})();
