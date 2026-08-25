// Shared ESLint policy for the ExoJS monorepo. Each factory returns flat-config
// objects for one code category; the caller supplies the file globs and the
// project-service root, so the SAME rule set can be applied from the repository
// root and from a package that lints itself.
//
// Rules live here rather than in the root config because they are policy, not
// repository layout: an extension package's source is held to the same standard
// whichever config file happens to be nearest to it on disk.

import vitest from '@vitest/eslint-plugin';

/**
 * Vitest test-quality rules. Layered on top of a structural test config rather
 * than replacing it.
 * @param {{ files: string[] }} options
 * @returns {object[]}
 */
export function vitestConfig({ files }) {
  return [

  // Vitest test-quality rules: the recommended set + `no-focused-tests` promoted
  // to error so an accidentally committed `.only` fails CI. Layered on top of the
  // structural test config above; covers both root and package test suites.
  {
    ...vitest.configs.recommended,
    files,
    rules: {
      ...vitest.configs.recommended.rules,
      // Primary value: block an accidentally committed `.only`.
      'vitest/no-focused-tests': 'error',
      // 27 deliberate device-conditional skips (WebGPU adapter / device-loss
      // guards). Keep them visible but non-blocking rather than churn them.
      'vitest/no-disabled-tests': 'error',
      // False positives in this suite, kept off:
      //  - expect-expect: assertions run through shared helpers (mountControls,
      //    renderText, ...) the rule cannot see (148 hits).
      //  - no-conditional-expect / no-standalone-expect: browser tests use
      //    `if (!device) return` skip guards and assert via helpers.
      //  - valid-title: parametrised `test(name, ...)` over a case array.
      'vitest/expect-expect': 'off',
      'vitest/no-conditional-expect': 'off',
      'vitest/no-standalone-expect': 'off',
      'vitest/valid-title': 'off',
    },
  },

  ];
}
