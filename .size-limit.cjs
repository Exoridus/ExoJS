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
  {
    path: 'dist/exo.full.iife.min.js',
    limit: '2 MB',
    gzip: true,
  },
];
