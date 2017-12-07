import EventEmitter from './EventEmitter';

/**
 * @class Scene
 * @extends EventEmitter
 */
export default class Scene extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [prototype]
     * @param {Function} [prototype.load]
     * @param {Function} [prototype.init]
     * @param {Function} [prototype.update]
     * @param {Function} [prototype.draw]
     * @param {Function} [prototype.unload]
     * @param {Function} [prototype.destroy]
     */
    constructor(prototype) {
        super();

        /**
         * @private
         * @member {Application}
         */
        this._app = null;

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    /**
     * @public
     * @member {Application}
     */
    get app() {
        return this._app;
    }

    set app(app) {
        this._app = app;
    }

    /**
     * @public
     * @param {Loader} loader
     */
    load(loader) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @param {ResourceContainer} resources
     */
    init(resources) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @param {RenderManager} renderManager
     */
    draw(renderManager) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     */
    unload() {
        // do nothing
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._app = null;
    }
}
