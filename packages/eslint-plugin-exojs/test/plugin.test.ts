import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { exoEnginePlugin, exoEngineRulesConfig, exoPlugin, exoRulesConfig } from '../src/index.ts';

const lint = (code: string, config: object[], filename = 'file.ts'): Linter.LintMessage[] => new Linter().verify(code, config as Linter.Config[], filename);

const ALLOCATING_HOOK = 'class Effect { getOutputBounds(i, o) { return { x: 0 }; } }';

describe('plugin keys', () => {
  it('addresses the consumer rules under the package name', () => {
    const messages = lint('class S { async update(delta) {} }', [
      {
        files: ['**/*.ts'],
        plugins: { exojs: exoPlugin },
        rules: { 'exojs/no-async-update': 'error' },
      },
    ]);

    expect(messages.map(message => message.ruleId)).toEqual(['exojs/no-async-update']);
    expect(messages[0]?.fatal).toBeUndefined();
  });

  it('addresses the engine rules under their own key', () => {
    const messages = lint(ALLOCATING_HOOK, [
      {
        files: ['**/*.ts'],
        plugins: { 'exojs-engine': exoEnginePlugin },
        rules: { 'exojs-engine/no-allocation-in-hot-hook': ['error', { methods: ['getOutputBounds'] }] },
      },
    ]);

    expect(messages.map(message => message.ruleId)).toEqual(['exojs-engine/no-allocation-in-hot-hook']);
    expect(messages[0]?.fatal).toBeUndefined();
  });

  it('makes an engine rule unreachable without its key, rather than silently inert', () => {
    // This is what the second plugin key buys over a namespace inside the rule
    // name: registering only the consumer plugin does not leave the engine rule
    // switched off, it makes the id invalid.
    expect(() =>
      lint(ALLOCATING_HOOK, [
        {
          files: ['**/*.ts'],
          plugins: { exojs: exoPlugin },
          rules: { 'exojs-engine/no-allocation-in-hot-hook': 'error' },
        },
      ]),
    ).toThrow(/exojs-engine/);
  });

  it('keeps the two rule sets disjoint', () => {
    const consumer = Object.keys(exoPlugin.rules);
    const engine = Object.keys(exoEnginePlugin.rules);

    expect(consumer.filter(name => engine.includes(name))).toEqual([]);
    expect([...consumer, ...engine].filter(name => name.includes('/'))).toEqual([]);
  });
});

describe('exoRulesConfig', () => {
  it('reports a correctness violation at error severity in the default tier', () => {
    const messages = lint('class S { async update(delta) {} }', exoRulesConfig({ files: ['**/*.ts'] }));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('exojs/no-async-update');
    expect(messages[0]?.severity).toBe(2);
  });

  it('leaves the migration rule off in the recommended tier', () => {
    const deprecatedApi = { Old: 'Use New instead.' };
    const code = "import { Old } from '@codexo/exojs';\nOld();";

    expect(lint(code, exoRulesConfig({ files: ['**/*.ts'], deprecatedApi }))).toHaveLength(0);
  });

  it('adds the migration rule in the strict tier, also at error severity', () => {
    const deprecatedApi = { Old: 'Use New instead.' };
    const messages = lint("import { Old } from '@codexo/exojs';\nOld();", exoRulesConfig({ files: ['**/*.ts'], deprecatedApi, tier: 'strict' }));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('exojs/no-deprecated-api');
    expect(messages[0]?.severity).toBe(2);
  });

  it('keeps every correctness rule in the strict tier', () => {
    const messages = lint('class S { async update(delta) {} }', exoRulesConfig({ files: ['**/*.ts'], tier: 'strict' }));

    expect(messages.map(message => message.ruleId)).toEqual(['exojs/no-async-update']);
  });

  it('never registers the engine plugin for a consumer', () => {
    for (const tier of ['recommended', 'strict'] as const) {
      for (const block of exoRulesConfig({ files: ['**/*.ts'], tier })) {
        expect(Object.keys(block.plugins ?? {})).toEqual(['exojs']);
        expect(Object.keys(block.rules ?? {}).filter(rule => rule.startsWith('exojs-engine/'))).toEqual([]);
      }
    }
  });
});

describe('exoEngineRulesConfig', () => {
  it('registers the engine key and nothing else', () => {
    for (const block of exoEngineRulesConfig({ files: ['**/*.ts'], allocationFreeHooks: ['getOutputBounds'] })) {
      expect(Object.keys(block.plugins ?? {})).toEqual(['exojs-engine']);
    }
  });

  it('resolves alongside exoRulesConfig in one config', () => {
    const config = [...exoRulesConfig({ files: ['**/*.ts'] }), ...exoEngineRulesConfig({ files: ['**/*.ts'], allocationFreeHooks: ['getOutputBounds'] })];
    const messages = lint(ALLOCATING_HOOK, config);

    expect(messages.map(message => message.ruleId)).toEqual(['exojs-engine/no-allocation-in-hot-hook']);
  });
});
