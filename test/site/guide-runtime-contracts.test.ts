import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GUIDE_DIR = join(ROOT, 'site', 'src', 'content', 'guide');
const EXAMPLES_DIR = join(ROOT, 'examples');

const walk = (dir: string, extension: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);

    return statSync(full).isDirectory() ? walk(full, extension) : full.endsWith(extension) ? [full] : [];
  });

const where = (file: string, source: string, index: number): string =>
  `${relative(ROOT, file).replaceAll('\\', '/')}:${source.slice(0, index).split('\n').length}`;

const violations = (files: string[], pattern: RegExp): string[] =>
  files.flatMap(file => {
    const source = readFileSync(file, 'utf8');

    return [...source.matchAll(pattern)].map(match => where(file, source, match.index ?? 0));
  });

const guideCodeViolations = (pattern: RegExp): string[] =>
  guideFiles.flatMap(file => {
    const source = readFileSync(file, 'utf8');

    return [...source.matchAll(/```(?:ts|tsx)[^\n]*\n([\s\S]*?)```/g)].flatMap(fence =>
      [...(fence[1] ?? '').matchAll(pattern)].map(match =>
        where(file, source, (fence.index ?? 0) + fence[0].indexOf(fence[1] ?? '') + (match.index ?? 0)),
      ),
    );
  });

const guideFiles = walk(GUIDE_DIR, '.mdx');
const exampleFiles = walk(EXAMPLES_DIR, '.ts').filter(file => !file.endsWith('.d.ts'));
const templateFiles = walk(join(ROOT, 'packages', 'create-exo-app', 'templates'), '.ts').filter(file => !file.endsWith('.d.ts'));

/** The argument list of the call whose `(` ends at `open`, without its parentheses. */
const callArguments = (source: string, open: number): string => {
  let depth = 1;
  let index = open;

  while (depth > 0 && index < source.length) {
    depth += source[index] === '(' ? 1 : source[index] === ')' ? -1 : 0;
    index++;
  }

  return source.slice(open, index - 1);
};

/**
 * Offsets of `new PhysicsWorld(...)` constructions that `source` registers with
 * a system registry without passing `fixedDelta`. A hosted world steps once per
 * host fixed step and rejects a host whose step differs from its own, so one
 * left at the 60 Hz default breaks as soon as an application sets
 * `fixedTimeStep`. A construction counts as hosted when it is the argument of
 * `systems.add(...)` itself, or when the name it is assigned to is passed to
 * one. Options passed as a variable cannot be judged here and are skipped.
 */
const unhostedWorldOffsets = (source: string): number[] =>
  [...source.matchAll(/new PhysicsWorld\(/g)].flatMap(match => {
    const at = match.index ?? 0;
    const args = callArguments(source, at + match[0].length).trim();

    if (args.includes('fixedDelta') || (args !== '' && !args.startsWith('{'))) {
      return [];
    }

    const before = source.slice(Math.max(0, at - 200), at);
    const inline = /systems\.add\(\s*$/.test(before);
    const name = /\b(\w+)\s*!?(?::\s*[\w.<>]+\s*)?=\s*(?:[\w.]+\.systems\.add\(\s*)?$/.exec(before)?.[1];
    const registered = name !== undefined && new RegExp(String.raw`systems\.add\(\s*(?:this\.)?${name}\b`).test(source);

    return inline || registered ? [at] : [];
  });

const unhostedWorlds = (files: string[]): string[] =>
  files.flatMap(file => {
    const source = readFileSync(file, 'utf8');

    return unhostedWorldOffsets(source).map(index => where(file, source, index));
  });

const unhostedGuideWorlds = (): string[] =>
  guideFiles.flatMap(file => {
    const source = readFileSync(file, 'utf8');

    return [...source.matchAll(/```(?:ts|tsx)[^\n]*\n([\s\S]*?)```/g)].flatMap(fence =>
      unhostedWorldOffsets(fence[1] ?? '').map(index => where(file, source, (fence.index ?? 0) + fence[0].indexOf(fence[1] ?? '') + index)),
    );
  });

describe('guide and example runtime contracts', () => {
  // Every check below asserts an empty violation list, which an empty file list
  // also satisfies. Without this the whole suite passes silently once `walk`
  // stops finding anything - a moved content root or a changed extension.
  it('enumerates the guide and example sources it checks', () => {
    expect(guideFiles.length).toBeGreaterThanOrEqual(50);
    expect(exampleFiles.length).toBeGreaterThanOrEqual(200);
    expect(templateFiles.length).toBeGreaterThanOrEqual(15);
  });

  it('recognises a hosted physics world in every way a source registers it', () => {
    const hosted = [
      'class A extends Scene { private readonly world = new PhysicsWorld(); init() { this.systems.add(this.world); } }',
      'class A extends Scene { world = new PhysicsWorld({ gravity: { x: 0, y: 1 } }); init() { this.systems.add(this.world); } }',
      `const world: PhysicsWorld = new PhysicsWorld();
app.systems.add(world, { order: SystemOrder.Physics });`,
      'this.world = this.systems.add(new PhysicsWorld({ gravity: { x: 0, y: 1 } }));',
      `const world = app.systems.add(
  new PhysicsWorld(),
);`,
    ];
    const fine = [
      'this.world = this.systems.add(new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep }));',
      `const world = new PhysicsWorld();
world.step(delta);`,
      `const world = new PhysicsWorld(options);
this.systems.add(world);`,
    ];

    expect(hosted.map(source => unhostedWorldOffsets(source).length)).toEqual(hosted.map(() => 1));
    expect(fine.map(source => unhostedWorldOffsets(source).length)).toEqual(fine.map(() => 0));
  });

  it('constructs every physics world it hosts in a system registry at the application fixed step', () => {
    expect([...unhostedWorlds([...exampleFiles, ...templateFiles]), ...unhostedGuideWorlds()]).toEqual([]);
  });

  it('syncs tile colliders before the fixed steps, not from the frame update', () => {
    expect(guideCodeViolations(/\/\/ Tick this from your update loop\./g)).toEqual([]);
  });

  it('does not null-check the throwing, non-null Scene.app getter', () => {
    expect(violations(exampleFiles, /const app = this\.app;\s*if \(app === null/g)).toEqual([]);
  });

  it('uses logical application dimensions for scene layout', () => {
    const backingStoreLayout =
      /(?:\{[^}\n]*\b(?:width|height)\b[^}\n]*\}\s*=\s*(?:this\.)?app\.canvas|(?:this\.)?app\.canvas\.(?:width|height))/g;
    expect([...violations(exampleFiles, backingStoreLayout), ...guideCodeViolations(backingStoreLayout)]).toEqual([]);
  });

  it('does not pass constructed scene instances to Application.start', () => {
    const sceneInstanceStart = /const\s+(\w+)\s*=\s*new\s+\w*Scene\s*\([^;]*\);[\s\S]{0,160}?app\.start\(\1\)/g;
    expect(violations(guideFiles, sceneInstanceStart)).toEqual([]);
  });

  it('does not describe superseded scene and coordinate contracts', () => {
    const staleContract =
      /`Scene\.app` is `null`|app\.start\(\) expects a `Scene` instance|`scene\.currentScene|\(canvas\.width, canvas\.height\).*bottom-right|rather than being re-evaluated when a tween is created|stepped from `Scene\.fixedUpdate`/g;
    expect(violations(guideFiles, staleContract)).toEqual([]);
  });
});
