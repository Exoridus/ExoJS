import { IndexedDbStore, Loader } from '@codexo/exojs';

// #region guide:standalone-loader
const loader = new Loader({
  basePath: '/assets/',
  cache: new IndexedDbStore('my-game'),
});
// #endregion guide:standalone-loader
