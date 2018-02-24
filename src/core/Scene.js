/**
 * @class Scene
 */
export default class Scene {

    /**
     * @constructor
     * @param {Object} [prototype]
     * @param {Function} [prototype.create]
     * @param {Function} [prototype.load]
     * @param {Function} [prototype.init]
     * @param {Function} [prototype.update]
     * @param {Function} [prototype.draw]
     * @param {Function} [prototype.unload]
     * @param {Function} [prototype.destroy]
     */
    constructor(prototype) {
        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    /**
     * @public
     * @param {Application} app
     */
    create(app) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;
    }

    /**
     * @public
     * @param {Loader} loader
     */
    async load(loader) { }

    /**
     * @public
     * @param {Application} app
     */
    init(app) { }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) { }

    /**
     * @public
     * @param {RenderManager} renderManager
     */
    draw(renderManager) { }

    /**
     * @public
     */
    unload() { }

    /**
     * @public
     */
    destroy() {
        this._app = null;
    }
}
