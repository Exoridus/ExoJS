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
    async create(source, { mimeType = determineMimeType(source) } = {}) {
        const arrayBuffer = await super.create(source, null);

        return new Blob([arrayBuffer], { type: mimeType });
    }
}
