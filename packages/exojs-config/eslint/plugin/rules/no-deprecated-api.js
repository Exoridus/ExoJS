// `@typescript-eslint/no-deprecated` already flags every deprecated symbol a
// type-checked program can see - any package, the DOM lib, anything. This
// rule is deliberately narrower and deliberately syntactic: it flags only
// names imported from a configured package (in practice, `@codexo/exojs`),
// and it never asks the type checker anything. The deprecation table is
// generated once, from the engine's own JSDoc `@deprecated` tags (see
// `deprecatedApi.js`), so the rule reads the replacement text that already
// exists at each deprecation site instead of carrying a second, hand-written
// copy that can drift from it.
//
// Import-specifier matching only: `import { Old } from '@codexo/exojs'` and
// `import { Old as New } from '@codexo/exojs'` are both caught (the check is
// against the imported name, not the local binding), but a namespace import
// (`import * as Exo from '@codexo/exojs'; Exo.Old`) is not - nothing in this
// repository or its extension packages imports the engine that way, so
// tracking namespace member access was left out rather than built against no
// real case to measure it on. Add it if that changes.
/**
 * @param {string} configuredSource
 * @param {string} importedFrom
 * @returns {boolean}
 */
const matchesSource = (configuredSource, importedFrom) => importedFrom === configuredSource || importedFrom.startsWith(`${configuredSource}/`);

/** @type {import('eslint').Rule.RuleModule} */
export const noDeprecatedApi = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow importing a symbol from '@codexo/exojs' whose JSDoc marks it @deprecated.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          source: { type: 'string' },
          deprecated: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['source', 'deprecated'],
        additionalProperties: false,
      },
    ],
    messages: {
      deprecated: "'{{name}}' is deprecated. {{reason}}",
    },
  },
  create(context) {
    /** @type {{ source: string, deprecated: Record<string, string> } | undefined} */
    const options = context.options[0];

    if (options === undefined) return {};

    const { source, deprecated } = options;

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string' || !matchesSource(source, node.source.value)) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const importedName = specifier.imported.type === 'Identifier' ? specifier.imported.name : String(specifier.imported.value);
          const reason = Object.hasOwn(deprecated, importedName) ? deprecated[importedName] : undefined;

          if (reason === undefined) continue;

          context.report({ node: specifier.imported, messageId: 'deprecated', data: { name: importedName, reason } });
        }
      },
    };
  },
};
