import SceneNode from '../core/SceneNode';
import Color from '../core/Color';
import settings from '../settings';
import { BLEND_MODE } from '../const';

/**
 * @class Renderable
 * @extends SceneNode
 */
export default class Renderable extends SceneNode {

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Renderable}
     */
    render(displayManager) {
        throw new Error('Method not implemented!');
    }
}
