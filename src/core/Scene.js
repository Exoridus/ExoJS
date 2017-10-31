import EventEmitter from './EventEmitter';
import SceneNode from './SceneNode';
import Bounds from './Bounds';
import Rectangle from '../math/Rectangle';

/**
 * @class Scene
 * @extends {EventEmitter}
 */
export default class Scene extends EventEmitter {

    /**
     * @constructs Scene
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

        /**
         * @private
         * @member {Bounds}
         */
        this._bounds = new Bounds();

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
     * @readonly
     * @member {Set<SceneNode>}
     */
    get nodes() {
        return this._nodes;
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get bounds() {
        return this.getBounds();
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
            if (node.scene) {
                node.scene.removeNode(node);
            }

            node.scene = this;

            this._nodes.add(node);
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
            node.scene = null;
            this._nodes.delete(node);
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
     * @returns {Rectangle}
     */
    getBounds() {
        this._bounds.reset();

        for (const node of this._nodes) {
            if (node.active) {
                this._bounds.addRect(node.getBounds());
            }
        }

        return this._bounds.getRect();
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
     * @param {ResourceContainer} resources
     */
    init(resources) { // eslint-disable-line
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

        this._bounds.destroy();
        this._bounds = null;

        this._nodes = null;
        this._app = null;
    }
}
