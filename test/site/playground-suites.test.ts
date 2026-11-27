// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  assertPlaygroundSuiteResults,
  PLAYGROUND_SUITES,
  type PlaygroundGroup,
  runPlaygroundGroups,
  selectPlaygroundGroups,
} from '../../site/scripts/playground-suites';

const full = [
  'file-tabs',
  'reliability',
  'header',
  'native-controls',
  'responsive-preview',
  'crt',
  'mask',
  'audio-bus',
  'worker',
  'new-tab',
  'example-lifecycle',
  'console',
  'widget-lab',
  'assets',
];

describe('Playground CI suites', () => {
  it('keeps the complete default group order', () => {
    expect(selectPlaygroundGroups()).toEqual(full);
  });

  it('partitions every group exactly once and preserves each suite’s relative order', () => {
    const partitions = PLAYGROUND_SUITES.map(suite => selectPlaygroundGroups(suite));

    expect(partitions.flat().sort()).toEqual([...full].sort());
    expect(new Set(partitions.flat()).size).toBe(full.length);

    for (const partition of partitions) {
      expect(partition).toEqual(full.filter(group => partition.includes(group as PlaygroundGroup)));
    }
  });

  it.each([
    ['shell', ['file-tabs', 'reliability', 'header', 'native-controls', 'responsive-preview', 'new-tab', 'console', 'widget-lab']],
    ['rendering', ['crt', 'mask', 'worker']],
    ['lifecycle', ['audio-bus', 'example-lifecycle']],
    ['assets', ['assets']],
  ])('selects whole stateful groups for %s', (suite, groups) => {
    expect(selectPlaygroundGroups(suite as string)).toEqual(groups);
  });

  it.each(['asset', 'ASSET', 'asset browser', 'ASSET BROWSER previews'])(
    'retains the existing asset diagnostic setup filter for %s',
    only => {
      expect(selectPlaygroundGroups(undefined, only)).toEqual(['widget-lab', 'assets']);
    },
  );

  it.each(['worker', 'used assets', 'not a check'])('leaves substring check filtering to the existing harness for %s', only => {
    expect(selectPlaygroundGroups(undefined, only)).toEqual(full);
  });

  it('combines a suite with the existing asset diagnostic filter', () => {
    expect(selectPlaygroundGroups('assets', 'asset')).toEqual(['assets']);
    expect(selectPlaygroundGroups('shell', 'asset')).toEqual(['widget-lab']);
  });

  it.each(['unknown', 'SHELL', ''])('rejects unknown suite %j', suite => {
    expect(() => selectPlaygroundGroups(suite)).toThrow('Unknown Playground suite');
  });

  it('fails an empty explicit suite while retaining default --only diagnostic behavior', () => {
    expect(() => assertPlaygroundSuiteResults('shell', 0)).toThrow('matched no checks');
    expect(() => assertPlaygroundSuiteResults('shell', 1)).not.toThrow();
    expect(() => assertPlaygroundSuiteResults(undefined, 0)).not.toThrow();
  });

  it('awaits every group before starting the next one', async () => {
    const started: string[] = [];
    const ended: string[] = [];
    let active = 0;
    let peak = 0;
    const handlers = Object.fromEntries(
      full.map(group => [
        group,
        async () => {
          started.push(group);
          peak = Math.max(peak, ++active);
          await setTimeout(1);
          active--;
          ended.push(group);
        },
      ]),
    ) as Record<PlaygroundGroup, () => Promise<void>>;

    await runPlaygroundGroups(selectPlaygroundGroups(), handlers);

    expect(started).toEqual(full);
    expect(ended).toEqual(full);
    expect(peak).toBe(1);
  });

  it('registers every real check group once, including snippet typechecking with its asset producer', () => {
    const file = resolve('site/scripts/playground-e2e.ts');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const owners: string[] = [];
    const registered = new Map<string, string[]>();

    const calls = (node: ts.Node): string[] => {
      const names: string[] = [];

      const visit = (child: ts.Node): void => {
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
          names.push(child.expression.text);
        }

        ts.forEachChild(child, visit);
      };

      visit(node);

      return names;
    };

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }

      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && calls(declaration.initializer).includes('check')) {
          owners.push(declaration.name.text);
        }
      }
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'groups' &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const property of node.initializer.properties) {
          if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
            registered.set(
              property.name.text,
              calls(property.initializer).filter(name => owners.includes(name)),
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
    expect([...registered.keys()]).toEqual(full);
    expect([...registered.values()].flat().sort()).toEqual(owners.sort());
    expect(registered.get('assets')).toEqual(['typecheckSnippets', 'assetChecks']);
  });

  it('rejects an unknown suite in the real CLI before opening a browser or reading a site build', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'site/scripts/playground-e2e.ts', '--suite=shlel', '--origin=invalid'], {
      encoding: 'utf8',
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown Playground suite: shlel');
    expect(result.stderr).not.toContain('Invalid URL');
    expect(result.stderr).not.toContain('Executable doesn’t exist');
  });
});
