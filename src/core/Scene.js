import EventEmitter from './EventEmitter';
import SceneNode from './SceneNode';

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
         * @member {Application}
         */
        this._app = null;

        /**
         * @private
         * @member {Set<SceneNode>}
         */
        this._nodes = new Set();

        if (prototype) {
            Object.assign(this, prototype);
        }
    }

    /**
     * @public
     * @member {Game}
     */
    get app() {
        return this._app;
    }

    set app(app) {
        this._app = app;
    }

    /**
     * @public
     * @readonly
     * @member {Set<SceneNode>}
     */
    get nodes() {
        return this._nodes;
    }

    /**
     * @public
     * @param {SceneNode} node
     * @returns {Boolean}
     */
    hasNode(node) {
        return this._nodes.has(node);
    }

    /**
     * @public
     * @chainable
     * @param {SceneNode} node
     * @returns {Scene}
     */
    addNode(node) {
        if (node.scene !== this) {
            this._nodes.add(node);

            if (node.scene) {
                node.scene.removeNode(node);
            }

            node.scene = this;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {SceneNode} node
     * @returns {Scene}
     */
    removeNode(node) {
        if (node.scene === this) {
            this._nodes.delete(node);

            node.scene = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Scene}
     */
    clearNodes() {
        for (const node of this._nodes) {
            this.removeNode(node);
        }

        return this;
    }

    /**
     * @public
     * @abstract
     * @param {ResourceLoader} loader
     */
    load(loader) { // eslint-disable-line
        this._app.trigger('scene:start');
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

        this.clearNodes();

        this._nodes = null;
        this._app = null;
    }
}
