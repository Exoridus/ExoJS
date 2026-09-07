import { RuleTester } from 'eslint';

import { noDeprecatedApi } from '../src/rules/no-deprecated-api.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest
// globals this project enables) - it must run at the top level, not nested
// inside another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

const options = [{ source: '@codexo/exojs', deprecated: { Old: 'Use New instead.' } }];

ruleTester.run('no-deprecated-api', noDeprecatedApi, {
  valid: [
    // Nothing configured as deprecated - the rule stays quiet, which is its
    // real state today: no engine symbol carries @deprecated yet.
    { code: "import { Foo } from '@codexo/exojs';", options: [{ source: '@codexo/exojs', deprecated: {} }] },
    // Imported name is not in the table.
    { code: "import { Fine } from '@codexo/exojs';", options },
    // Same name, but from a package the rule was not configured for.
    { code: "import { Old } from 'unrelated-package';", options },
    // Default import - the rule only tracks named specifiers.
    { code: "import Old from '@codexo/exojs';", options },
    // Documented limitation: a namespace import's member access is not
    // tracked, only named import specifiers.
    { code: "import * as Exo from '@codexo/exojs';\nExo.Old();", options },
  ],
  invalid: [
    {
      code: "import { Old } from '@codexo/exojs';",
      options,
      errors: [{ messageId: 'deprecated', data: { name: 'Old', reason: 'Use New instead.' } }],
    },
    {
      // The deprecation follows the imported (original) name, not a local alias.
      code: "import { Old as Renamed } from '@codexo/exojs';",
      options,
      errors: [{ messageId: 'deprecated', data: { name: 'Old', reason: 'Use New instead.' } }],
    },
    {
      // Subpath imports match the configured base package.
      code: "import { Old } from '@codexo/exojs/extensions';",
      options,
      errors: [{ messageId: 'deprecated', data: { name: 'Old', reason: 'Use New instead.' } }],
    },
    {
      // Only the deprecated specifier in a mixed import is reported.
      code: "import { Old, Fine } from '@codexo/exojs';",
      options,
      errors: [{ messageId: 'deprecated', data: { name: 'Old', reason: 'Use New instead.' } }],
    },
  ],
});
