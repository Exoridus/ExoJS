import EventEmitter from '../core/EventEmitter';
import ResourceContainer from './ResourceContainer';
import * as Types from './types';

/**
 * @class Loader
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Loader extends EventEmitter {

    /**
     * @constructor
     * @param {String} [basePath='']
     */
    constructor(basePath = '') {
        super();

        /**
         * @private
         * @member {Object[]}
         */
        this._queue = [];

        /**
         * @private
         * @member {String}
         */
        this._basePath = basePath;

        /**
         * @private
         * @member {String}
         */
        this._requestQuery = '';

        /**
         * @private
         * @member {Exo.ResourceContainer}
         */
        this._resources = new ResourceContainer();

        /**
         * @private
         * @member {Map<String, Exo.ResourceType>}
         */
        this._types = new Map();

        /**
         * @private
         * @member {Promise|null}
         */
        this._loadingPromise = null;

        /**
         * @private
         * @member {Number}
         */
        this._itemsLoaded = 0;

        this.registerTypes();
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
    get itemsLoaded() {
        return this._itemsLoaded;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get isLoading() {
        return this._loadingPromise !== null;
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
     * @member {String}
     */
    get requestQuery() {
        return this._requestQuery;
    }

    set requestQuery(value) {
        this._requestQuery = value;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {Exo.ResourceType} type
     * @returns {Exo.Loader}
     */
    registerType(name, type) {
        this._types.set(name, type);
        this._resources.addType(name);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Loader}
     */
    registerTypes() {
        return this
            .registerType('arrayBuffer', new Types.ArrayBufferType())
            .registerType('audioBuffer', new Types.AudioBufferType())
            .registerType('audio', new Types.AudioType())
            .registerType('blob', new Types.BlobType())
            .registerType('image', new Types.ImageType())
            .registerType('json', new Types.JSONType())
            .registerType('music', new Types.MusicType())
            .registerType('sound', new Types.SoundType())
            .registerType('sprite', new Types.SpriteType())
            .registerType('text', new Types.TextType())
            .registerType('texture', new Types.TextureType());
    }

    /**
     * @public
     * @returns {Promise}
     */
    load() {
        if (this._loadingPromise) {
            return this._loadingPromise;
        }

        this._itemsLoaded = 0;

        this.trigger('start', this._queue.length);

        this._loadingPromise = this._queue
            .map((item) => this.loadItem(item.type, item.key, item.path))
            .reduce((sequence, promise) => sequence
                .then(() => promise)
                .then((resource) => {
                    this.trigger('progress', resource, ++this._itemsLoaded, this._queue.length);
                }), Promise.resolve())
            .then(() => {
                this._queue.length = 0;

                this.trigger('complete', this._itemsLoaded);
            });

        return this._loadingPromise;
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @param {String} path
     * @returns {Promise}
     */
    loadItem(type, key, path) {
        if (!this._types.has(type)) {
            throw new Error(`Invalid resource type "${type}".`);
        }

        if (this._resources.has(type, key)) {
            return Promise.resolve(this._resources.get(type, key));
        }

        const typeHandler = this._types.get(type);

        if (this._database) {
            return this._database
                .loadData(type, key)
                .then((data) => data ? typeHandler.create(data) : typeHandler.loadSource(this._basePath + path)
                    .then((source) => this._database.saveData(type, key, source)
                        .then(() => typeHandler.create(source))))
                .then((resource) => {
                    this._resources.set(type, key, resource);

                    return resource;
                });
        }

        return typeHandler
            .load(this._basePath + path)
            .then((resource) => {
                this._resources.set(type, key, resource);

                return resource;
            });
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} key
     * @param {String} path
     * @returns {Exo.Loader}
     */
    add(type, key, path) {
        if (!this._types.has(type)) {
            throw new Error(`Invalid resource type "${type}".`);
        }

        this._queue.push({
            path,
            type,
            key,
        });

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {Map<String, String>|Object<String, String>} map
     * @returns {Exo.Loader}
     */
    addList(type, map) {
        if (map instanceof Map) {
            map.forEach((path, key) => {
                this.add(type, key, path);
            });

            return this;
        }

        Object.keys(map)
            .forEach((key) => {
                this.add(type, key, map[key]);
            });

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Loader}
     */
    reset() {
        this._queue.length = 0;
        this._resources.clear();
        this.off('*');

        return this;
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._queue.length = 0;
        this._queue = null;

        this._resources.destroy();
        this._resources = null;

        this._types.clear();
        this._types = null;

        this._loadingPromise = null;
    }
}
