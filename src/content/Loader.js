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
     * @param {String} [options.basePath='']
     * @param {String} [options.method='GET']
     * @param {String} [options.mode='cors']
     * @param {String} [options.cache='default']
     * @param {Database} [options.database=null]
     */
    constructor({
        basePath = '',
        method = 'GET',
        mode = 'cors',
        cache = 'default',
        database = null,
    } = {}) {

        /**
         * @private
         * @member {String}
         */
        this._basePath = basePath;

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
         * @member {ResourceCollection}
         */
        this._resources = new ResourceCollection();

        /**
         * @private
         * @member {Map<String, ResourceFactory>}
         */
        this._factories = new Map([
            ['arrayBuffer', new ArrayBufferFactory()],
            ['blob', new BlobFactory()],
            ['font', new FontFactory()],
            ['music', new MusicFactory()],
            ['sound', new SoundFactory()],
            ['video', new VideoFactory()],
            ['image', new ImageFactory()],
            ['texture', new TextureFactory()],
            ['text', new TextFactory()],
            ['json', new JSONFactory()],
            ['svg', new SVGFactory()],
        ]);
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
     * @param {String} type
     * @param {String} path
     * @param {Object} [options]
     * @returns {Promise<*>}
     */
    async load(type, path, options) {
        if (!this._resources.has(type, path)) {
            const factory = this.getFactory(type);

            let source = this._database ? (await this._database.load(factory.storageType, path)) : null;

            if (!source) {
                source = await factory.process(await factory.request((this._basePath + path), {
                    method: this._method,
                    mode: this._mode,
                    cache: this._cache,
                }));

                if (this._database) {
                    await this._database.save(factory.storageType, path, source);
                }
            }

            this._resources.set(type, path, await factory.create(source, options));
        }

        return this._resources.get(type, path);
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Boolean} [options.signals=true]
     * @param {Boolean} [options.resources=true]
     * @returns {Loader}
     */
    clear() {
        this._resources.clear();

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

        this._resources.destroy();
        this._resources = null;

        this._factories.clear();
        this._factories = null;

        this._basePath = null;
        this._method = null;
        this._mode = null;
        this._cache = null;
    }
}
