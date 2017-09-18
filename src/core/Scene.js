import EventEmitter from './EventEmitter';

/**
 * @class Scene
 * @extends {EventEmitter}
 */
export default class Scene extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [prototype]
     * @param {Function} [prototype.load]
     * @param {Function} [prototype.init]
     * @param {Function} [prototype.update]
     * @param {Function} [prototype.unload]
     * @param {Function} [prototype.destroy]
     */
    constructor(prototype) {
        super();

        /**
         * @private
         * @member {Game}
         */
        this._game = null;

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    /**
     * @public
     * @member {Game}
     */
    get game() {
        return this._game;
    }

    set game(game) {
        this._game = game;
    }

    /**
     * @public
     * @abstract
     * @param {ResourceLoader} loader
     */
    load(loader) { // eslint-disable-line
        this._game.trigger('scene:start');
    }

    /**
     * @public
     * @abstract
     */
    init() {
        // do nothing
    }

    /**
     * @public
     * @abstract
     * @param {Time} delta
     */
    update(delta) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @abstract
     */
    unload() {
        // do nothing
    }

    /**
     * @public
     * @abstract
     */
    destroy() {
        super.destroy();

        this._game = null;
    }
}
