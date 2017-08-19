import BlendMode from '../display/BlendMode';

const context = window.WebGLRenderingContext,
    one = context.ONE,
    srcAlpha = context.SRC_ALPHA,
    dstAlpha = context.DST_ALPHA,
    oneMinusSrcAlpha = context.ONE_MINUS_SRC_ALPHA,
    BlendModeSourceOver = new BlendMode(one, oneMinusSrcAlpha, 'source-over'),
    BlendModeAdd = new BlendMode(srcAlpha, dstAlpha, 'lighter'),
    BlendModeMultiply = new BlendMode(dstAlpha, oneMinusSrcAlpha, 'multiply'),
    BlendModeScreen = new BlendMode(srcAlpha, one, 'screen'),
    BlendModeOverlay = new BlendMode(one, oneMinusSrcAlpha, 'overlay'),
    BlendModeDarken = new BlendMode(one, oneMinusSrcAlpha, 'darken'),
    BlendModeLighten = new BlendMode(one, oneMinusSrcAlpha, 'lighten'),
    BlendModeColorDodge = new BlendMode(one, oneMinusSrcAlpha, 'color-dodge'),
    BlendModeColorBurn = new BlendMode(one, oneMinusSrcAlpha, 'color-burn'),
    BlendModeHardLight = new BlendMode(one, oneMinusSrcAlpha, 'hard-light'),
    BlendModeSoftLight = new BlendMode(one, oneMinusSrcAlpha, 'soft-light'),
    BlendModeDifference = new BlendMode(one, oneMinusSrcAlpha, 'difference'),
    BlendModeExclusion = new BlendMode(one, oneMinusSrcAlpha, 'exclusion'),
    BlendModeHue = new BlendMode(one, oneMinusSrcAlpha, 'hue'),
    BlendModeSaturation = new BlendMode(one, oneMinusSrcAlpha, 'saturation'),
    BlendModeColor = new BlendMode(one, oneMinusSrcAlpha, 'color'),
    BlendModeLuminosity = new BlendMode(one, oneMinusSrcAlpha, 'luminosity');

/**
 * @class BlendModes
 * @memberof Exo
 */
export default class BlendModes {

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Default() {
        return BlendModeSourceOver;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get SourceOver() {
        return BlendModeSourceOver;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Add() {
        return BlendModeAdd;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Multiply() {
        return BlendModeMultiply;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Screen() {
        return BlendModeScreen;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Overlay() {
        return BlendModeOverlay;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Darken() {
        return BlendModeDarken;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Lighten() {
        return BlendModeLighten;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get ColorDodge() {
        return BlendModeColorDodge;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get ColorBurn() {
        return BlendModeColorBurn;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get HardLight() {
        return BlendModeHardLight;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get SoftLight() {
        return BlendModeSoftLight;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Difference() {
        return BlendModeDifference;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Exclusion() {
        return BlendModeExclusion;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Hue() {
        return BlendModeHue;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Saturation() {
        return BlendModeSaturation;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Color() {
        return BlendModeColor;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Exo.BlendMode}
     */
    static get Luminosity() {
        return BlendModeLuminosity;
    }
}
