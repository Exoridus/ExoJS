import EventEmitter from '../EventEmitter';

/**
 * @class Scene
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Scene extends EventEmitter {

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
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = null;
    }

    /**
     * @public
     * @abstract
     * @param {Exo.Loader} loader 
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
