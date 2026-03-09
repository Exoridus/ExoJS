import { Loader } from 'resources/Loader';
import type { IDatabase } from 'types/IDatabase';
import type { IResourceFactory } from 'types/IResourceFactory';
import { ResourceTypes, StorageNames } from 'types/types';

class MockTextFactory implements IResourceFactory<string, string> {
    public readonly storageName = StorageNames.text;
    public readonly process = jest.fn(async (_response: Response): Promise<string> => 'fresh-source');
    public readonly create = jest.fn(async (source: string): Promise<string> => `resource:${source}`);

    public destroy(): void {
        // noop
    }
}

const createDatabase = (): IDatabase => ({
    name: 'test-db',
    version: 1,
    connected: true,
    connect: jest.fn(async (): Promise<boolean> => true),
    disconnect: jest.fn(async (): Promise<boolean> => true),
    load: jest.fn(async (): Promise<any> => null),
    save: jest.fn(async (): Promise<any> => true),
    delete: jest.fn(async (): Promise<boolean> => true),
    clearStorage: jest.fn(async (): Promise<boolean> => true),
    deleteStorage: jest.fn(async (): Promise<boolean> => true),
    destroy: jest.fn(),
});

describe('Loader', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('recovers from invalid cached source and refreshes from network', async () => {
        const database = createDatabase();
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/', database });

        loader.addFactory(ResourceTypes.text, factory);

        (database.load as jest.Mock).mockResolvedValueOnce('stale-source');
        factory.create.mockImplementationOnce(async (): Promise<string> => {
            throw new Error('stale');
        });

        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response));

        const resource = await loader.loadItem({
            type: ResourceTypes.text,
            name: 'demo',
            path: 'demo.txt',
        });

        expect(resource).toBe('resource:fresh-source');
        expect(database.delete).toHaveBeenCalledWith(StorageNames.text, 'demo');
        expect(database.save).toHaveBeenCalledWith(StorageNames.text, 'demo', 'fresh-source');
        expect(factory.create).toHaveBeenCalledTimes(2);
    });

    test('does not cache fetched source when create fails', async () => {
        const database = createDatabase();
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/', database });

        loader.addFactory(ResourceTypes.text, factory);

        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response));

        factory.process.mockResolvedValueOnce('invalid-source');
        factory.create.mockRejectedValueOnce(new Error('invalid'));

        await expect(loader.loadItem({
            type: ResourceTypes.text,
            name: 'broken',
            path: 'broken.txt',
        })).rejects.toThrow('invalid');

        expect(database.save).not.toHaveBeenCalled();
        expect(loader.resources.has(ResourceTypes.text, 'broken')).toBe(false);
    });

    test('throws on non-ok HTTP response', async () => {
        const database = createDatabase();
        const factory = new MockTextFactory();
        const loader = new Loader({ resourcePath: '/', database });

        loader.addFactory(ResourceTypes.text, factory);

        global.fetch = jest.fn(async (): Promise<Response> => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        } as Response));

        await expect(loader.loadItem({
            type: ResourceTypes.text,
            name: 'missing',
            path: 'missing.txt',
        })).rejects.toThrow('404 Not Found');
    });
});
