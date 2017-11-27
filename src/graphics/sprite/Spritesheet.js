import Texture from '../texture/Texture';
import Rectangle from '../../math/Rectangle';
import Sprite from './Sprite';
import { removeItems } from '../../utils';

/**
 * @class Spritesheet
 * @extends Sprite
 */
export default class Spritesheet extends Sprite {

    /**
     * @constructor
     * @param {?Texture|?RenderTexture} texture
     * @param {Object<String, Object>[]} frames
     * @param {String} [startFrame]
     */
    constructor(texture, frames, startFrame) {
        super(texture);

        /**
         * @private
         * @type {Map<String, Rectangle>}
         */
        this._frames = new Map();

        /**
         * @private
         * @type {String[]}
         */
        this._frameNames = [];

        /**
         * @private
         * @type {String}
         */
        this._currentFrame = null;

        this.parse(frames);

        if (startFrame !== undefined) {
            this.setFrame(startFrame);
        } else {
            this.setFrame(this._frameNames[0]);
        }
    }

    /**
     * @param {Object<String, Object>[]} frames
     * @param {Boolean} [clearOldFrames=true]
     * @return {SpriteSheet}
     */
    parse(frames, clearOldFrames = true) {
        if (clearOldFrames) {
            this.clearFrames();
        }

        for (const name of Object.keys(frames)) {
            this.addFrame(name, frames[name]);
        }

        return this;
    }

    /**
     * @param {String} name
     * @param {Object} frame
     * @param {Number} [frame.x]
     * @param {Number} [frame.y]
     * @param {Number} [frame.width]
     * @param {Number} [frame.height]
     * @return {SpriteSheet}
     */
    addFrame(name, { x, y, width, height } = {}) {
        this._frames.set(name, new Rectangle(x, y, width, height));
        this._frameNames.push(name);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @returns {SpriteSheet}
     */
    removeFrame(name) {
        const frame = this.getFrame(name),
            index = this._frameNames.indexOf(name);

        this._frames.delete(name);
        removeItems(this._frameNames, index, 1);
        frame.destroy();

        return this;
    }

    /**
     * @public
     * @param {String} name
     * @returns {Rectangle}
     */
    getFrame(name) {
        if (!this._frames.has(name)) {
            throw new Error(`Spritesheet could not find frame "${name}".`);
        }

        return this._frames.get(name);
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @returns {SpriteSheet}
     */
    setFrame(name) {
        if (this._currentFrame !== name) {
            this._currentFrame = name;
            this.setTextureFrame(this.getFrame(name));
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {SpriteSheet}
     */
    clearFrames() {
        for (const frame of this._frames.values()) {
            frame.destroy();
        }

        this._frames.clear();
        this._frameNames.length = 0;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this.clearFrames();

        this._frames = null;
        this._frameNames = null;
        this._currentFrame = null;
    }
}
