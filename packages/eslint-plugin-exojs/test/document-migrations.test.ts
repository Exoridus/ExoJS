import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { exoPlugin } from '../src/index.ts';

const lint = (rule: string, code: string): string[] =>
  new Linter()
    .verify(code, [{ plugins: { exojs: exoPlugin }, rules: { [`exojs/${rule}`]: 'error' } }])
    .map(message => message.messageId ?? message.message);

describe('document migration authoring', () => {
  it('matches named steps and refuses skipped versions, mismatched fields and async steps', () => {
    expect(lint('migration-step', 'class AtlasV1ToV2 { from = 1; to = 2; migrate(doc) { return { ...doc }; } }')).toEqual([]);
    expect(lint('migration-step', 'class AtlasV1ToV3 { from = 1; to = 3; migrate(doc) { return doc; } }')).toEqual(['bounds']);
    expect(lint('migration-step', 'class AtlasV1ToV2 { from = 2; to = 3; migrate(doc) { return doc; } }')).toEqual(['bounds']);
    expect(lint('migration-step', 'class AtlasV1ToV2 { from = 1; to = 2; async migrate(doc) { return doc; } }')).toEqual(['sync']);
  });

  it('checks that a literal history starts at minVersion and reaches its declared version', () => {
    expect(lint('migration-chain', 'new DocumentHistory({ version: 3, minVersion: 2, migrations: [new AtlasV2ToV3()] });')).toEqual([]);
    expect(lint('migration-chain', 'new DocumentHistory({ version: 3 });')).toEqual(['range']);
    expect(lint('migration-chain', 'new DocumentHistory({ version: 3, migrations: [new AtlasV2ToV3(), new AtlasV1ToV2()] });')).toEqual([
      'range',
    ]);
    expect(lint('migration-chain', 'const protocol = { version: 3 };')).toEqual([]);
  });

  it('rejects external state and mutation but allows writing to a fresh body', () => {
    expect(
      lint('migration-purity', 'class AtlasV1ToV2 { migrate(doc) { const copy = { ...doc }; copy.version = 2; return copy; } }'),
    ).toEqual([]);
    expect(
      lint('migration-purity', "class AtlasV1ToV2 { migrate(doc) { doc.page.width++; this.count = 1; return fetch('atlas'); } }"),
    ).toEqual(['mutate', 'mutate', 'external']);
    expect(
      lint(
        'migration-purity',
        "import { Loader } from '#assets/Loader'; class AtlasV1ToV2 { migrate(doc) { return { ...doc, seed: Math.random() }; } }",
      ),
    ).toEqual(['import', 'external']);
  });

  it('distinguishes local bindings from browser globals', () => {
    expect(
      lint(
        'migration-purity',
        'class AtlasV1ToV2 { migrate(document) { const Math = { random: () => 1 }; return { ...document, seed: Math.random() }; } }',
      ),
    ).toEqual([]);
    expect(lint('migration-purity', 'class AtlasV1ToV2 { migrate(doc) { return globalThis.fetch(doc.source); } }')).toEqual(['external']);
  });

  it('ignores an unrelated local class named DocumentHistory', () => {
    expect(lint('migration-chain', 'class DocumentHistory {} new DocumentHistory({ version: 3 });')).toEqual([]);
    expect(lint('migration-chain', "import {DocumentHistory} from '@codexo/exojs'; new DocumentHistory({version: 3});")).toEqual(['range']);
    expect(lint('migration-chain', 'new DocumentHistory({ version: 3, ...options });')).toEqual([]);
  });
});
