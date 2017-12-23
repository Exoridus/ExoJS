import ArrayBufferFactory from './ArrayBufferFactory';
import { determineMimeType } from '../../utils/resources';

/**
 * @class BlobFactory
 * @extends ArrayBufferFactory
 */
export default class BlobFactory extends ArrayBufferFactory {

    /**
     * @override
     */
    get storageType() {
        return 'blob';
    }

    /**
     * @override
     */
    create(source, { mimeType = determineMimeType(source) } = {}) {
        return super
            .create(source, null)
            .then((arrayBuffer) => new Blob([arrayBuffer], { type: mimeType }));
    }
}
