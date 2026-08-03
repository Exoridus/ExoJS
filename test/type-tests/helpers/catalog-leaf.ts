// The catalog-leaf brand, for exact type assertions.
//
// `CatalogResourceLeaf` / `CatalogValueLeaf` are deliberately NOT part of the
// root API — the brand mirrors the internal `_assetMeta` runtime stamp and is an
// implementation detail of the loader's single-leaf overloads. The type tests
// still need to NAME the leaf types to assert them exactly, so they reach the
// internal module through the same `#`-subpath imports the other helpers here
// use, rather than the brand being exported from `@codexo/exojs`.

export type { CatalogResourceLeaf, CatalogValueLeaf } from '#assets/assetMeta';
