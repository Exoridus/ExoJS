import SceneNode from '../core/SceneNode';

/**
 * @class Drawable
 * @extends SceneNode
 */
export default class Drawable extends SceneNode {

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Drawable}
     */
    render(displayManager) {
        throw new Error('Method not implemented!');
    }
}
