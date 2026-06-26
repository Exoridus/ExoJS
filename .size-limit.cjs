module.exports = [
  {
    path: 'dist/exo.esm.js',
    limit: '700 KB',
    gzip: true,
  },
  {
    path: 'dist/exo.iife.min.js',
    limit: '250 KB',
    gzip: true,
  },
  // The full bundle (dist/exo.full.iife.min.js) is opt-in (EXOJS_FULL_BUNDLE=1)
  // and not produced by the default build, so it is not size-gated here.
];
