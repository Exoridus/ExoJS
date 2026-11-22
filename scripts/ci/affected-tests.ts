import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import type { EnvironmentModuleNode } from 'vite';
import type { TestProject, TestSpecification, Vitest } from 'vitest/node';

export interface AffectedTestReason {
  readonly kind: 'dependency' | 'untracked' | 'full' | 'changed-test' | 'setup';
  readonly change?: string;
  readonly path?: string[];
  readonly detail: string;
}

export interface AffectedTestSelection {
  readonly version: 1;
  readonly changedFiles: string[];
  readonly mode: 'related' | 'full';
  readonly fallbackReasons: string[];
  readonly tests: Array<{ project: string; file: string; reasons: AffectedTestReason[] }>;
  readonly inventory: Array<{ project: string; file: string }>;
  readonly durationMs: number;
}

const CODE = /\.[cm]?[jt]sx?$/;
const MODULE = /\.(?:[cm]?[jt]sx?|json|vert|frag|glsl|wgsl)$/;
const CONTENT = /\.mdx?$|(?:^|\/)LICENSE$/;
const GLOBAL =
  /(?:^|\/)(?:package\.json|[^/]*lock[^/]*\.(?:json|ya?ml)|tsconfig[^/]*\.json|[^/]*\.config\.[^/]+)$|^(?:scripts|\.github)\/|^packages\/exojs-(?:build|config)\/|^packages\/exojs-cli\/src\/commands\/assetsPack\.ts$|(?:^|\/)(?:dist|generated)\//;
const SOURCE_TREE = /^(?:src|test|examples)\/|^packages\/[^/]+\/(?:src|test)\/|^site\/src\//;
const VITEST_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.resolve('vitest'))));

const portable = (file: string): string => file.split(sep).join('/');
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const uniquePath = (path: string[]): string[] => path.filter((file, index) => index === 0 || file !== path[index - 1]);
const harnessImport = (specifier: string): boolean => specifier === 'vitest' || specifier.startsWith('vitest/');

interface SourceInputs {
  readonly hazards: string[];
  readonly imports: string[];
}

/** Inspect possible hidden inputs, leaving all module resolution to Vite. */
const sourceInputs = (file: string): SourceInputs => {
  if (!CODE.test(file)) {
    return { hazards: [], imports: [] };
  }

  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
  const hazards = new Set<string>();
  const imports = new Set<string>();

  const module = (specifier: string): void => {
    imports.add(specifier);

    if (/^(?:node:)?(?:fs(?:\/|$)|child_process$|module$)/.test(specifier)) {
      hazards.add(`Reads files or resolves runtime inputs through ${specifier}.`);
    }
  };

  const visit = (node: ts.Node, parent?: ts.Node): void => {
    if (
      ts.isTypeNode(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
      ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node) || ts.isExportDeclaration(node)) && node.isTypeOnly)
    ) {
      return;
    }

    // Blob URL creation/revocation and installing their test doubles do not
    // load repository inputs. Other uses, including a constructor alias, do.
    const blobURL =
      ts.isIdentifier(node) &&
      node.text === 'URL' &&
      parent &&
      ((ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        ['createObjectURL', 'revokeObjectURL'].includes(parent.name.text)) ||
        (ts.isCallExpression(parent) &&
          parent.expression.getText(source) === 'Object.defineProperty' &&
          parent.arguments[0] === node &&
          parent.arguments[1] &&
          ts.isStringLiteral(parent.arguments[1]) &&
          ['createObjectURL', 'revokeObjectURL'].includes(parent.arguments[1].text)));

    if (
      ts.isIdentifier(node) &&
      !blobURL &&
      [
        'fetch',
        'require',
        'eval',
        'Function',
        'URL',
        'Worker',
        'SharedWorker',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'Image',
        'Audio',
      ].includes(node.text)
    ) {
      hazards.add(`May read dynamic input through ${node.text}, including an alias.`);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['globalThis', 'window', 'process'].includes(node.expression.text)
    ) {
      hazards.add(`A computed ${node.expression.text} member can provide a hidden input reader.`);
    } else if (
      ts.isBinaryExpression(node) &&
      ts.isPropertyAccessExpression(node.left) &&
      ['src', 'srcset', 'href'].includes(node.left.name.text)
    ) {
      hazards.add(`A DOM ${node.left.name.text} assignment can load an asset outside the import graph.`);
    }

    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      const typesOnly =
        !node.importClause?.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every(binding => binding.isTypeOnly);

      if (!typesOnly) {
        module(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      module(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];

        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          module(argument.text);
        } else {
          hazards.add('Loads a module through a nonliteral dynamic import.');
        }
      } else if (ts.isIdentifier(node.expression) && ['fetch', 'require', 'eval', 'Function'].includes(node.expression.text)) {
        hazards.add(`Reads dynamic input through ${node.expression.text}.`);
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const expression = node.expression.getText(source);

        if (
          /^import\.meta\.(?:glob(?:Eager)?|resolve)$/.test(expression) ||
          /^process\.(?:cwd|getBuiltinModule|binding)$/.test(expression) ||
          /^(?:globalThis|window)\.(?:fetch|eval)$/.test(expression)
        ) {
          hazards.add(`Reads dynamic input through ${expression}.`);
        }
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['URL', 'Worker', 'SharedWorker', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Image', 'Audio', 'Function'].includes(
        node.expression.text,
      )
    ) {
      hazards.add(`Loads an asset or dynamic code through ${node.expression.text}.`);
    }

    ts.forEachChild(node, child => visit(child, node));
  };

  visit(source);

  return { hazards: [...hazards], imports: [...imports] };
};

/**
 * Selects tests without executing them. The caller owns the fresh Vitest context.
 * Uncertain graphs return the complete inventory; an inventory failure is fatal,
 * because an empty list cannot stand in for an unknown validation scope.
 */
export const selectAffectedTests = async (context: Vitest, changedFiles: readonly string[]): Promise<AffectedTestSelection> => {
  const started = performance.now();
  const root = realpathSync(context.config.root);
  const display = (file: string): string => portable(relative(root, file));
  const specifications = await context.globTestSpecifications();

  if (specifications.length === 0) {
    throw new Error('No test inventory was discovered; affected selection cannot establish the validation scope.');
  }

  const keys = new Map<string, { project: string; file: string }>();

  for (const spec of specifications) {
    const entry = { project: spec.project.name, file: display(spec.moduleId) };
    keys.set(JSON.stringify([entry.project, entry.file]), entry);
  }

  const inventory = [...keys.values()].sort((a, b) => a.project.localeCompare(b.project) || a.file.localeCompare(b.file));
  const files = [...new Set(changedFiles)];
  const finish = (
    mode: AffectedTestSelection['mode'],
    fallbackReasons: string[],
    tests: AffectedTestSelection['tests'],
  ): AffectedTestSelection => ({
    version: 1,
    changedFiles: files,
    mode,
    fallbackReasons,
    tests,
    inventory,
    durationMs: performance.now() - started,
  });
  const full = (reasons: string[]): AffectedTestSelection =>
    finish(
      'full',
      reasons,
      inventory.map(entry => ({ ...entry, reasons: reasons.map(detail => ({ kind: 'full', detail })) })),
    );
  const changed = new Map<string, string>();
  const fallbackReasons: string[] = [];

  if (files.length === 0) {
    fallbackReasons.push('The changed-file inventory is empty; the affected scope is unknown.');
  }

  for (const file of files) {
    const absolute = resolve(root, file);

    if (isAbsolute(file) || display(absolute) !== file || file.includes('\0')) {
      fallbackReasons.push(`The path is not an exact repository-relative file: ${file}`);
      continue;
    }

    try {
      if (!statSync(absolute).isFile()) {
        throw new Error('not a regular file');
      }

      const canonical = realpathSync(absolute);

      if (display(canonical).startsWith('../') || isAbsolute(display(canonical))) {
        fallbackReasons.push(`The input resolves outside the repository: ${file}`);
      } else if (GLOBAL.test(file) || (!SOURCE_TREE.test(file) && !CONTENT.test(file))) {
        fallbackReasons.push(`Global, generated or unclassified input requires the complete inventory: ${file}`);
      } else if (/\.d\.[cm]?ts$/.test(file)) {
        fallbackReasons.push(`A declaration has no complete runtime dependency graph: ${file}`);
      } else {
        changed.set(canonical, file);
      }
    } catch {
      fallbackReasons.push(`A deleted, renamed or unreadable input cannot be resolved: ${file}`);
    }
  }

  if (fallbackReasons.length) {
    return full(fallbackReasons);
  }

  const saved = { related: context.config.related, changed: context.config.changed, triggers: context.config.forceRerunTriggers };
  const selected = new Map<string, AffectedTestSelection['tests'][number]>();
  const sourceCache = new Map<string, SourceInputs>();
  const observedFiles = new Set<string>();

  const keep = (spec: TestSpecification, reason: AffectedTestReason): void => {
    const file = display(spec.moduleId);
    const key = JSON.stringify([spec.project.name, file]);
    let entry = selected.get(key);

    if (!entry) {
      entry = { project: spec.project.name, file, reasons: [] };
      selected.set(key, entry);
    }

    if (!entry.reasons.some(existing => JSON.stringify(existing) === JSON.stringify(reason))) {
      entry.reasons.push(reason);
    }
  };

  try {
    const projects = new Map<TestProject, TestSpecification[]>();

    for (const spec of specifications) {
      const projectSpecs = projects.get(spec.project) ?? [];
      projectSpecs.push(spec);
      projects.set(spec.project, projectSpecs);
    }

    for (const project of projects.keys()) {
      for (const environment of Object.values(project.vite.environments)) {
        await environment.pluginContainer.buildStart();

        // Startup readers have no importing module to carry their watch edges.
        // Vite normally runs shared startup hooks in the client environment.
        for (const watched of environment.pluginContainer.watchFiles) {
          const change = changed.get(realpathSync(resolve(project.config.root, watched)));

          if (change) {
            return full([`A plugin startup watch input has no dependency owner: ${change}`]);
          }
        }
      }
    }

    // Explicit related paths bypass Vitest's newline-delimited Git parser. Its
    // discovery primes Vite; selection below also follows query and worker nodes.
    context.config.related = [...changed.keys()];
    context.config.changed = false;
    context.config.forceRerunTriggers = [];
    await context.getRelevantTestSpecifications();

    for (const [project, projectSpecs] of projects) {
      const environment = project.vite.environments.ssr;

      if (!environment) {
        throw new Error(`No SSR dependency environment for project ${project.name}.`);
      }

      const graph = environment.moduleGraph;
      const importers = new Map<EnvironmentModuleNode, Set<EnvironmentModuleNode>>();
      const testNodes = new Map<EnvironmentModuleNode, TestSpecification[]>();
      const setupNodes = new Set<EnvironmentModuleNode>();
      const byFile = new Map<string, Set<EnvironmentModuleNode>>();
      const hazards = new Map<EnvironmentModuleNode, string>();
      const queued = new Set<EnvironmentModuleNode>();
      const queue: EnvironmentModuleNode[] = [];
      const nodePath = (node: EnvironmentModuleNode): string =>
        node.file && isAbsolute(node.file) ? display(node.file) : (node.id ?? node.url).replaceAll('\0', '<virtual>');

      const enqueue = (node: EnvironmentModuleNode): void => {
        if (!queued.has(node)) {
          queued.add(node);
          queue.push(node);
        }
      };

      const edge = (dependency: EnvironmentModuleNode, importer: EnvironmentModuleNode): void => {
        const parents = importers.get(dependency) ?? new Set<EnvironmentModuleNode>();
        parents.add(importer);
        importers.set(dependency, parents);
        enqueue(dependency);
      };

      const load = async (id: string): Promise<EnvironmentModuleNode> => {
        const result = await environment.transformRequest(id);
        const node = graph.getModuleById(id) ?? (await graph.getModuleByUrl(id));

        if (!result || !node) {
          throw new Error(`Cannot transform graph input ${display(id)} in ${project.name}.`);
        }

        return node;
      };

      for (const spec of projectSpecs) {
        const node = await load(spec.moduleId);
        const owners = testNodes.get(node) ?? [];
        owners.push(spec);
        testNodes.set(node, owners);
        enqueue(node);
      }

      for (const setup of [...project.config.setupFiles, ...project.config.globalSetup]) {
        const node = await load(resolve(project.config.root, setup));
        setupNodes.add(node);
        enqueue(node);
      }

      for (const node of queue) {
        if (!node.file || !isAbsolute(node.file) || node.file.includes('\0')) {
          hazards.set(node, 'A virtual module can read inputs outside the filesystem graph.');
        } else {
          const canonical = realpathSync(node.file);
          const local = display(canonical);
          const external = local.startsWith('../') || isAbsolute(local) || /(?:^|\/)node_modules\//.test(local);

          if (canonical.startsWith(`${VITEST_ROOT}${sep}`)) {
            continue;
          }

          if (external) {
            hazards.set(node, `External module inputs are not inspected: ${local}`);
            continue;
          }

          observedFiles.add(canonical);
          const nodes = byFile.get(canonical) ?? new Set<EnvironmentModuleNode>();
          nodes.add(node);
          byFile.set(canonical, nodes);

          if (!node.transformResult) {
            await load(node.id ?? node.url);
          }

          let inputs = sourceCache.get(canonical);

          if (!inputs) {
            inputs = sourceInputs(canonical);
            sourceCache.set(canonical, inputs);
          }

          if (inputs.hazards.length) {
            hazards.set(node, inputs.hazards.join(' '));
          }

          for (const specifier of inputs.imports) {
            if (isBuiltin(specifier) || harnessImport(specifier)) {
              continue;
            }

            // This is a safety check through Vite's configured resolver, not a
            // parallel alias/package resolver or a source-derived dependency edge.
            const resolved = await environment.pluginContainer.resolveId(specifier, node.id ?? undefined);

            if (!resolved) {
              throw new Error(`Unresolved graph import ${specifier} from ${nodePath(node)}.`);
            }

            if (resolved.external || /(?:^|[\\/])node_modules[\\/]/.test(resolved.id)) {
              hazards.set(node, `External import may read inputs outside the graph: ${specifier}`);
            }
          }

          // Vite's worker-query wrapper does not import its worker source in
          // SSR. Use its already-resolved file, then connect that source back
          // to the wrapper; nested imports still come entirely from Vite.
          if (/[?&](?:worker|sharedworker)(?:[=&]|$)/.test(node.id ?? '')) {
            const worker = await load(node.file);
            edge(worker, node);
          }
        }

        for (const dependency of node.importedModules) {
          edge(dependency, node);
        }
      }

      // Vite includes load/transform addWatchFile dependencies in importedModules.
      // Refuse a changed watch input without an attributed edge, even if another
      // project happens to import the same file normally.
      for (const watched of environment.pluginContainer.watchFiles) {
        const canonical = realpathSync(resolve(project.config.root, watched));
        const change = changed.get(canonical);
        const nodes = byFile.get(canonical);

        if (change && (!nodes || [...nodes].every(node => !importers.get(node)?.size))) {
          return full([`A plugin watch input has no resolved dependency edge: ${change}`]);
        }
      }

      const walk = (seeds: Array<{ node: EnvironmentModuleNode; reason: AffectedTestReason }>): void => {
        const pending = seeds.map(seed => ({ ...seed, path: seed.reason.path ?? [nodePath(seed.node)] }));
        const visited = new Set<EnvironmentModuleNode>();

        for (const { node, reason, path } of pending) {
          if (visited.has(node)) {
            continue;
          }

          visited.add(node);

          for (const spec of testNodes.get(node) ?? []) {
            keep(spec, { ...reason, path: uniquePath(path) });
          }

          if (setupNodes.has(node)) {
            for (const spec of projectSpecs) {
              keep(spec, {
                ...reason,
                kind: 'setup',
                path: uniquePath([...path, display(spec.moduleId)]),
                detail: `Project setup depends on this input. ${reason.detail}`,
              });
            }
          }

          for (const importer of [...(importers.get(node) ?? [])].sort((a, b) => nodePath(a).localeCompare(nodePath(b)))) {
            pending.push({ node: importer, reason, path: [...path, nodePath(importer)] });
          }
        }
      };

      for (const [canonical, change] of changed) {
        walk(
          [...(byFile.get(canonical) ?? [])].map(node => ({
            node,
            reason: {
              kind: testNodes.has(node) ? 'changed-test' : 'dependency',
              change,
              path: [change],
              detail: 'Resolved Vite imports reach this changed file.',
            },
          })),
        );
      }

      walk(
        [...hazards]
          .sort(([a], [b]) => nodePath(a).localeCompare(nodePath(b)))
          .map(([node, detail]) => ({ node, reason: { kind: 'untracked', detail } })),
      );
    }

    for (const [canonical, file] of changed) {
      if (!MODULE.test(file) && !CONTENT.test(file) && !observedFiles.has(canonical)) {
        fallbackReasons.push(`An asset or unknown module has no resolved graph identity: ${file}`);
      }
    }

    if (fallbackReasons.length) {
      return full(fallbackReasons);
    }

    return finish(
      'related',
      [],
      [...selected.values()].sort((a, b) => a.project.localeCompare(b.project) || a.file.localeCompare(b.file)),
    );
  } catch (error) {
    return full([`Dependency graph could not be proven complete: ${errorMessage(error)}`]);
  } finally {
    context.config.related = saved.related;
    context.config.changed = saved.changed;
    context.config.forceRerunTriggers = saved.triggers;
  }
};
