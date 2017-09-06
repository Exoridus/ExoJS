import EventEmitter from './EventEmitter';

/**
 * @class Scene
 * @extends {Exo.EventEmitter}
 * @memberof Exo
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
         * @member {Exo.Game}
         */
        this._game = null;

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    /**
     * @public
     * @member {Exo.Game}
     */
    get game() {
        return this._game;
    }

    set game(value) {
        this._game = value;
    }

    /**
     * @public
     * @abstract
     * @param {Exo.ResourceLoader} loader
     */
    load(loader) {
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
     * @param {Exo.Time} delta
     */
    update(delta) {
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