import EventEmitter from '../core/EventEmitter';
import ResourceContainer from './ResourceContainer';
import * as Factories from './factory';

/**
 * @class ResourceLoader
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class ResourceLoader extends EventEmitter {

    /**
     * @constructor
     * @param {String} [basePath='']
     */
    constructor(basePath = '') {
        super();

        /**
         * @private
         * @member {Set.<Object>}
         */
        this._queue = new Set();

        /**
         * @private
         * @member {String}
         */
        this._basePath = basePath;

        /**
         * @private
         * @member {Object.<String, String>}
         */
        this._options = {
            method: 'GET',
            mode: 'cors',
            cache: 'default',
        };

        /**
         * @private
         * @member {Exo.ResourceContainer}
         */
        this._resources = new ResourceContainer();

        /**
         * @private
         * @member {Map.<String, Exo.ResourceFactory>}
         */
        this._factories = new Map();

        /**
         * @private
         * @member {?Promise}
         */
        this._promise = null;

        this.addFactories();
    }

    /**
     * @public
     * @readonly
     * @member {Object[]}
     */
    get items() {
        return this._resources;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.ResourceContainer}
     */
    get resources() {
        return this._resources;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get itemsQueued() {
        return this._queue.size;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get itemsLoaded() {
        return this._itemsLoaded;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get isLoading() {
        return this._promise !== null;
    }

    /**
     * @public
     * @member {String}
     */
    get basePath() {
        return this._basePath;
    }

    set basePath(value) {
        this._basePath = value;
    }

    /**
     * @public
     * @member {Object.<String, String>}
     */
    get options() {
        return this._options;
    }

    set options(value) {
        this._options = value;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {Exo.ResourceFactory} factory
     * @returns {Exo.ResourceLoader}
     */
    addFactory(type, factory) {
        this._factories.set(type, factory);
        this._resources.addType(type);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @returns {Exo.ResourceFactory}
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
     * @returns {Exo.ResourceLoader}
     */
    addFactories() {
        return this
            .addFactory('arrayBuffer', new Factories.ArrayBufferFactory())
            .addFactory('audioBuffer', new Factories.AudioBufferFactory())
            .addFactory('audio', new Factories.AudioFactory())
            .addFactory('blob', new Factories.BlobFactory())
            .addFactory('font', new Factories.FontFactory())
            .addFactory('image', new Factories.ImageFactory())
            .addFactory('json', new Factories.JSONFactory())
            .addFactory('music', new Factories.MusicFactory())
            .addFactory('sound', new Factories.SoundFactory())
            .addFactory('sprite', new Factories.SpriteFactory())
            .addFactory('string', new Factories.StringFactory())
            .addFactory('texture', new Factories.TextureFactory());
    }

    /**
     * @public
     * @returns {Promise}
     */
    load() {
        if (this._promise) {
            return this._promise;
        }

        this._promise = Promise.resolve();
        this._itemsLoaded = 0;

        this.trigger('start', this._queue.size, this._itemsLoaded);

        for (const item of this._queue) {
            this._promise
                .then(() => this.loadItem(item))
                .then((resource) => this.trigger('progress', this._queue.size, ++this._itemsLoaded, resource));
        }

        return this._promise.then(() => {
            this._promise = null;
            this._queue.clear();

            this.trigger('complete', this._queue.size, this._itemsLoaded);
        });
    }

    /**
     * @public
     * @param {Object} item
     * @param {String} item.type
     * @param {String} item.name
     * @param {String} item.path
     * @param {Object} item.options
     * @returns {Promise<*>}
     */
    loadItem({ type, name, path, options } = {}) {
        if (this._resources.has(type, name)) {
            return Promise.resolve(this._resources.get(type, name));
        }

        const promise = this._database ? this.loadDatabaseItem({ type, name, path, options }) : this.getFactory(type)
            .load(this._basePath + path, this._options, options);

        return promise.then((resource) => {
            this._resources.set(type, name, resource);

            return resource;
        });
    }

    /**
     * @public
     * @param {Object} item
     * @param {String} item.type
     * @param {String} item.name
     * @param {String} item.path
     * @param {Object} item.options
     * @returns {Promise<*>}
     */
    loadDatabaseItem({ type, name, path, options } = {}) {
        if (!this._database) {
            throw new Error('No database was provided to load from.');
        }

        const factory = this.getFactory(type);

        return this._database
            .loadData(factory.storageType, name)
            .then((data) => data ? Promise.resolve(data) : factory
                .request(this._basePath + path, this._options)
                .then((data) => this._database.saveData(factory.storageType, name, data))
                .then(({ type, name, data }) => data))
            .then((data) => factory.create(data, options));
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} name
     * @param {String} path
     * @param {Object} [options]
     * @returns {Exo.ResourceLoader}
     */
    add(type, name, path, options) {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        this._queue.add({ type, name, path, options });

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {Map.<String, String>|Object.<String, String>} list
     * @param {Object} [options]
     * @returns {Exo.ResourceLoader}
     */
    addList(type, list, options) {
        const items = (list instanceof Map) ? list : Object.entries(list);

        for (const [name, path] of items) {
            this.add(type, name, path, options);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.ResourceLoader}
     */
    reset() {
        this._promise = null;
        this._resources.clear();
        this._queue.clear();
        this.off();

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._resources.destroy();
        this._resources = null;

        this._queue.clear();
        this._queue = null;

        this._factories.clear();
        this._factories = null;

        this._promise = null;
    }
}
