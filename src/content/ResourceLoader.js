import EventEmitter from '../core/EventEmitter';
import ResourceContainer from './ResourceContainer';
import * as Factories from './factory';

/**
 * @class ResourceLoader
 * @extends {EventEmitter}
 */
export default class ResourceLoader extends EventEmitter {

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {String} [options.basePath='']
     */
    constructor({ basePath = '' } = {}) {
        super();

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
         * @member {Map<String, ResourceFactory>}
         */
        this._factories = new Map();

        /**
         * @private
         * @member {String}
         */
        this._basePath = basePath;

        /**
         * @private
         * @member {Object}
         */
        this._request = {
            method: 'GET',
            mode: 'cors',
            cache: 'default',
        };

        this.addFactory('arrayBuffer', new Factories.ArrayBufferFactory())
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
            .addFactory('texture', new Factories.TextureFactory())
            .addFactory('video', new Factories.VideoFactory());
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
    get basePath() {
        return this._basePath;
    }

    set basePath(value) {
        this._basePath = value;
    }

    /**
     * @public
     * @member {Object<String, String>}
     */
    get request() {
        return this._request;
    }

    set request(value) {
        this._request = value;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {ResourceFactory} factory
     * @returns {ResourceLoader}
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
     * @returns {Promise}
     */
    load() {
        const items = [...this._queue];
        let loaded = 0;

        this._queue.clear();

        this.trigger('start', items.length, loaded, items);

        return items
            .map((item) => this.loadItem(item))
            .reduce((sequence, promise) => sequence
                    .then(() => promise)
                    .then((resource) => this.trigger('progress', items.length, ++loaded, resource)),
                Promise.resolve())
            .then(() => this.trigger('complete', items.length, loaded, this._resources));
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

        const factory = this.getFactory(type);

        if (this._database) {
            return this._database
                .loadData(factory.storageType, name)
                .then((data) => data || factory.request(this._basePath + path, this._request)
                    .then((data) => this._database.saveData(factory.storageType, name, data))
                    .then(({ data }) => data))
                .then((data) => factory.create(data, options))
                .then((resource) => {
                    this._resources.set(type, name, resource);

                    return resource;
                });
        }

        return factory
            .load(this._basePath + path, this._request, options)
            .then((resource) => {
                this._resources.set(type, name, resource);

                return resource;
            });
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} name
     * @param {String} path
     * @param {Object} [options]
     * @returns {ResourceLoader}
     */
    addItem(type, name, path, options) {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        this._queue.add({
            type,
            name,
            path,
            options,
        });

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {Map<String, String>|Object<String, String>} list
     * @param {Object} [options]
     * @returns {ResourceLoader}
     */
    addList(type, list, options) {
        const items = (list instanceof Map) ? list : Object.entries(list);

        for (const [name, path] of items) {
            this.addItem(type, name, path, options);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ResourceLoader}
     */
    reset() {
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

        this._queue.clear();
        this._queue = null;

        this._resources.destroy();
        this._resources = null;

        this._factories.clear();
        this._factories = null;

        this._basePath = null;
        this._request = null;
    }
}
