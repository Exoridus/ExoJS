import type { AssetFactory } from './AssetFactory';
import type { CacheStore } from './CacheStore';

export interface CacheRequest {
    readonly storageName: string;
    readonly key: string;
    readonly url: string;
    readonly requestOptions: RequestInit;
    readonly factory: AssetFactory;
}

export interface CacheStrategy {
    resolve(request: CacheRequest, stores: ReadonlyArray<CacheStore>): Promise<unknown>;
}
