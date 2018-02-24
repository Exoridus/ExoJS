import Signal from '../core/Signal';
import ResourceCollection from './ResourceCollection';
import ArrayBufferFactory from './factories/ArrayBufferFactory';
import BlobFactory from './factories/BlobFactory';
import FontFactory from './factories/FontFactory';
import ImageFactory from './factories/ImageFactory';
import JSONFactory from './factories/JSONFactory';
import MusicFactory from './factories/MusicFactory';
import SoundFactory from './factories/SoundFactory';
import TextFactory from './factories/TextFactory';
import TextureFactory from './factories/TextureFactory';
import VideoFactory from './factories/VideoFactory';
import SVGFactory from './factories/SVGFactory';

/**
 * @class Loader
 */
export default class Loader {

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {String} [options.resourcePath='']
     * @param {String} [options.method='GET']
     * @param {String} [options.mode='cors']
     * @param {String} [options.cache='default']
     * @param {Database} [options.database=null]
     */
    constructor({
        resourcePath = '',
        method = 'GET',
        mode = 'cors',
        cache = 'default',
        database = null,
    } = {}) {

        /**
         * @private
         * @member {String}
         */
        this._resourcePath = resourcePath;

        /**
         * @private
         * @member {Map<String, ResourceFactory>}
         */
        this._factories = new Map();

        /**
         * @private
         * @member {ResourceCollection}
         */
        this._resources = new ResourceCollection();

        /**
         * @private
         * @member {Object[]}
         */
        this._queue = [];

        /**
         * @private
         * @member {String}
         */
        this._method = method;

        /**
         * @private
         * @member {String}
         */
        this._mode = mode;

        /**
         * @private
         * @member {String}
         */
        this._cache = cache;

        /**
         * @private
         * @member {?Database|?IDBDatabase}
         */
        this._database = database;

        /**
         * @private
         * @member {Signal}
         */
        this._onQueueResource = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onStartLoading = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onLoadResource = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onFinishLoading = new Signal();

        this._addFactories();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, ResourceFactory>}
     */
    get factories() {
        return this._factories;
    }

    /**
     * @public
     * @readonly
     * @member {Object[]}
     */
    get queue() {
        return this._queue;
    }

    /**
     * @public
     * @readonly
     * @member {ResourceCollection}
     */
    get resources() {
        return this._resources;
    }

    /**
     * @public
     * @member {String}
     */
    get resourcePath() {
        return this._resourcePath;
    }

    set resourcePath(resourcePath) {
        this._resourcePath = resourcePath;
    }

    /**
     * @public
     * @member {?Database}
     */
    get database() {
        return this._database;
    }

    set database(database) {
        this._database = database;
    }

    /**
     * @public
     * @member {String}
     */
    get method() {
        return this._method;
    }

    set method(method) {
        this._method = method;
    }

    /**
     * @public
     * @member {String}
     */
    get mode() {
        return this._mode;
    }

    set mode(mode) {
        this._mode = mode;
    }

    /**
     * @public
     * @member {String}
     */
    get cache() {
        return this._cache;
    }

    set cache(cache) {
        this._cache = cache;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onQueueResource() {
        return this._onQueueResource;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onLoadResource() {
        return this._onLoadResource;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStartLoading() {
        return this._onStartLoading;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onFinishLoading() {
        return this._onFinishLoading;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {ResourceFactory} factory
     * @returns {Loader}
     */
    addFactory(type, factory) {
        this._factories.set(type, factory);

        return this;
    }

    /**
     * @public
     * @param {String} type
     * @returns {ResourceFactory}
     */
    getFactory(type) {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        return this._factories.get(type);
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {Object|String} itemsOrName
     * @param {Object|String} [optionsOrPath]
     * @param {Object} [options]
     * @returns {Loader}
     */
    add(type, itemsOrName, optionsOrPath, options) {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        if (typeof itemsOrName === 'object') {
            for (const [name, path] of Object.entries(itemsOrName)) {
                this._queue.push({ type, name, path, options: optionsOrPath });
                this._onQueueResource.dispatch(this._queue[this._queue.length - 1]);
            }

            return this;
        }

        this._queue.push({ type, name: itemsOrName, path: optionsOrPath, options });
        this._onQueueResource.dispatch(this._queue[this._queue.length - 1]);

        return this;
    }

    /**
     * @public
     * @param {Function} [callback]
     * @returns {Promise<ResourceCollection>}
     */
    async load(callback) {
        const queue = this._queue.splice(0),
            length = queue.length;

        let itemsLoaded = 0;

        if (callback) {
            this._onFinishLoading.once(callback, this);
        }

        this._onStartLoading.dispatch(length, itemsLoaded, queue);

        for (const item of queue) {
            this._onLoadResource.dispatch(length, ++itemsLoaded, await this.loadItem(item));
        }

        this._onFinishLoading.dispatch(length, itemsLoaded, this._resources);

        return this._resources;
    }

    /**
     * @public
     * @param {Object} item
     * @param {String} item.type
     * @param {String} item.name
     * @param {String} item.path
     * @param {Object} [item.options]
     * @returns {Promise<*>}
     */
    async loadItem({ type, name, path, options } = {}) {
        if (!this._resources.has(type, name)) {
            const factory = this.getFactory(type);

            let source = this._database ? (await this._database.load(factory.storageType, name)) : null;

            if (!source) {
                source = await factory.process(await factory.request((this._resourcePath + path), {
                    method: this._method,
                    mode: this._mode,
                    cache: this._cache,
                }));

                if (this._database) {
                    await this._database.save(factory.storageType, name, source);
                }
            }

            this._resources.set(type, name, await factory.create(source, options));
        }

        return this._resources.get(type, name);
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Boolean} [options.signals=true]
     * @param {Boolean} [options.queue=true]
     * @param {Boolean} [options.resources=true]
     * @returns {Loader}
     */
    reset({ signals = true, queue = true, resources = true } = {}) {
        if (signals) {
            this._onQueueResource.clear();
            this._onStartLoading.clear();
            this._onLoadResource.clear();
            this._onFinishLoading.clear();
        }

        if (queue) {
            this._queue.length = 0;
        }

        if (resources) {
            this._resources.clear();
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        for (const factory of this._factories.values()) {
            factory.destroy();
        }

        if (this._database) {
            this._database.destroy();
            this._database = null;
        }

        this._factories.clear();
        this._factories = null;

        this._queue.length = 0;
        this._queue = null;

        this._resources.destroy();
        this._resources = null;

        this._onQueueResource.destroy();
        this._onQueueResource = null;

        this._onStartLoading.destroy();
        this._onStartLoading = null;

        this._onLoadResource.destroy();
        this._onLoadResource = null;

        this._onFinishLoading.destroy();
        this._onFinishLoading = null;

        this._resourcePath = null;
        this._method = null;
        this._mode = null;
        this._cache = null;
    }

    /**
     * @private
     */
    _addFactories() {
        this.addFactory('arrayBuffer', new ArrayBufferFactory());
        this.addFactory('blob', new BlobFactory());
        this.addFactory('font', new FontFactory());
        this.addFactory('music', new MusicFactory());
        this.addFactory('sound', new SoundFactory());
        this.addFactory('video', new VideoFactory());
        this.addFactory('image', new ImageFactory());
        this.addFactory('texture', new TextureFactory());
        this.addFactory('text', new TextFactory());
        this.addFactory('json', new JSONFactory());
        this.addFactory('svg', new SVGFactory());
    }
}
