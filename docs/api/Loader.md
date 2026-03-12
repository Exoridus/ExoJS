# Loader

`Loader` is the normal resource-loading entrypoint.

## Responsibilities

- queue named resources by `ResourceTypes`
- delegate decoding/creation to typed factories
- populate a `ResourceContainer`
- optionally use a `Database` implementation for persistence

## Normal usage

```ts
await loader
  .add(ResourceTypes.image, { logo: 'images/logo.png' })
  .load()
```

## Key concepts

- `LoaderOptions`
- `ResourceFactory`
- `ResourceContainer`
- `Database`

## Important methods

- `add(type, items, options?)`
- `load(callback?)`
- `loadItem(queueItem)`
- `addFactory(type, factory)`
- `getFactory(type)`
- `reset(...)`
- `destroy()`

## Notes

- resource path prefixing is controlled by `resourcePath`
- persistence is optional and explicit
- loader factories are the type boundary for resource creation

