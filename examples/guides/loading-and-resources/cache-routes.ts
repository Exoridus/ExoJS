import { Application, AssetCache, CacheRoute, IndexedDbStore, type LoaderOptions, MemoryCacheStore, NetworkFirstPolicy } from '@codexo/exojs';

// #region guide:cache-routes
const persistent = new IndexedDbStore('my-game');

const loader: LoaderOptions = {
  cache: new AssetCache({
    read: [new MemoryCacheStore(), persistent],
    write: [persistent],
    promote: true,
    routes: [new CacheRoute({ types: ['com.example.config'], policy: new NetworkFirstPolicy(), stores: persistent })],
  }),
};

const app = new Application({ loader });
// #endregion guide:cache-routes
