import EventEmitter from './EventEmitter';

/**
 * @class Scene
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Scene extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Function} [options.load]
     * @param {Function} [options.init]
     * @param {Function} [options.update]
     * @param {Function} [options.unload]
     * @param {Function} [options.destroy]
     * @param {*} [options.context]
     */
    constructor(options) {
        super();

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = null;

        if (options) {
            const context = options.context || this;

            if (typeof options.load === 'function') {
                this.load = options.load.bind(context);
            }

            if (typeof options.init === 'function') {
                this.init = options.init.bind(context);
            }

            if (typeof options.update === 'function') {
                this.update = options.update.bind(context);
            }

            if (typeof options.unload === 'function') {
                this.unload = options.unload.bind(context);
            }

            if (typeof options.destroy === 'function') {
                this.destroy = options.destroy.bind(context);
            }
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
