import type { Rule } from 'eslint';
import type { ClassBody, Identifier, MemberExpression, Node, ObjectExpression, Property, PropertyDefinition } from 'estree';

import { type ClassNode, memberFunction, staticKeyName, walk } from '../ast.js';

const defaultPattern = '^.+V([1-9]\\d*)ToV([1-9]\\d*)$';
const optionsSchema = {
  type: 'object',
  properties: { pattern: { type: 'string' }, runtimeImports: { type: 'array', items: { type: 'string' } } },
  additionalProperties: false,
};
interface Options {
  pattern?: string;
  runtimeImports?: readonly string[];
}
type Bounds = readonly [number, number];

const patternFor = (options?: Options): RegExp => new RegExp(options?.pattern ?? defaultPattern);

const nameBounds = (pattern: RegExp, name: string): Bounds | undefined => {
  const match = pattern.exec(name);
  const from = Number(match?.[1]);
  const to = Number(match?.[2]);

  return Number.isSafeInteger(from) && Number.isSafeInteger(to) ? [from, to] : undefined;
};

const literalNumber = (node: Node | null | undefined): number | undefined =>
  node?.type === 'Literal' && typeof node.value === 'number' && Number.isSafeInteger(node.value) ? node.value : undefined;

const classField = (body: ClassBody, name: string) =>
  body.body.find(
    (member): member is PropertyDefinition =>
      member.type === 'PropertyDefinition' && !member.static && staticKeyName(member.key, member.computed) === name,
  );

const property = (body: ObjectExpression, name: string): Node | undefined =>
  body.properties.find((entry): entry is Property => entry.type === 'Property' && staticKeyName(entry.key, entry.computed) === name)?.value;

export const migrationStep: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [optionsSchema],
    messages: {
      bounds: 'Declare the literal from/to versions in the name, advancing by exactly one.',
      sync: 'A migration must be synchronous.',
    },
  },
  create(context) {
    const pattern = patternFor(context.options[0] as Options | undefined);

    const check = (node: ClassNode): void => {
      const bounds = nameBounds(pattern, node.id?.name ?? '');

      if (bounds === undefined) {
        return;
      }

      const [from, to] = bounds;
      const fields = [classField(node.body, 'from'), classField(node.body, 'to')];
      const missingReadonly =
        /\.[cm]?tsx?$/.test(context.filename) && fields.some(field => !(field as { readonly?: boolean } | undefined)?.readonly);

      if (missingReadonly || to !== from + 1 || literalNumber(fields[0]?.value) !== from || literalNumber(fields[1]?.value) !== to) {
        context.report({ node, messageId: 'bounds' });
      }

      for (const entry of node.body.body) {
        if (entry.type !== 'MethodDefinition' && entry.type !== 'PropertyDefinition') {
          continue;
        }

        const fn = memberFunction(entry);

        if (
          !entry.static &&
          staticKeyName(entry.key, entry.computed) === 'migrate' &&
          fn !== undefined &&
          (fn.async || [...walk(fn.body)].some(nested => nested.type === 'AwaitExpression'))
        ) {
          context.report({ node: entry, messageId: 'sync' });
        }
      }
    };

    return { ClassDeclaration: check, ClassExpression: check };
  },
};

const external = new Set(['fetch', 'Date', 'performance', 'crypto', 'document', 'window', 'navigator']);
const runtimeImports = ['#audio/', '#rendering/', '#assets/Loader', '@codexo/exojs/audio', '@codexo/exojs/rendering'];
const targetRoot = (node: Node): Node => (node.type === 'MemberExpression' ? targetRoot(node.object) : node);
const referenceOf = (source: Rule.RuleContext['sourceCode'], identifier: Identifier) =>
  source.getScope(identifier).references.find(reference => reference.identifier === identifier);

const globalRead = (source: Rule.RuleContext['sourceCode'], identifier: Identifier): boolean => {
  const reference = referenceOf(source, identifier);

  return reference?.isRead() === true && (reference.resolved?.defs.length ?? 0) === 0;
};

const memberName = ({ property: key, computed }: MemberExpression): string | undefined =>
  computed ? (key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined) : staticKeyName(key, false);
const typeOnly = (node: Node): boolean => (node as Node & { importKind?: string }).importKind === 'type';

export const migrationPurity: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [optionsSchema],
    messages: {
      external: 'A migration cannot depend on external or nondeterministic runtime state.',
      mutate: 'Do not mutate the input or migration instance.',
      import: 'Keep runtime-only imports out of a document migration module.',
    },
  },
  create(context) {
    const options = context.options[0] as Options | undefined;
    const pattern = patternFor(options);
    const imports: Node[] = [];
    let hasMigration = false;

    const check = (node: ClassNode): void => {
      if (nameBounds(pattern, node.id?.name ?? '') === undefined) {
        return;
      }

      hasMigration = true;

      for (const entry of node.body.body) {
        if (entry.type !== 'MethodDefinition' && entry.type !== 'PropertyDefinition') {
          continue;
        }

        if (entry.static || (entry.type === 'MethodDefinition' && entry.kind === 'constructor')) {
          continue;
        }

        const fn = memberFunction(entry);

        if (fn === undefined) {
          continue;
        }

        const input =
          staticKeyName(entry.key, entry.computed) === 'migrate' && fn.params[0]?.type === 'Identifier' ? fn.params[0] : undefined;

        for (const child of walk(fn.body)) {
          if (child.type === 'Identifier' && external.has(child.name) && globalRead(context.sourceCode, child)) {
            context.report({ node: child, messageId: 'external' });
          }

          if (child.type === 'MemberExpression') {
            const name = memberName(child);
            const object = child.object;

            if (
              name !== undefined &&
              object.type === 'Identifier' &&
              globalRead(context.sourceCode, object) &&
              ((object.name === 'Math' && name === 'random') || (object.name === 'globalThis' && external.has(name)))
            ) {
              context.report({ node: child, messageId: 'external' });
            }
          }

          const target =
            child.type === 'AssignmentExpression'
              ? child.left
              : child.type === 'UpdateExpression' || (child.type === 'UnaryExpression' && child.operator === 'delete')
                ? child.argument
                : undefined;

          if (target?.type === 'MemberExpression') {
            const root = targetRoot(target);

            if (
              root.type === 'ThisExpression' ||
              (input !== undefined &&
                root.type === 'Identifier' &&
                referenceOf(context.sourceCode, root)?.resolved?.identifiers.includes(input))
            ) {
              context.report({ node: target, messageId: 'mutate' });
            }
          }
        }
      }
    };

    return {
      ClassDeclaration: check,
      ClassExpression: check,
      ImportDeclaration(node) {
        const source = node.source.value;

        if (
          typeof source === 'string' &&
          !typeOnly(node) &&
          (node.specifiers.length === 0 || !node.specifiers.every(typeOnly)) &&
          (options?.runtimeImports ?? runtimeImports).some(prefix => source.startsWith(prefix))
        ) {
          imports.push(node);
        }
      },
      'Program:exit'() {
        if (hasMigration) {
          for (const node of imports) {
            context.report({ node, messageId: 'import' });
          }
        }
      },
    };
  },
};

export const migrationChain: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [optionsSchema],
    messages: { range: 'Provide one ordered migration per version from minVersion through the current version.' },
  },
  create(context) {
    const pattern = patternFor(context.options[0] as Options | undefined);
    const histories: ObjectExpression[] = [];

    const readBounds = (callee: Identifier): Bounds | undefined => {
      const definition = referenceOf(context.sourceCode, callee)?.resolved?.defs[0];

      if (definition?.type === 'ClassName') {
        const from = literalNumber(classField(definition.node.body, 'from')?.value);
        const to = literalNumber(classField(definition.node.body, 'to')?.value);

        return from === undefined || to === undefined ? undefined : [from, to];
      }

      return nameBounds(pattern, callee.name);
    };

    return {
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'DocumentHistory' && node.arguments[0]?.type === 'ObjectExpression') {
          const binding = referenceOf(context.sourceCode, node.callee)?.resolved;
          const definitions = binding?.defs ?? [];
          const imported = definitions.some(
            definition =>
              definition.type === 'ImportBinding' &&
              /^(?:@codexo\/exojs(?:\/|$)|.*\/DocumentHistory(?:\.[cm]?[jt]s)?$)/.test(String(definition.parent.source.value)),
          );

          if (definitions.length === 0 || imported) {
            histories.push(node.arguments[0]);
          }
        }
      },
      'Program:exit'() {
        for (const history of histories) {
          if (history.properties.some(entry => entry.type === 'SpreadElement' || entry.computed)) {
            continue;
          }

          const current = property(history, 'version');
          const version = current === undefined ? 1 : literalNumber(current);
          const oldest = property(history, 'minVersion');
          const min = oldest === undefined ? 1 : literalNumber(oldest);
          const migrations = property(history, 'migrations');

          if (version === undefined || min === undefined || (migrations !== undefined && migrations.type !== 'ArrayExpression')) {
            continue;
          }

          const steps = (migrations?.elements ?? []).map(step =>
            step?.type === 'NewExpression' && step.callee.type === 'Identifier' ? readBounds(step.callee) : undefined,
          );

          if (steps.includes(undefined)) {
            continue;
          }

          if (min < 1 || steps.length !== version - min || steps.some((step, i) => step?.[0] !== min + i || step?.[1] !== min + i + 1)) {
            context.report({ node: history, messageId: 'range' });
          }
        }
      },
    };
  },
};
