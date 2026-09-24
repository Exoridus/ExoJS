#!/usr/bin/env python3
"""Materialize reviewed site edits as complete files; not permanent tooling."""
import json
import re
from pathlib import Path

changed = []

def edit(path, transform):
    file = Path(path)
    before = file.read_text()
    after = transform(before)
    if before != after:
        file.write_text(after)
        changed.append(path)

def replace_once(text, old, new):
    if new in text and old not in text:
        return text
    assert text.count(old) == 1, (old[:100], text.count(old))
    return text.replace(old, new, 1)

def home(text):
    if 'extractSnippetRegion' not in text:
        text = text.replace("import { Code }", "import { Code }")  # retain the existing Astro Code import
        end = text.index('\n', text.index("import "))
        text = text[:end + 1] + "import { extractSnippetRegion } from '../../lib/source-snippets';\n" + text[end + 1:]
    text, count = re.subn(r'const heroSnippet = `[\s\S]*?`;', "const heroSnippet = extractSnippetRegion('examples/guides/lighting/basic-lightmap.ts', 'basic-lightmap');", text, count=1)
    assert count == 1 or "const heroSnippet = extractSnippetRegion(" in text
    text, count = re.subn(r'const quickstartSnippet = `[\s\S]*?`;', "const quickstartSnippet = `npm create exo-app@latest my-game -- --template minimal\ncd my-game\nnpm install\nnpm run dev`;", text, count=1)
    assert count == 1
    text = text.replace('<Code code={quickstartSnippet} lang="ts"', '<Code code={quickstartSnippet} lang="bash"')
    text = text.replace('Install once, use anywhere.', 'Start small. Add the systems you need.')
    text = text.replace('ExoJS ships as plain ES modules. Drop it into Vite, esbuild, or whatever you already use.', 'Create a Vite and TypeScript starter, or add the ESM package to an existing application. The Guide explains both paths.')
    text = re.sub(r'(<p class="lead">)[\s\S]*?(</p>)', r'\1Build a game, visualization, or interactive canvas with scenes, rendering, input, audio, and explicit resource lifetimes. Keep the surrounding web application in the tools you already use.\2', text, count=1)
    # Replace the complete benchmark teaser paragraph, retaining its existing section and link.
    paragraphs = list(re.finditer(r'<p(?:\s[^>]*)?>[\s\S]*?</p>', text))
    for match in reversed(paragraphs):
        if re.search(r'2[×x]|7[×x]|2\s*times|7\s*times|reference machine', match.group(), re.I):
            text = text[:match.start()] + '<p>Inspect named rendering and physics workloads, the machine and browser behind each result, and the measurement limits. The benchmark pages publish the evidence without an overall engine score.</p>' + text[match.end():]
    text = text.replace('composable GPU-accelerated effects', 'composable effects with explicit capability and quality choices')
    text = text.replace('runs everywhere', 'uses the supported backend path')
    text = text.replace('no build step', 'built runtime, examples, and documentation')
    # The displayed sample and live showcase intentionally demonstrate different lighting models.
    text = text.replace('LitScene.ts', 'basic-lightmap.ts')
    return text

edit('site/src/components/pages/HomePage.astro', home)

for path in ['site/src/components/pages/GuideIndexPage.astro', 'site/src/components/pages/GuideChapterPage.astro', 'site/src/components/pages/GuidePartRedirect.astro']:
    def guide(text):
        text = text.replace('getting-started/getting-started/', 'getting-started/')
        text = text.replace("guideHref('introduction/setup')", "guideHref('getting-started/setup')")
        text = text.replace("guideHref('introduction/what-is-exojs')", "guideHref('getting-started/what-is-exojs')")
        text = text.replace('guideHref(`${part.slug}/${firstChapter.slug}`)', 'guideHref(firstChapter.path)')
        text = text.replace('/guide/${part.slug}/${firstChapter.slug}/', '/guide/${firstChapter.path}/')
        text = text.replace('/guide/${part.slug}/${chapter.slug}/', '/guide/${chapter.path}/')
        text = text.replace('Follow these in order to go from an empty folder to a deployable game.', 'Follow the core path to understand the runtime, then choose a gameplay or integration topic. Advanced chapters are task references, not prerequisites for every project.')
        text = text.replace('Run and edit every example live in the browser.', 'Run and edit the curated demonstrations; individual examples state their capabilities.')
        text = text.replace('Documents every class, method, and option.', 'States the generated public contracts, parameters, units, and ownership rules.')
        return text
    edit(path, guide)

edit('site/src/components/DocsSidebar.astro', lambda text: replace_once(text, 'const partActive = currentPath.startsWith(part.baseHref ?? part.href);', 'const partActive = currentPath === part.baseHref || part.chapters.some(chapter => currentPath === chapter.href);'))
for locale in ['en', 'de']:
    route = f'site/src/pages/{locale}/guide/[part]/[chapter]/index.astro'
    edit(route, lambda text: text.replace('part: part.slug,', "part: chapter.path.split('/')[0],").replace('chapter: chapter.slug,', "chapter: chapter.path.split('/')[1],"))

edit('site/package.json', lambda text: text.replace('/en/guide/introduction/what-is-exojs/', '/en/guide/getting-started/what-is-exojs/'))

def api_index(text):
    text = text.replace('Public API for @codexo/exojs, organized by subsystem.', 'Core and official package contracts, organized by subsystem and import path.')
    text = text.replace('Public API for <code class="inline">@codexo/exojs</code>, organized by subsystem.', 'Exact contracts for Core and the official packages. Each symbol shows its owning import path; subsystem groups organize the task rather than hiding package boundaries.')
    text = text.replace("title: 'Getting Started'", "title: 'Common contracts'")
    old = '<div class="api-counts" aria-label="API totals">'
    if 'Learn the workflow first' not in text:
        text = text.replace(old, '<p>Learn the workflow first in the <a href={`${import.meta.env.BASE_URL}${locale}/guide/`}>Guide</a>, then use this reference to check behavior, units, defaults, and lifetime. Renderer SDK contracts are advanced extension interfaces, not prerequisites for an ordinary scene.</p>\n\n        ' + old)
    return text
edit('site/src/components/pages/ApiIndexPage.astro', api_index)

def benchmark(text):
    text = text.replace('CPU time per frame · Lower is better', 'CPU-side frame work · milliseconds · Lower is better')
    text = text.replace('CPU time per step · Lower is better', 'CPU time per step · milliseconds · Lower is better')
    text = text.replace('The measurement is valid. The scene does not fit in one frame.', 'The measured region alone exceeds that interval; this is not a whole-application frame-rate measurement.')
    text = text.replace('Nothing measured is discarded.', 'The full report retains the measured rows and explains exclusions; headline cards select declared comparable rows.')
    if 'What these measurements cover' not in text:
        marker = '        {leading === undefined ? ('
        addition = '''        <details class="scope">
            <summary>What these measurements cover</summary>
            <p>Rendering records the declared CPU-side frame region; physics records one simulation step. Neither is GPU execution time, display latency, memory use, or a complete game loop. Compare equal scenario loads within the selected profile, not ratios across different machines.</p>
            <p>Equivalent supported workloads are compared; an unsupported arm is absent rather than assigned zero. Published values pool independent runs. A pooled p95 is the median of the run p95 values, not a percentile of concatenated samples. Reporting bands are policy, not statistical confidence intervals.</p>
            <p>The <a href="https://github.com/Exoridus/ExoJS/blob/next/packages/exojs-bench/docs/harness.md">methodology</a> defines the measurement regions and fairness rules. The <a href="https://github.com/Exoridus/ExoJS/blob/next/packages/exojs-bench/results/README.md">reproduction instructions</a> describe acquisition and provenance. Hashes detect content inconsistency; they do not independently attest to the hardware or execution.</p>
        </details>

'''
        assert marker in text
        text = text.replace(marker, addition + marker, 1)
    return text
edit('site/src/components/pages/BenchmarksPage.astro', benchmark)
edit('site/src/components/pages/BenchFullResultsPage.astro', lambda text: text.replace('The tables behind the benchmark overview: every measured load, with its spread, its p95 and the rows the harness left out.', 'Every measured load, run spread, pooled per-run p95, and documented exclusion. Read each profile with its own machine, browser, and engine revision; differences across profiles do not isolate one cause.'))

# Old Guide URLs remain deliberate redirects, not duplicate authored chapters.
config = Path('site/astro.config.mjs')
if not config.exists():
    config = Path('site/astro.config.ts')
# Route content is generated explicitly; avoid assumptions about the config's redirect merge behavior.
merges = json.loads(Path('_migration/navigation-map.json').read_text())['merges']
for locale in ['en', 'de']:
    for old, destination in merges.items():
        file = Path(f'site/src/pages/{locale}/guide/{old}/index.astro')
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('---\nconst target = `${import.meta.env.BASE_URL}' + locale + '/guide/' + destination + '/`;\n---\n<!doctype html>\n<html lang="' + locale + '"><head><meta charset="utf-8" /><meta name="robots" content="noindex" /><link rel="canonical" href={target} /><meta http-equiv="refresh" content={`0;url=${target}`} /><title>Guide page moved</title></head><body><p>This topic is now part of <a href={target}>the consolidated Guide chapter</a>.</p></body></html>\n')
        changed.append(str(file))

Path('_migration/site-materialization.json').write_text(json.dumps({'sourceCommit': json.loads(Path('_migration/source.json').read_text())['sourceCommit'], 'files': sorted(set(changed)), 'note': 'Complete edited site files are the deliverable; this materializer is temporary.'}, indent=2) + '\n')
print('SITE_FILES', len(set(changed)))
