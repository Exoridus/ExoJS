/**
 * Root index type-level export inventory.
 *
 * Uses the TypeScript compiler API to enumerate ALL symbols exported from
 * src/index.ts — including interfaces, type aliases, and const enums that are
 * erased at runtime and therefore invisible in the runtime snapshot gate
 * (test/core/root-index-snapshot.test.ts).
 *
 * Together the two tests cover the full export surface:
 *   - root-index-snapshot        → 229 runtime-visible exports
 *   - root-index-type-inventory  → 332 TypeScript-level exports (superset)
 *
 * To update after an intentional export change:
 *   npm test -- --updateSnapshot
 *   npx jest root-index-type-inventory --updateSnapshot
 */

import * as ts from 'typescript';
import * as path from 'path';

describe('root index type-level export inventory', () => {
    test('all exported symbols with kind annotations match committed snapshot', () => {
        const rootDir = path.resolve(__dirname, '../..');
        const tsconfigPath = path.join(rootDir, 'tsconfig.json');
        const indexPath = path.join(rootDir, 'src', 'index.ts');

        const configResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        if (configResult.error) {
            throw new Error(
                `Failed to read tsconfig.json: ${ts.flattenDiagnosticMessageText(configResult.error.messageText, '\n')}`,
            );
        }

        const parsedConfig = ts.parseJsonConfigFileContent(
            configResult.config,
            ts.sys,
            path.dirname(tsconfigPath),
        );

        // isolatedModules is a ts-jest per-file concern; disable it so the full
        // program can resolve re-exports across files via export *.
        const program = ts.createProgram({
            rootNames: [indexPath],
            options: { ...parsedConfig.options, isolatedModules: false },
        });

        const checker = program.getTypeChecker();

        // TypeScript normalises internal paths to forward slashes on all
        // platforms, so normalise our search key to match.
        const sourceFile = program
            .getSourceFiles()
            .find(sf => sf.fileName.replace(/\\/g, '/').endsWith('/src/index.ts'));

        if (!sourceFile) {
            throw new Error(`Could not locate src/index.ts in the TypeScript program (looked for path ending in /src/index.ts).`);
        }

        const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
        if (!moduleSymbol) {
            throw new Error('TypeScript checker returned no module symbol for src/index.ts.');
        }

        const allExports = checker.getExportsOfModule(moduleSymbol);

        // Produce a sorted "Name: kind" string per export — one entry per line
        // in the snapshot, easy to scan in PR diffs.
        const inventory = allExports
            .map(sym => {
                // Resolve export aliases so we classify the underlying declaration,
                // not the re-export wrapper created by export *.
                const resolved = sym.flags & ts.SymbolFlags.Alias
                    ? checker.getAliasedSymbol(sym)
                    : sym;
                return `${sym.getName()}: ${classifySymbol(resolved)}`;
            })
            .sort();

        expect(inventory).toMatchSnapshot();
    });
});

function classifySymbol(sym: ts.Symbol): string {
    const f = sym.flags;
    // Class covers both abstract and concrete classes; both produce runtime values.
    if (f & ts.SymbolFlags.Class) return 'class';
    // Regular enums compile to runtime objects; const enums are fully erased.
    if (f & ts.SymbolFlags.RegularEnum) return 'enum';
    if (f & ts.SymbolFlags.ConstEnum) return 'const enum';
    if (f & ts.SymbolFlags.Interface) return 'interface';
    if (f & ts.SymbolFlags.TypeAlias) return 'type alias';
    if (f & ts.SymbolFlags.Function) return 'function';
    if ((f & ts.SymbolFlags.BlockScopedVariable) || (f & ts.SymbolFlags.FunctionScopedVariable)) {
        return 'variable';
    }
    return 'unknown';
}
