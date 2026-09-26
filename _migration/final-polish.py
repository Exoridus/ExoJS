#!/usr/bin/env python3
"""Fix observed stale URLs and preserve previously published part entry points."""
import json
import re
import subprocess
from pathlib import Path

file = Path('site/src/content/guide/rendering/infinite-maps.mdx')
text = file.read_text()
for slug in ['worker-streamed-terrain', 'tiled-infinite-map']:
    old = f'/ExoJS/en/examples/tilemap/{slug}/'
    new = f'/ExoJS/en/playground/?example=tilemap/{slug}'
    assert old in text or new in text, slug
    text = text.replace(old, new)
file.write_text(text)

meta = json.loads(Path('_migration/navigation-map.json').read_text())
source = subprocess.check_output(['git', 'show', f"{meta['sourceCommit']}:site/src/lib/guide-structure.ts"], text=True)
original = re.findall(r"^    slug: '([^']+)'[\s\S]*?^        slug: '([^']+)'", source, re.M)
parts = {part['slug'] for part in meta['parts']}
paths = {chapter['path'] for part in meta['parts'] for chapter in part['chapters']}
redirects = []
for part, first in original:
    if part in parts:
        continue
    target = meta['merges'].get(f'{part}/{first}', f'{part}/{first}')
    assert target in paths, target
    for locale in ['en', 'de']:
        route = Path(f'site/src/pages/{locale}/guide/{part}/index.astro')
        assert not route.exists(), f'Refusing to replace a pre-existing route: {route}'
        route.parent.mkdir(parents=True, exist_ok=True)
        route.write_text('---\nconst target = `${import.meta.env.BASE_URL}' + locale + '/guide/' + target + '/`;\n---\n\n<!doctype html>\n<html lang="' + locale + '">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="robots" content="noindex" />\n    <link rel="canonical" href={target} />\n    <meta http-equiv="refresh" content={`0;url=${target}`} />\n    <title>ExoJS Guide</title>\n  </head>\n  <body><p><a href={target}>Continue to the guide</a></p></body>\n</html>\n')
        redirects.append({'path': str(route), 'target': target})
print(json.dumps({'restoredPartRoutes': redirects}, indent=2))
