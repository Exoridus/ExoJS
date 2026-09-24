import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const source = JSON.parse(readFileSync('_migration/source.json', 'utf8')).sourceCommit as string;
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(path => /^(src\/|packages\/[^/]+\/src\/)/.test(path) && path.endsWith('.ts') && !path.endsWith('.d.ts'));
const inventory: object[] = [];
const commentOnly: string[] = [];
const replacements: Record<string, Record<string, string>> = {
  'src/assets/LoaderScope.ts': {
    'LoaderScope': 'Owns asset claims for one lifetime.\n\nOwners share resident payloads without sharing release authority. Destroying a live parent releases its existing children; create child scopes only while the parent is live. This revision does not reject createScope() after parent destruction, and such a late child is not released by a repeated parent destroy().\n\nUse a scene scope for scene assets and a child scope for shorter-lived levels, previews, or prefetch work. Direct Loader acquisitions instead belong to its application-lifetime scope.',
    'LoaderScope.createScope': 'Creates an independent child claim owner under a live parent.\n\nDestroying the child releases only its claims. Destroying the parent releases its current children first. Names are diagnostic labels and do not identify or reuse a scope.\n\nCall this only before parent teardown. Unlike get(), load(), and loadContainer(), this revision does not reject creation after destruction; that late child must be explicitly destroyed by its caller.',
    'LoaderScope.get': 'Acquires this scope\'s claim and returns a synchronous deferred handle, value reference, or catalog leaves.\n\nThis can start loading; it is not a passive cache lookup. Await load() for a required finished value. Bare-path acquisition reuses a source-keyed handle; a new descriptor can produce a distinct leaf sharing the same resident payload.\n\n@throws If the scope is destroyed or the input has no supported synchronous leaf form.',
    'LoaderScope.load': 'Acquires required resources for this scope and returns an awaitable loading queue.\n\nA catalog resolves to a new map of finished values, while its original deferred leaves also become ready in place. The returned map is not the catalog object. Decode and fetch failures reject the queue; ownership still belongs to this scope. Background priority is available on the catalog and catalog-leaf overloads.\n\n@throws If acquisition is attempted through a destroyed scope.',
    'LoaderScope.onLoadComplete': 'Fires after every foreground item in this scope\'s current batch has settled, including failures. It does not imply that all resources succeeded; await the relevant queue for success or failure.',
  },
  'src/debug/RenderPassInspectorLayer.ts': {
    'RenderPassInspectorLayer': 'Inspects the visible scene-root nodes that have attached filters and optionally displays a logical render pipeline.\n\nThe pass total counts attached filters plus a mask flag per collected entry. It is a structural estimate, not a hardware-pass count or GPU timing: multi-step filters are not expanded, cached work is not subtracted, and mask-only nodes are not collected. Returned entries are reused on update.',
  },
  'packages/exojs-lighting/src/Lighting.ts': {
    'Lighting': 'Coordinates registered light nodes and occluder sources for a concrete lighting model.\n\nForward lighting shades materials; lightmap lighting shades a composed frame and can use a registered normal prepass; radiance lighting samples a propagation field. These models have distinct capabilities and cost, not a shared quality scale.\n\nThe system owns its renderer resources, not the host, registered scene nodes, supplied occluder or normal sources, or caller-supplied post filters. Register host-bound systems after scene attachment and give them an explicit system-registry lifetime.',
  },
  'packages/exojs-particles/src/ParticleSystem.ts': {
    'ParticleSystem': 'Owns a bounded particle simulation and submits it through the particle renderer.\n\nPositions are local to the system. WebGPU compute eligibility depends on the attached backend, update modules, and render mode; WebGL2 uses CPU simulation. Modules can change after the first update. A change that forces an active GPU simulation onto the CPU clears live particles because its integrated state is not present in CPU storage.\n\nAn explicitly supplied render mode is owned by this system. Textures have independent ownership. Register with one system registry or update manually, not both.',
  },
};
const scannerTokens = (text: string): string[] => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) tokens.push(`${token}:${scanner.getTokenText()}`);
  return tokens;
};
const seenKeys = new Set<string>();
for (const path of files) {
  const before = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true);
  const changes: { start: number; end: number; content: string }[] = [];
  const visit = (node: ts.Node, owner = ''): void => {
    const named = node as ts.NamedDeclaration;
    const name = named.name?.getText(tree);
    const isTop = ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node);
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exported = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isMember = Boolean(owner) && (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node));
    const privateMember = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword) || name?.startsWith('_');
    const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
    const comment = docs.map(doc => doc.getText(tree)).join('\n');
    const key = isTop ? name : isMember ? `${owner}.${name}` : undefined;
    if (name && ((isTop && exported) || (isMember && !privateMember))) {
      inventory.push({ path, symbol: key, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, documented: Boolean(comment), internalTag: /@internal\b/.test(comment), historyMarkers: [...comment.matchAll(/\b(previously|formerly|originally|deprecated|migration)\b/gi)].map(match => match[0]), review: replacements[path]?.[key ?? ''] ? 'contract rewritten against inspected implementation' : 'inventory and lexical triage; no claim of per-member behavioral execution' });
    }
    const prose = replacements[path]?.[key ?? ''];
    // One useful overload summary; do not inflate every overload with duplicate prose.
    if (prose && key && !seenKeys.has(`${path}:${key}`)) {
      const existing = docs[0];
      const start = existing?.pos ?? node.getStart(tree);
      const end = existing?.end ?? start;
      const indent = before.slice(before.lastIndexOf('\n', start) + 1, start).match(/^\s*/)?.[0] ?? '';
      const content = '/**\n' + prose.split('\n').map(line => `${indent} *${line ? ' ' + line : ''}`).join('\n') + `\n${indent} */` + (existing ? '' : '\n' + indent);
      changes.push({ start, end, content });
      seenKeys.add(`${path}:${key}`);
    }
    ts.forEachChild(node, child => visit(child, ts.isClassDeclaration(node) ? name ?? owner : owner));
  };
  visit(tree);
  if (changes.length) {
    let after = before;
    for (const change of changes.sort((a, b) => b.start - a.start)) after = after.slice(0, change.start) + change.content + after.slice(change.end);
    assert.deepEqual(scannerTokens(after), scannerTokens(before), `Executable token change: ${path}`);
    writeFileSync(path, after);
    commentOnly.push(path);
  }
}
for (const [path, members] of Object.entries(replacements)) for (const key of Object.keys(members)) assert(seenKeys.has(`${path}:${key}`), `Missing reviewed declaration ${path}:${key}`);
writeFileSync('_migration/api-source-inventory.json', JSON.stringify({ sourceCommit: source, scope: 'Exported declarations and non-private class members across Core and package source; entry-point reachability is separately determined by API generation.', limitation: 'Lexical inventory is exhaustive for this source set. Behavioral execution and editorial rewriting are targeted, not a claim that every public member was independently reimplemented or exhaustively tested.', declarations: inventory }, null, 2) + '\n');
writeFileSync('_migration/jsdoc-files.json', JSON.stringify({ sourceCommit: source, files: commentOnly, verification: 'TypeScript scanner non-trivia token sequences equal before and after each authored JSDoc change.' }, null, 2) + '\n');
console.log('PUBLIC_SOURCE_DECLARATIONS', inventory.length, 'JSDOC_ONLY_FILES', commentOnly.length);
