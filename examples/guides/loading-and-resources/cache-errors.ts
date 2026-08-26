import { Application } from '@codexo/exojs';

// #region guide:cache-errors
const app = new Application();
const { loader } = app;

loader.onCacheError.add(error => {
  console.warn(`cache ${error.operation} failed for ${error.store}`, error.cause);
});
// #endregion guide:cache-errors
