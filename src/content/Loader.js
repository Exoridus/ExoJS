import EventEmitter from '../core/EventEmitter';
import ResourceContainer from './ResourceContainer';
import ArrayBufferFactory from './factories/ArrayBufferFactory';
import BlobFactory from './factories/BlobFactory';
import FontFactory from './factories/FontFactory';
import ImageFactory from './factories/ImageFactory';
import JSONFactory from './factories/JSONFactory';
import MusicFactory from './factories/MusicFactory';
import SoundFactory from './factories/SoundFactory';
import TextFactory from './factories/TextFactory';
import TextureFactory from './factories/TextureFactory';
import MediaSourceFactory from './factories/MediaSourceFactory';
import VideoFactory from './factories/VideoFactory';
import settings from '../settings';

/**
 * @class Loader
 * @extends EventEmitter
 */
export default class Loader extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {String} [options.resourcePath='']
     * @param {Database} [options.database=null]
     * @param {String} [options.method=settings.REQUEST_METHOD]
     * @param {String} [options.mode=settings.REQUEST_MODE]
     * @param {String} [options.cache=settings.REQUEST_CACHE]
     */
    constructor({
        resourcePath = '',
        database = null,
        method = settings.REQUEST_METHOD,
        mode = settings.REQUEST_MODE,
        cache = settings.REQUEST_CACHE,
    } = {}) {
        super();

        /**
         * @private
         * @member {String}
         */
        this._resourcePath = resourcePath;

        /**
         * @private
         * @member {?Database}
         */
        this._database = database;

        /**
         * @private
         * @member {Map<String, ResourceFactory>}
         */
        this._factories = new Map();

        /**
         * @private
         * @member {Set<Object>}
         */
        this._queue = new Set();

        /**
         * @private
         * @member {ResourceContainer}
         */
        this._resources = new ResourceContainer();

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
     * @member {Set<Object>}
     */
    get queue() {
        return this._queue;
    }

    /**
     * @public
     * @readonly
     * @member {ResourceContainer}
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
     * @chainable
     * @param {String} type
     * @param {ResourceFactory} factory
     * @returns {Loader}
     */
    addFactory(type, factory) {
        this._factories.set(type, factory);
        this._resources.addType(type);

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
     * @param {Object<String, String>|String} itemsOrName
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
                this._queue.add({ type, name, path, options: optionsOrPath });
            }

            return this;
        }

        this._queue.add({ type, name: itemsOrName, path: optionsOrPath, options });

        return this;
    }

    /**
     * @public
     * @param {Function} [callback]
     * @returns {Promise}
     */
    load(callback) {
        const items = [...this._queue];

        let loaded = 0;

        if (callback) {
            this.once('complete', callback, this);
        }

        this._queue.clear();

        this.trigger('start', items.length, loaded, items);

        return items
            .map((item) => this.loadItem(item))
            .reduce((sequence, promise) => sequence
                .then(() => promise)
                .then((resource) => this.trigger('progress', items.length, ++loaded, items, resource)),
            Promise.resolve())
            .then(() => this.trigger('complete', items.length, loaded, items, this._resources));
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
    loadItem({ type, name, path, options } = {}) {
        if (this._resources.has(type, name)) {
            return Promise.resolve(this._resources.get(type, name));
        }

        const factory = this.getFactory(type),
            completePath = this._resourcePath + path,
            request = {
                method: this._method,
                mode: this._mode,
                cache: this._cache,
            };

        if (this._database) {
            return this._database
                .load(factory.storageType, name)
                .then((result) => result.data || factory
                    .request(completePath, request)
                    .then((response) => factory.process(response))
                    .then((data) => this._database
                        .save(factory.storageType, name, data)
                        .then((result) => result.data)))
                .then((source) => factory.create(source, options))
                .then((resource) => {
                    this._resources.set(type, name, resource);

                    return resource;
                });
        }

        return factory
            .load(completePath, request, options)
            .then((resource) => {
                this._resources.set(type, name, resource);

                return resource;
            });
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Boolean} [options.events=true]
     * @param {Boolean} [options.queue=true]
     * @param {Boolean} [options.resources=true]
     * @returns {Loader}
     */
    clear({ events = true, queue = true, resources = true } = {}) {
        if (events) {
            this.off('*');
        }

        if (queue) {
            this._queue.clear();
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
        super.destroy();

        for (const factory of this._factories.values()) {
            factory.destroy();
        }

        if (this._database) {
            this._database.destroy();
            this._database = null;
        }

        this._factories.clear();
        this._factories = null;

        this._queue.clear();
        this._queue = null;

        this._resources.destroy();
        this._resources = null;

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
        this.addFactory('mediaSource', new MediaSourceFactory());
        this.addFactory('blob', new BlobFactory());
        this.addFactory('font', new FontFactory());
        this.addFactory('music', new MusicFactory());
        this.addFactory('sound', new SoundFactory());
        this.addFactory('video', new VideoFactory());
        this.addFactory('image', new ImageFactory());
        this.addFactory('texture', new TextureFactory());
        this.addFactory('text', new TextFactory());
        this.addFactory('json', new JSONFactory());
    }
}
