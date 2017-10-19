import EventEmitter from '../core/EventEmitter';
import ResourceContainer from './ResourceContainer';
import ArrayBufferFactory from './factory/ArrayBufferFactory';
import AudioBufferFactory from './factory/AudioBufferFactory';
import AudioFactory from './factory/AudioFactory';
import BlobFactory from './factory/BlobFactory';
import FontFactory from './factory/FontFactory';
import ImageFactory from './factory/ImageFactory';
import JSONFactory from './factory/JSONFactory';
import MusicFactory from './factory/MusicFactory';
import SoundFactory from './factory/SoundFactory';
import StringFactory from './factory/StringFactory';
import TextureFactory from './factory/TextureFactory';
import VideoFactory from './factory/VideoFactory';


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

        /**
         * @private
         * @member {?Database}
         */
        this._database = null;

        this.addFactory('arrayBuffer', new ArrayBufferFactory())
            .addFactory('audioBuffer', new AudioBufferFactory())
            .addFactory('audio', new AudioFactory())
            .addFactory('blob', new BlobFactory())
            .addFactory('font', new FontFactory())
            .addFactory('image', new ImageFactory())
            .addFactory('json', new JSONFactory())
            .addFactory('music', new MusicFactory())
            .addFactory('sound', new SoundFactory())
            .addFactory('string', new StringFactory())
            .addFactory('texture', new TextureFactory())
            .addFactory('video', new VideoFactory());
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

    set basePath(basePath) {
        this._basePath = basePath;
    }

    /**
     * @public
     * @member {Object<String, String>}
     */
    get request() {
        return this._request;
    }

    set request(request) {
        this._request = request;
    }

    /**
     * @public
     * @member {?Database}
     */
    get database() {
        return this._database;
    }

    set database(request) {
        this._database = request;
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

        const factory = this.getFactory(type);

        if (this._database) {
            return this._database
                .loadData(factory.storageType, name)
                .then((result) => result.data || factory
                    .request(this._basePath + path, this._request)
                    .then((response) => factory.process(response))
                    .then((data) => this._database
                        .saveData(factory.storageType, name, data)
                        .then((result) => result.data)))
                .then((source) => factory.create(source, options))
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
     * @param {Object<String, String>} list
     * @param {Object} [options]
     * @returns {ResourceLoader}
     */
    addList(type, list, options) {
        for (const [name, path] of Object.entries(list)) {
            this.addItem(type, name, path, options);
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

        this._resources.destroy();
        this._resources = null;

        this._queue.clear();
        this._queue = null;

        this._factories.clear();
        this._factories = null;

        this._basePath = null;
        this._request = null;
    }
}
