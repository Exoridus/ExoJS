import SceneNode from '../core/SceneNode';

/**
 * @class Drawable
 * @extends SceneNode
 */
export default class Drawable extends SceneNode {

    /**
     * @public
     * @chainable
     * @param {RenderManager} renderManager
     * @returns {Drawable}
     */
    render(renderManager) {
        throw new Error('Method not implemented!');
    }
}
