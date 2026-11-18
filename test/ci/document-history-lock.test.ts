import { documentVersionHash, verifyDocumentHistory } from '../../scripts/check-document-history';
import { planCi } from '../../scripts/ci/lanes';
import { selectLocalPolicy } from '../../scripts/ci/local-policy';

const declaration = 'export interface AtlasV1 { readonly width: number; }';
const fixture = '{"$type":"atlas","$version":1,"width":32}';
const current = {
  type: 'atlas',
  version: 1,
  name: 'AtlasV1',
  declaration: 'atlas.ts',
  fixture: 'atlas.json',
  sha256: documentVersionHash(declaration, 'AtlasV1', fixture),
};
const read = (path: string): string => (path === 'atlas.ts' ? declaration : fixture);

test('history ignores declaration formatting and JSON key order', () => {
  const equivalent = documentVersionHash(
    '/* release */\nexport interface AtlasV1 {\n  readonly width: number;\n}',
    'AtlasV1',
    '{"width":32,"$version":1,"$type":"atlas"}',
  );
  expect(equivalent).toBe(current.sha256);
  expect(verifyDocumentHistory([current], [current], read)).toEqual([]);
});

test('history detects edits and forbids removing or rehashing a released version', () => {
  const modified = (path: string): string => (path === 'atlas.ts' ? declaration.replace('number', 'string') : fixture);
  expect(verifyDocumentHistory([current], [current], modified)).toHaveLength(1);
  expect(verifyDocumentHistory([current], [], read)).toHaveLength(1);
  const changed = { ...current, sha256: documentVersionHash(modified('atlas.ts'), 'AtlasV1', fixture) };
  expect(verifyDocumentHistory([current], [changed], modified)).toHaveLength(1);
  expect(verifyDocumentHistory([], [changed], modified)).toEqual([]);
});

test('history refuses to move a lock entry to alternate files with the same content', () => {
  const moved = { ...current, declaration: 'moved.ts', fixture: 'moved.json' };
  expect(verifyDocumentHistory([current], [moved], path => (path.endsWith('.ts') ? declaration : fixture))).toHaveLength(1);
});

test('history protects local type declarations a frozen version references transitively', () => {
  const types =
    'interface AtlasBase { size: number; } interface AtlasPage extends AtlasBase { name: string; } export interface AtlasV1 { pages: AtlasPage[]; }';
  expect(documentVersionHash(types, current.name, fixture)).not.toBe(
    documentVersionHash(types.replace('size: number', 'size: string'), current.name, fixture),
  );
});

test('history rejects frozen versions whose shape depends on something outside the file', () => {
  const hash = (source: string): string => documentVersionHash(source, 'AtlasV1', fixture);

  expect(() => hash("import type { Page } from './page'; export interface AtlasV1 { pages: Page[]; }")).toThrow(/not a type declared/);
  expect(() => hash("import * as Shapes from './shapes'; export interface AtlasV1 { page: Shapes.Page; }")).toThrow(/not a type declared/);
  expect(() => hash('enum Kind { A } export interface AtlasV1 { kind: Kind; }')).toThrow(/not a type declared/);
  expect(() => hash('declare const page: object; export interface AtlasV1 { page: typeof page; }')).toThrow(/typeof/);
  expect(() => hash('export interface AtlasV1 { tags: Readonly<Record<string, string>>; }')).not.toThrow();
});

test('hosted and local validation select history checks for lock and registered fixture changes', () => {
  for (const path of ['document-history.lock.json', 'test/fixtures/documents/atlas-v2.json']) {
    expect(planCi({ eventName: 'pull_request', changedFiles: [path], refName: 'document-history' }).gates).toContainEqual(
      expect.objectContaining({ id: 'sync' }),
    );
    expect(selectLocalPolicy([path]).gates).toContain('docs:history:check');
  }
});
