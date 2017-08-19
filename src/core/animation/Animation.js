/**
 * @interface Animation
 * @memberof Exo
 */
export default class Animation {

    /**
     * @public
     * @virtual
     * @param {*} animated
     * @param {Number} progress
     */
    apply(animated, progress) {
        // do nothing
    }
}
