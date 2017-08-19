/**
 * @interface Animator
 * @memberof Exo
 */
export default class Animator {

    /**
     * @public
     * @virtual
     * @param {String} name
     * @param {Exo.Animation} animation
     * @param {Number} duration
     */
    addAnimation(name, animation, duration) {
        // do nothing
    }
}
