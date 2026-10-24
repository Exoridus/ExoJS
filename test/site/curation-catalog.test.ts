// @vitest-environment node
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import curation from '../../docs/curation/catalog.json';
import examples from '../../examples/examples.json';

describe('curated curriculum preservation', () => {
  it('owns exactly 48 unique targets, each with an existing primary source and one batch', () => {
    expect(curation.targets).toHaveLength(48);
    expect(new Set(curation.targets.map(target => target.id)).size).toBe(48);
    expect(new Set(curation.targets.map(target => target.source)).size).toBe(48);
    expect(curation.targets.map(target => target.number)).toEqual(Array.from({ length: 48 }, (_, index) => index + 1));

    for (const target of curation.targets) {
      expect(fs.existsSync(target.source)).toBe(true);
      expect(target.batch).toMatch(/^B[1-6]$/);
      expect(curation.contracts.some(contract => contract.source === target.source && contract.target === target.id)).toBe(true);
    }
  });

  it('retains every one of the 111 original runnable sources and public catalog paths during migration', () => {
    const paths = Object.values(examples)
      .flat()
      .map(example => `examples/${example.path.replace(/\.js$/, '.ts')}`);

    expect(curation.contracts).toHaveLength(111);
    expect(new Set(curation.contracts.map(contract => contract.source)).size).toBe(111);
    expect(curation.contracts.map(contract => contract.source).sort()).toEqual(paths.sort());

    for (const contract of curation.contracts) {
      expect(fs.existsSync(contract.source)).toBe(true);
      expect(fs.existsSync(contract.source.replace(/\.ts$/, '.js'))).toBe(true);
    }

    expect(
      ['retain', 'polish', 'merge', 'guide-tool-test'].map(
        disposition => curation.contracts.filter(contract => contract.disposition === disposition).length,
      ),
    ).toEqual([17, 31, 12, 51]);
  });
});
