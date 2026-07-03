/**
 * Validates the guide information architecture in
 * site/src/lib/guide-structure.ts against the real content tree and the
 * playground / API catalogs. A typo in a slug, a missing prerequisite, an
 * orphaned MDX file, or a broken landing reference fails here rather than
 * shipping a dead link.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import {
  CORE_ONBOARDING_PATHS,
  getAdjacentChapters,
  GUIDE_CHAPTER_BY_PATH,
  GUIDE_CHAPTERS,
  GUIDE_LEARNING_PATH,
  GUIDE_LEVELS,
  GUIDE_PARTS,
  GUIDE_TOPICS,
} from '../../site/src/lib/guide-structure';

const GUIDE_DIR = join(process.cwd(), 'site', 'src', 'content', 'guide');
const API_DIR = join(process.cwd(), 'site', 'src', 'content', 'api');

function walkMdx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkMdx(full));
    else if (full.endsWith('.mdx') || full.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Minimal frontmatter reader for the controlled `title` / `description` scalars. */
function readFrontmatter(file: string): { title: string; description: string } {
  const raw = readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  const block = match?.[1] ?? '';
  const scalar = (key: string): string => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block);
    if (!line) return '';
    return line[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim();
  };
  return { title: scalar('title'), description: scalar('description') };
}

const exampleExists = (ref: string): boolean => {
  const slash = ref.indexOf('/');
  if (slash < 0) return false;
  const category = ref.slice(0, slash);
  const slug = ref.slice(slash + 1);
  return (EXAMPLES_CATALOG[category] ?? []).some(entry => entry.slug === slug);
};

const guideFiles = walkMdx(GUIDE_DIR);
const guidePathsOnDisk = guideFiles.map(file =>
  file
    .slice(GUIDE_DIR.length + 1)
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/, ''),
);

describe('guide structure ↔ content reconciliation', () => {
  it('points every chapter at an existing MDX file', () => {
    const missing = GUIDE_CHAPTERS.filter(chapter => !existsSync(join(GUIDE_DIR, `${chapter.path}.mdx`)));
    expect(missing.map(chapter => chapter.path)).toEqual([]);
  });

  it('has no orphan MDX files outside the structure', () => {
    const orphans = guidePathsOnDisk.filter(path => !GUIDE_CHAPTER_BY_PATH.has(path));
    expect(orphans).toEqual([]);
  });

  it('has no duplicate chapter paths', () => {
    const paths = GUIDE_CHAPTERS.map(chapter => chapter.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every guide file a non-empty title and description', () => {
    const bad = guideFiles.filter(file => {
      const fm = readFrontmatter(file);
      return !fm.title || !fm.description;
    });
    expect(bad).toEqual([]);
  });
});

describe('guide metadata', () => {
  it('uses only valid level values', () => {
    const invalid = GUIDE_CHAPTERS.filter(chapter => !GUIDE_LEVELS.includes(chapter.level));
    expect(invalid.map(chapter => chapter.path)).toEqual([]);
  });

  it('numbers parts sequentially from 1', () => {
    expect(GUIDE_PARTS.map(part => part.part)).toEqual(GUIDE_PARTS.map((_, index) => index + 1));
  });

  it('numbers chapters sequentially within each part', () => {
    for (const part of GUIDE_PARTS) {
      expect(part.chapters.map(chapter => chapter.chapter)).toEqual(part.chapters.map((_, index) => index + 1));
    }
  });

  it('resolves every prerequisite to a known chapter', () => {
    const broken = GUIDE_CHAPTERS.flatMap(chapter =>
      chapter.prerequisites.filter(path => !GUIDE_CHAPTER_BY_PATH.has(path)).map(path => `${chapter.path} → ${path}`),
    );
    expect(broken).toEqual([]);
  });

  it('never lists a chapter as its own prerequisite', () => {
    const selfRefs = GUIDE_CHAPTERS.filter(chapter => chapter.prerequisites.includes(chapter.path));
    expect(selfRefs.map(chapter => chapter.path)).toEqual([]);
  });

  it('resolves every playground example to the catalog', () => {
    const broken = GUIDE_CHAPTERS.flatMap(chapter => chapter.examples.filter(ref => !exampleExists(ref)).map(ref => `${chapter.path} → ${ref}`));
    expect(broken).toEqual([]);
  });

  it('resolves every API link to an existing API page', () => {
    const broken = GUIDE_CHAPTERS.flatMap(chapter =>
      chapter.apiLinks.filter(slug => !existsSync(join(API_DIR, `${slug}.json`))).map(slug => `${chapter.path} → ${slug}`),
    );
    expect(broken).toEqual([]);
  });

  it('gives core onboarding chapters a level and learning goals', () => {
    for (const path of CORE_ONBOARDING_PATHS) {
      const chapter = GUIDE_CHAPTER_BY_PATH.get(path);
      expect(chapter, `missing core chapter ${path}`).toBeDefined();
      expect(GUIDE_LEVELS.includes(chapter!.level)).toBe(true);
      expect(chapter!.learningGoals.length, `no learning goals for ${path}`).toBeGreaterThan(0);
    }
  });
});

describe('previous / next navigation', () => {
  it('starts with no previous and ends with no next', () => {
    const first = GUIDE_CHAPTERS[0];
    const last = GUIDE_CHAPTERS[GUIDE_CHAPTERS.length - 1];
    expect(getAdjacentChapters(first.path).previous).toBeNull();
    expect(getAdjacentChapters(last.path).next).toBeNull();
  });

  it('forms one linear chain with no gaps or cycles', () => {
    const visited = new Set<string>();
    let cursor: string | null = GUIDE_CHAPTERS[0].path;
    let steps = 0;
    while (cursor && steps <= GUIDE_CHAPTERS.length) {
      expect(visited.has(cursor), `cycle at ${cursor}`).toBe(false);
      visited.add(cursor);
      cursor = getAdjacentChapters(cursor).next?.path ?? null;
      steps++;
    }
    expect(visited.size).toBe(GUIDE_CHAPTERS.length);
  });

  it('keeps previous and next consistent with each other', () => {
    for (const chapter of GUIDE_CHAPTERS) {
      const { next } = getAdjacentChapters(chapter.path);
      if (next) {
        expect(getAdjacentChapters(next.path).previous?.path).toBe(chapter.path);
      }
    }
  });

  it('returns nulls for an unknown path', () => {
    expect(getAdjacentChapters('does/not-exist')).toEqual({ previous: null, next: null });
  });
});

describe('guide landing references', () => {
  it('points every learning-path step at a real chapter', () => {
    const broken = GUIDE_LEARNING_PATH.filter(step => !GUIDE_CHAPTER_BY_PATH.has(step.path));
    expect(broken.map(step => step.path)).toEqual([]);
  });

  it('points every learning-path example at the catalog', () => {
    const broken = GUIDE_LEARNING_PATH.filter(step => step.example && !exampleExists(step.example));
    expect(broken.map(step => step.example)).toEqual([]);
  });

  it('points every topic at a real chapter', () => {
    const broken = GUIDE_TOPICS.filter(topic => !GUIDE_CHAPTER_BY_PATH.has(topic.path));
    expect(broken.map(topic => topic.path)).toEqual([]);
  });
});
