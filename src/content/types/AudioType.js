import BlobType from './BlobType';

/**
 * @class AudioType
 * @memberof Exo
 * @extends {Exo.BlobType}
 * @implements {Exo.ResourceType}
 */
export default class AudioType extends BlobType {

    /**
     * @override
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return super.loadSource(path);
    }

    /**
     * @override
     * @param {ArrayBuffer} source
     * @returns {Promise}
     */
    create(source) {
        return super.create(source, 'audio/ogg').then((blob) => new Promise((resolve, reject) => {
            const audio = new Audio();

            audio.oncanplaythrough = () => resolve(audio);
            audio.onerror = () => reject(audio);

            audio.src = window.URL.createObjectURL(blob);
        }));
    }
}
