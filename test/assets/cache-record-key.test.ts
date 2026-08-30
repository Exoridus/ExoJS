/**
 * A cache record's persistent identity.
 *
 * The `SourceKey` a request resolves to is deliberately type-free, so it alone
 * cannot address a stored representation: two asset types acquiring one URL
 * keep different things. What separates them - and what stops a changed layout
 * from decoding data written under the old one - is the namespace and the
 * layout version in the key.
 */

import { cacheNamespacePrefix, type CacheRecordKey, serializeCacheRecordKey } from '#assets/cache/CacheRecordKey';

const key = (overrides: Partial<CacheRecordKey> = {}): CacheRecordKey => ({
  namespace: 'com.example.world',
  source: 'url:https://assets.test/level.world',
  version: 1,
  record: 'value',
  ...overrides,
});

describe('serializeCacheRecordKey', () => {
  test('is stable across calls, so a record written last session is found in this one', () => {
    expect(serializeCacheRecordKey(key())).toBe(serializeCacheRecordKey(key()));
  });

  test('separates two asset types over one source key', () => {
    const source = 'url:https://assets.test/shared.json';

    expect(serializeCacheRecordKey(key({ namespace: 'type.a', source }))).not.toBe(serializeCacheRecordKey(key({ namespace: 'type.b', source })));
  });

  test('separates two layout versions of one type and source', () => {
    expect(serializeCacheRecordKey(key({ version: 1 }))).not.toBe(serializeCacheRecordKey(key({ version: 2 })));
  });

  test('separates two records of one layout', () => {
    expect(serializeCacheRecordKey(key({ record: 'value' }))).not.toBe(serializeCacheRecordKey(key({ record: 'sidecar' })));
  });

  test('carries the source discriminator, so two variants of one URL stay apart', () => {
    const locator = 'url:https://assets.test/level.world';

    expect(serializeCacheRecordKey(key({ source: `${locator}|de` }))).not.toBe(serializeCacheRecordKey(key({ source: `${locator}|en` })));
  });

  test('a separator inside a namespace cannot spell another key', () => {
    // Without escaping, `{ namespace: 'a|1', version: 2 }` and
    // `{ namespace: 'a', version: 1 }` with a record named '2' would both
    // serialize to "a|1|2|...".
    const collidingA = serializeCacheRecordKey({ namespace: 'a|1', source: 's', version: 2, record: 'value' });
    const collidingB = serializeCacheRecordKey({ namespace: 'a', source: 's', version: 1, record: '2|value' });

    expect(collidingA).not.toBe(collidingB);
  });

  test('an escape character inside a namespace cannot spell another key', () => {
    const escaped = serializeCacheRecordKey({ namespace: '%7C', source: 's', version: 1, record: 'value' });
    const literal = serializeCacheRecordKey({ namespace: '|', source: 's', version: 1, record: 'value' });

    expect(escaped).not.toBe(literal);
  });

  test('every record of one namespace shares that namespace prefix', () => {
    const prefix = cacheNamespacePrefix('com.example.world');

    expect(serializeCacheRecordKey(key()).startsWith(prefix)).toBe(true);
    expect(serializeCacheRecordKey(key({ version: 7, record: 'sidecar' })).startsWith(prefix)).toBe(true);
  });

  test('a namespace prefix does not match a different namespace that starts with the same text', () => {
    expect(serializeCacheRecordKey(key({ namespace: 'com.example.worldly' })).startsWith(cacheNamespacePrefix('com.example.world'))).toBe(false);
  });
});
