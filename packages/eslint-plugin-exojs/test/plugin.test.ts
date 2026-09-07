import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { exoEngineRulesConfig, exoPlugin, exoRulesConfig } from '../src/index.ts';

const lint = (code: string, config: object[], filename = 'file.ts'): Linter.LintMessage[] => new Linter().verify(code, config as Linter.Config[], filename);

describe('exoPlugin', () => {
  it('addresses the engine rules through a second namespace segment', () => {
    // ESLint splits a rule id at its FIRST slash, so `engine/...` under the
    // `exo` plugin key is a real `exo/engine/...` rule id rather than a naming
    // convention. The fallback if it were not would be a second plugin key.
    const messages = lint('class Effect { getOutputBounds(i, o) { return { x: 0 }; } }', [
      {
        files: ['**/*.ts'],
        plugins: { exo: exoPlugin },
        rules: { 'exo/engine/no-allocation-in-hot-hook': ['error', { methods: ['getOutputBounds'] }] },
      },
    ]);

    expect(messages.map(message => message.ruleId)).toEqual(['exo/engine/no-allocation-in-hot-hook']);
    expect(messages[0]?.fatal).toBeUndefined();
  });
});

describe('exoRulesConfig', () => {
  it('reports a correctness violation at error severity in the default tier', () => {
    const messages = lint('class S { async update(delta) {} }', exoRulesConfig({ files: ['**/*.ts'] }));

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('exo/no-async-update');
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
    expect(messages[0]?.ruleId).toBe('exo/no-deprecated-api');
    expect(messages[0]?.severity).toBe(2);
  });

  it('keeps every correctness rule in the strict tier', () => {
    const messages = lint('class S { async update(delta) {} }', exoRulesConfig({ files: ['**/*.ts'], tier: 'strict' }));

    expect(messages.map(message => message.ruleId)).toEqual(['exo/no-async-update']);
  });

  it('never turns an engine rule on for a consumer', () => {
    for (const tier of ['recommended', 'strict'] as const) {
      const configured = exoRulesConfig({ files: ['**/*.ts'], tier }).flatMap(block => Object.keys(block.rules ?? {}));

      expect(configured.filter(rule => rule.startsWith('exo/engine/'))).toEqual([]);
    }
  });
});

describe('exoEngineRulesConfig', () => {
  it('resolves alongside exoRulesConfig in one config', () => {
    // Both factories register the plugin. ESLint rejects a second registration
    // only when it is a DIFFERENT object, so the same one twice must resolve.
    const config = [...exoRulesConfig({ files: ['**/*.ts'] }), ...exoEngineRulesConfig({ files: ['**/*.ts'], allocationFreeHooks: ['getOutputBounds'] })];
    const messages = lint('class Effect { getOutputBounds(i, o) { return { x: 0 }; } }', config);

    expect(messages.map(message => message.ruleId)).toEqual(['exo/engine/no-allocation-in-hot-hook']);
  });
});
