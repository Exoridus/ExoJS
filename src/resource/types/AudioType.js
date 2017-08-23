import BlobType from './BlobType';

const URL = window.URL;

/**
 * @class AudioType
 * @extends {Exo.BlobType}
 * @memberof Exo
 */
export default class AudioType extends BlobType {

    /**
     * @override
     */
    get storageKey() {
        return 'audio';
    }

    /**
     * @override
     */
    loadSource(path, request) {
        return super.loadSource(path, request);
    }

    /**
     * @override
     */
    create(source, { mimeType = 'audio/ogg' } = {}) {
        return super
            .create(source, { mimeType })
            .then((blob) => new Promise((resolve, reject) => {
                const audio = new Audio();

                audio.oncanplaythrough = () => resolve(audio);
                audio.onerror = () => reject(audio);

                audio.src = URL.createObjectURL(blob);
            }));
    }
}
