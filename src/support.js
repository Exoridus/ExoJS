export default {

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webAudio: ('AudioContext' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    indexedDB: ('indexedDB' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webGL: (() => {
        const canvas = document.createElement('canvas'),
            supports = ('probablySupportsContext' in canvas) ? 'probablySupportsContext' : 'supportsContext';

        if (supports in canvas) {
            return canvas[supports]('webgl') || canvas[supports]('experimental-webgl');
        }

        return ('WebGLRenderingContext' in window);
    })(),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    touchEvents: ('ontouchstart' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    pointerEvents: ('PointerEvent' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    eventOptions: (() => {
        let supportsPassive = false;

        try {
            window.addEventListener('test', null, {
                get passive() {
                    supportsPassive = true;
                }
            });
        } catch (e) {}

        return supportsPassive;
    })(),
};
