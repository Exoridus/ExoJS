// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { selectSmokeShard } from '../../site/scripts/smoke-shard.ts';

describe('independent example smoke runners', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../examples/examples.json', import.meta.url), 'utf8')) as Record<
    string,
    Array<{ path: string }>
  >;
  const entries = Object.values(catalog).flat();

  it('preserves the complete original catalog and order by default', () => {
    expect(selectSmokeShard(entries)).toEqual(entries);
  });

  it('partitions the real catalog completely and disjointly across three runners', () => {
    const shards = ['1/3', '2/3', '3/3'].map(shard => selectSmokeShard(entries, shard));
    const paths = shards.flat().map(entry => entry.path);

    expect([...paths].sort()).toEqual(entries.map(entry => entry.path).sort());
    expect(new Set(paths).size).toBe(entries.length);
    expect(Math.max(...shards.map(shard => shard.length)) - Math.min(...shards.map(shard => shard.length))).toBeLessThanOrEqual(1);

    for (const shard of shards) {
      expect(shard).toEqual(entries.filter(entry => shard.includes(entry)));
    }
  });

  it('applies to the already chosen sample without adding or losing any of its entries', () => {
    const sample = entries.filter((_entry, index) => index % 7 === 0);
    const union = [...selectSmokeShard(sample, '1/2'), ...selectSmokeShard(sample, '2/2')];

    expect(union.map(entry => entry.path).sort()).toEqual(sample.map(entry => entry.path).sort());
  });

  it.each(['', '1', '0/3', '4/3', '1/0', '-1/3', '1.5/3', '1/3x', '1/9007199254740992', '1/4'])(
    'rejects invalid or empty-producing shard %j',
    shard => {
      expect(() => selectSmokeShard(['a', 'b', 'c'], shard)).toThrow(/shard/i);
    },
  );

  it('never certifies an explicitly sharded empty catalog', () => {
    expect(() => selectSmokeShard([], '1/1')).toThrow(/empty/i);
  });
});
