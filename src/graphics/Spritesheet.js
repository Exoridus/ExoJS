import Texture from './texture/Texture';
import Rectangle from '../math/Rectangle';
import Sprite from './sprite/Sprite';

/**
 * @class Spritesheet
 */
export default class Spritesheet {

    /**
     * @constructor
     * @param {Texture} texture
     * @param {Object} data
     * @param {Object} data.frames
     * @param {Object} data.frames.frame
     * @param {Number} data.frames.frame.x
     * @param {Number} data.frames.frame.y
     * @param {Number} data.frames.frame.w
     * @param {Number} data.frames.frame.h
     */
    constructor(texture, data) {

        /**
         * @private
         * @type {Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @type {Object<String, Rectangle>}
         */
        this._frames = {};

        /**
         * @private
         * @type {Object<String, Sprite>}
         */
        this._sprites = {};

        this.parse(data);
    }

    /**
     * @public
     * @readonly
     * @member {Texture}
     */
    get texture() {
        return this._texture;
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, Rectangle>}
     */
    get frames() {
        return this._frames;
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, Sprite>}
     */
    get sprites() {
        return this._sprites;
    }

    /**
     * @param {Object} data
     * @param {Object} data.frames
     * @param {Object} data.frames.frame
     * @param {Number} data.frames.frame.x
     * @param {Number} data.frames.frame.y
     * @param {Number} data.frames.frame.w
     * @param {Number} data.frames.frame.h
     * @param {Boolean} [keepFrames=false]
     * @return {Spritesheet}
     */
    parse(data, keepFrames = false) {
        if (!keepFrames) {
            this.clear();
        }

        for (const [name, frame] of Object.entries(data.frames)) {
            this.addFrame(name, frame);
        }

        return this;
    }

    /**
     * @param {String} name
     * @param {Object} data
     * @param {Object} data.frame
     * @param {Number} data.frame.x
     * @param {Number} data.frame.y
     * @param {Number} data.frame.w
     * @param {Number} data.frame.h
     */
    addFrame(name, data) {
        const { x, y, w, h } = data.frame,
            frame = new Rectangle(x, y, w, h),
            sprite = new Sprite(this._texture);

        sprite.setTextureFrame(frame);

        this._frames[name] = frame;
        this._sprites[name] = sprite;
    }

    /**
     * @public
     * @chainable
     * @returns {Spritesheet}
     */
    clear() {
        for (const frame of Object.keys(this._frames)) {
            this._frames[frame].destroy();
            delete this._frames[frame];
        }

        for (const sprite of Object.keys(this._sprites)) {
            this._sprites[sprite].destroy();
            delete this._sprites[sprite];
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.clear();

        this._frames = null;
        this._sprites = null;
        this._texture = null;
    }
}
