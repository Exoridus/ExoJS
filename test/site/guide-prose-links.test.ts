/**
 * Validates internal links that live directly in guide MDX — the surface the
 * spine test (guide-structure.test.ts, which checks guide-structure.ts metadata)
 * does not cover. A markdown link to a renamed or deleted API page, a dead
 * `/api/mesh-shader/` reference, an invalid `NextStep` target, or a bad `TryIt`
 * slug fails here rather than shipping a broken link.
 *
 * Scope: internal `/api/...` and `/guide/...` links only, plus `TryIt`
 * api/examples props. External URLs are never fetched. Links are normalized for
 * the optional `/ExoJS/` base, an optional `en`/`de` locale segment, trailing
 * slashes, hash fragments, and query strings before resolution.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import { GUIDE_CHAPTER_BY_PATH, GUIDE_PARTS } from '../../site/src/lib/guide-structure';

const ROOT = process.cwd();
const GUIDE_DIR = join(ROOT, 'site', 'src', 'content', 'guide');
const API_DIR = join(ROOT, 'site', 'src', 'content', 'api');

// Non-symbol API routes that exist as pages (en/api/index.astro, en/api/all.astro)
// rather than as a generated api/<slug>.mdx entry.
const API_INDEX_SLUGS = new Set(['', 'all']);

// Part slugs back the /guide/<part>/ index route (en/guide/[part]/index.astro).
const PART_SLUGS = new Set(GUIDE_PARTS.map(part => part.slug));

// API pages that were removed/renamed and must never reappear as a guide link.
// `mesh-shader` → `mesh-material` + `shader-source`; the *-application-options /
// loader-options interfaces are not generated (the generator documents classes
// and enums only), so their option-page links were dropped.
const REMOVED_API_SLUGS = ['mesh-shader', 'canvas-application-options', 'loader-options', 'rendering-application-options', 'input-application-options'];

function walkMdx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkMdx(full));
    else if (full.endsWith('.mdx') || full.endsWith('.md')) out.push(full);
  }
  return out;
}

const guideFiles = walkMdx(GUIDE_DIR);
const rel = (file: string): string => file.slice(GUIDE_DIR.length + 1).replace(/\\/g, '/');

/**
 * Normalize an href to a locale-/base-/slash-agnostic internal path, or return
 * `null` for external, protocol-relative, anchor-only, or non-rootabsolute links
 * (none of which this test resolves).
 */
function normalizeInternal(href: string): string | null {
  let h = href.trim();
  // Drop an optional markdown link title: [x](/path "Title").
  const space = h.search(/\s/);
  if (space >= 0) h = h.slice(0, space);
  // External, protocol-relative, mailto, anchor-only, or query-only — not ours.
  if (/^(https?:)?\/\//i.test(h) || h.startsWith('mailto:')) return null;
  if (h.startsWith('#') || h.startsWith('?')) return null;
  // Strip hash + query.
  h = h.split('#')[0].split('?')[0];
  if (!h) return null;
  // Strip the optional GitHub Pages base prefix.
  h = h.replace(/^\/ExoJS\//, '/');
  if (!h.startsWith('/')) return null; // relative link — none exist in the guides
  // Strip leading slashes, an optional locale segment, and the trailing slash.
  const path = h
    .replace(/^\/+/, '')
    .replace(/^(en|de)\//, '')
    .replace(/\/+$/, '');
  return path;
}

interface Resolution {
  kind: 'api' | 'guide' | 'other';
  ok: boolean;
  target: string;
}

function resolveInternal(path: string): Resolution {
  const seg = path.split('/');
  if (seg[0] === 'api') {
    const slug = seg.slice(1).join('/');
    const ok = API_INDEX_SLUGS.has(slug) || existsSync(join(API_DIR, `${slug}.mdx`));
    return { kind: 'api', ok, target: slug };
  }
  if (seg[0] === 'guide') {
    const chapterPath = seg.slice(1).join('/');
    const ok = chapterPath === '' || PART_SLUGS.has(chapterPath) || GUIDE_CHAPTER_BY_PATH.has(chapterPath);
    return { kind: 'guide', ok, target: chapterPath };
  }
  // Playground and other internal routes are validated by their own embeds.
  return { kind: 'other', ok: true, target: path };
}

const MD_LINK_RE = /\]\(([^)]+)\)/g;
const NEXTSTEP_HREF_RE = /<NextStep\b[\s\S]*?\shref=["']([^"']+)["']/g;
const TRYIT_TAG_RE = /<TryIt\b[\s\S]*?\/>/g;
const STRING_LITERAL_RE = /['"]([^'"]+)['"]/g;

/** Collect every internal (api|guide) link in a file with its raw form. */
function collectLinks(body: string): { raw: string; path: string; res: Resolution }[] {
  const found: { raw: string; path: string; res: Resolution }[] = [];
  const add = (raw: string): void => {
    const path = normalizeInternal(raw);
    if (path === null) return;
    const res = resolveInternal(path);
    if (res.kind === 'other') return;
    found.push({ raw, path, res });
  };

  for (const m of body.matchAll(MD_LINK_RE)) add(m[1]);
  for (const m of body.matchAll(NEXTSTEP_HREF_RE)) add(m[1]);
  return found;
}

const exampleExists = (ref: string): boolean => {
  const slash = ref.indexOf('/');
  if (slash < 0) return false;
  const category = ref.slice(0, slash);
  const slug = ref.slice(slash + 1);
  return (EXAMPLES_CATALOG[category] ?? []).some(entry => entry.slug === slug);
};

function collectTryItRefs(body: string): { api: string[]; examples: string[] } {
  const api: string[] = [];
  const examples: string[] = [];
  for (const tag of body.matchAll(TRYIT_TAG_RE)) {
    const block = tag[0];
    const apiArr = /api=\{\[([^\]]*)\]\}/.exec(block);
    const exArr = /examples=\{\[([^\]]*)\]\}/.exec(block);
    if (apiArr) for (const s of apiArr[1].matchAll(STRING_LITERAL_RE)) api.push(s[1]);
    if (exArr) for (const s of exArr[1].matchAll(STRING_LITERAL_RE)) examples.push(s[1]);
  }
  return { api, examples };
}

describe('guide prose links', () => {
  it('actually collects internal links (guards against a vacuous regex)', () => {
    let api = 0;
    let guide = 0;
    for (const file of guideFiles) {
      for (const link of collectLinks(readFileSync(file, 'utf8'))) {
        if (link.res.kind === 'api') api++;
        else if (link.res.kind === 'guide') guide++;
      }
    }
    // Conservative floors well below the real counts (~80 API, ~40 guide): high
    // enough that a broken collector trips this, low enough to survive edits.
    expect(api).toBeGreaterThan(50);
    expect(guide).toBeGreaterThan(20);
  });

  it('resolves every internal API link to an existing API page', () => {
    const broken: string[] = [];
    for (const file of guideFiles) {
      const body = readFileSync(file, 'utf8');
      for (const link of collectLinks(body)) {
        if (link.res.kind === 'api' && !link.res.ok) broken.push(`${rel(file)} → ${link.raw}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('resolves every internal guide link to a known chapter, part, or landing', () => {
    const broken: string[] = [];
    for (const file of guideFiles) {
      const body = readFileSync(file, 'utf8');
      for (const link of collectLinks(body)) {
        if (link.res.kind === 'guide' && !link.res.ok) broken.push(`${rel(file)} → ${link.raw}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('never links to a removed or renamed API page', () => {
    const removed = new Set(REMOVED_API_SLUGS);
    const offenders: string[] = [];
    for (const file of guideFiles) {
      const body = readFileSync(file, 'utf8');
      for (const link of collectLinks(body)) {
        if (link.res.kind === 'api' && removed.has(link.res.target)) {
          offenders.push(`${rel(file)} → ${link.raw}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('teaches MeshMaterial, never the removed MeshShader symbol', () => {
    // `custom-mesh-shaders` is a valid chapter slug, so match the symbol and the
    // dead API route precisely rather than the substring "mesh-shader".
    const offenders: string[] = [];
    for (const file of guideFiles) {
      const body = readFileSync(file, 'utf8');
      if (/\bMeshShader\b/.test(body)) offenders.push(`${rel(file)} (MeshShader symbol)`);
      if (body.includes('/api/mesh-shader/')) offenders.push(`${rel(file)} (/api/mesh-shader/ link)`);
    }
    expect(offenders).toEqual([]);
  });

  it('resolves every TryIt api slug and example ref', () => {
    const brokenApi: string[] = [];
    const brokenExamples: string[] = [];
    for (const file of guideFiles) {
      const body = readFileSync(file, 'utf8');
      const { api, examples } = collectTryItRefs(body);
      for (const slug of api) {
        if (!existsSync(join(API_DIR, `${slug}.mdx`))) brokenApi.push(`${rel(file)} → ${slug}`);
      }
      for (const ref of examples) {
        if (!exampleExists(ref)) brokenExamples.push(`${rel(file)} → ${ref}`);
      }
    }
    expect(brokenApi).toEqual([]);
    expect(brokenExamples).toEqual([]);
  });
});
