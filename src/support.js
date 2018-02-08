const

    /**
     * @private
     * @type {HTMLCanvasElement}
     */
    canvas = document.createElement('canvas'),

    /**
     * @private
     * @type {String}
     */
    supportsContext = ('probablySupportsContext' in canvas) ? 'probablySupportsContext' : 'supportsContext',

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webAudio = ('AudioContext' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    indexedDB = ('indexedDB' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webGL = (supportsContext in canvas)
        ? (canvas[supportsContext]('webgl') || canvas[supportsContext]('experimental-webgl'))
        : ('WebGLRenderingContext' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    webGL2 = (supportsContext in canvas)
        ? canvas[supportsContext]('webgl2')
        : ('WebGL2RenderingContext' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    touchEvents = ('ontouchstart' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    pointerEvents = ('PointerEvent' in window),

    /**
     * @public
     * @constant
     * @type {Boolean}
     */
    eventOptions = (() => {
        let supportsPassive = false;

        try {
            window.addEventListener('test', null, {
                get passive() {
                    supportsPassive = true;
                }
            });
        } catch (e) {}

        return supportsPassive;
    })();

export default {
    webAudio,
    indexedDB,
    webGL,
    webGL2,
    touchEvents,
    pointerEvents,
    eventOptions,
};
