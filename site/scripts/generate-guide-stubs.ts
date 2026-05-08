import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(siteRoot, '..');

const chapters = [
    { order: 1, slug: 'getting-started', title: 'Getting Started' },
    { order: 2, slug: 'application-scenes', title: 'Application & Scenes' },
    { order: 3, slug: 'sprites-textures', title: 'Sprites & Textures' },
    { order: 4, slug: 'tweens-animation', title: 'Tweens & Animation' },
    { order: 5, slug: 'input', title: 'Input (Keyboard, Mouse, Pointer, Gamepad)' },
    { order: 6, slug: 'scene-graph', title: 'Container & Scene Graph' },
    { order: 7, slug: 'audio-basics', title: 'Audio Basics' },
    { order: 8, slug: 'spatial-audio', title: 'Spatial Audio & Listener' },
    { order: 9, slug: 'filters', title: 'Filters' },
    { order: 10, slug: 'particles', title: 'Particles' },
    { order: 11, slug: 'text-fonts', title: 'Text & Fonts' },
    { order: 12, slug: 'geometry-graphics', title: 'Geometry & Graphics' },
    { order: 13, slug: 'render-targets', title: 'Render Targets & Post-Processing' },
    { order: 14, slug: 'performance', title: 'Performance & Profiling' },
    { order: 15, slug: 'audio-fx', title: 'Audio FX' },
    { order: 16, slug: 'beat-detection', title: 'Beat Detection & Music Sync' },
    { order: 17, slug: 'debug-layer', title: 'Debug Layer' },
    { order: 18, slug: 'custom-renderers', title: 'Advanced: Custom Renderers' },
    { order: 19, slug: 'showcase', title: 'Showcase (combined recipes)' },
] as const;

const examplesPath = path.resolve(repoRoot, 'examples', 'examples.json');
const outputDir = path.resolve(siteRoot, 'src', 'content', 'guide');
const examplesCatalog = JSON.parse(fs.readFileSync(examplesPath, 'utf8')) as Record<string, Array<{ slug: string; title: string; description: string }>>;

const safeDescription = (text: string): string => text.replaceAll('"', '\\"');
const safeTitle = (text: string): string => text.replaceAll('"', '\\"');

const makeIntro = (title: string): string =>
    `${title} introduces the core patterns used in this chapter, with short runnable examples that can be previewed inline and opened in the playground for deeper iteration. Use this page as a quick tour of capabilities before writing fuller production code.`;

const makeNote = (title: string): string => `${title} highlights a focused technique that is meant to be copied and adapted in your own scene setup.`;

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];
    const next = chapters[i + 1];
    const examples = examplesCatalog[chapter.slug] ?? [];

    const blocks = examples
        .map(
            example => `
<a id="${example.slug}"></a>
<ExamplePreview chapter="${chapter.slug}" slug="${example.slug}" />
${makeNote(example.title)}
`.trim()
        )
        .join('\n\n');

    const related = [
        '## Related',
        '',
        '- API: [Core API](/ExoJS/api/)',
        next ? `- Next chapter: [${next.title}](/ExoJS/guide/${next.slug})` : '- Next chapter: [Guide Overview](/ExoJS/guide/)',
        '',
        '{/* TODO: prose */}',
    ].join('\n');

    const content = `---
title: "${safeTitle(chapter.title)}"
description: "${safeDescription((examples[0]?.description ?? `${chapter.title} examples.`).replace(/\.$/, ''))}"
chapter: ${chapter.slug}
order: ${chapter.order}
---
import ExamplePreview from '../../components/ExamplePreview.astro';

# ${chapter.title}

${makeIntro(chapter.title)}

## Examples

${blocks}

${related}
`;

    fs.writeFileSync(path.resolve(outputDir, `${chapter.slug}.mdx`), content, 'utf8');
}

console.log(`[generate-guide-stubs] Wrote ${chapters.length} chapter file(s) to ${outputDir}`);
