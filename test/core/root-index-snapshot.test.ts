/**
 * Root export surface snapshot gate.
 *
 * Captures every runtime-visible export name from the root barrel and
 * compares against the committed Jest snapshot. The test fails whenever
 * exports are added or removed, forcing the change to be deliberate.
 *
 * To update the snapshot after an intentional export change:
 *   npm test -- --updateSnapshot
 * or:
 *   npx jest root-index-snapshot --updateSnapshot
 *
 * Note: only runtime-visible names appear here (classes, functions, enums,
 * const objects). Pure TypeScript interfaces and type aliases are erased at
 * compile time and do not show up in Object.keys() output.
 */

describe('root index export surface snapshot', () => {
    test('sorted runtime export names match committed snapshot', () => {
        const exo = require('../../src/index') as Record<string, unknown>;
        const sortedKeys = Object.keys(exo).sort();

        expect(sortedKeys).toMatchSnapshot();
    });
});
