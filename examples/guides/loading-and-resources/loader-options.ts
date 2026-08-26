import { Application, IndexedDbStore, type LoaderOptions } from '@codexo/exojs';

// #region guide:loader-options
const loader: LoaderOptions = {
  basePath: '/assets/',
  cache: new IndexedDbStore('my-game'),
};

const app = new Application({ loader });
// #endregion guide:loader-options
