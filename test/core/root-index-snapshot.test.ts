/**
 * Root export surface snapshot gate.
 *
 * Captures every runtime-visible export name from the root barrel and
 * compares against the committed Vitest snapshot. The test fails whenever
 * exports are added or removed, forcing the change to be deliberate.
 *
 * To update the snapshot after an intentional export change:
 *   npx vitest run --update
 *
 * Note: only runtime-visible names appear here (classes, functions, enums,
 * const objects). Pure TypeScript interfaces and type aliases are erased at
 * compile time and do not show up in Object.keys() output.
 */

import * as exo from '@/index';

describe('root index export surface snapshot', () => {
  test('sorted runtime export names match committed snapshot', () => {
    const sortedKeys = Object.keys(exo).sort();

    expect(sortedKeys).toMatchSnapshot();
  });
});
