import { createSourceFile, forEachChild, isIdentifier, isNewExpression, isStringLiteral, type Node, ScriptTarget } from 'typescript';

import { resolveCatalog } from '../scripts/catalog.ts';
import { renderAll } from '../scripts/generate.ts';

const mediaUrls = (source: string): string[] => {
  const urls: string[] = [];

  const visit = (node: Node): void => {
    if (isNewExpression(node) && isIdentifier(node.expression) && node.expression.text === 'URL') {
      const path = node.arguments?.[0];

      if (path && isStringLiteral(path)) {
        urls.push(path.text);
      }
    }

    forEachChild(node, visit);
  };

  visit(createSourceFile('catalog.ts', source, ScriptTarget.Latest, true));

  return urls;
};

test('an opt-in entry keeps its media in the package but outside the root catalog module', () => {
  const catalog = resolveCatalog();
  const rendered = renderAll({
    ...catalog,
    entries: catalog.entries
      .filter(entry => entry.entrypoint === undefined)
      .map(entry => (entry.key === 'ship' ? { ...entry, entrypoint: 'pixel-vfx' as const } : entry)),
  });

  expect(mediaUrls(rendered['src/standard.generated.ts']!)).not.toContain('../media/images/ship.png');
  expect(mediaUrls(rendered['src/pixel-vfx.generated.ts'] ?? '')).toEqual(['../media/images/ship.png']);

  const manifest = JSON.parse(rendered['manifest.json']!) as {
    entries: Array<{ key: string; profile: string; entrypoint?: string }>;
    files: Array<{ path: string; profile: string }>;
  };

  expect(manifest.entries.find(entry => entry.key === 'ship')).toMatchObject({ profile: 'standard', entrypoint: 'pixel-vfx' });
  expect(manifest.files.find(file => file.path === 'images/ship.png')).toMatchObject({ profile: 'standard' });
});
