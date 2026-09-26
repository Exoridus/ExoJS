#!/usr/bin/env python3
"""Check generated documentation navigation against the actual static output."""
import json
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

root = Path('site/dist').resolve()
base = 'https://local.invalid/ExoJS/'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.ids = set()
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if 'id' in values:
            self.ids.add(values['id'])
        if tag == 'a' and 'name' in values:
            self.ids.add(values['name'])
        if tag == 'a' and values.get('href'):
            self.links.append(values['href'])

@lru_cache(maxsize=None)
def read(file):
    return Page(Path(file).read_text())

pages = sorted(set(root.glob('en/guide/**/*.html')) | set(root.glob('de/guide/**/*.html')) | {root / locale / suffix / 'index.html' for locale in ['en', 'de'] for suffix in ['', 'api', 'benchmarks', 'benchmarks/full']})
errors = []
checked = 0
for file in pages:
    if not file.is_file():
        errors.append({'source': str(file.relative_to(root)), 'error': 'missing source page'})
        continue
    source = str(file.relative_to(root))
    source_url = base + source.removesuffix('index.html')
    for href in read(str(file)).links:
        url = urlsplit(urljoin(source_url, href))
        if url.netloc != 'local.invalid' or url.scheme not in ['https', 'http']:
            continue
        if not url.path.startswith('/ExoJS/'):
            errors.append({'source': source, 'href': href, 'error': 'link escapes configured site base'})
            continue
        path = unquote(url.path[len('/ExoJS/'):])
        target = root / path
        if target.is_dir() or not target.suffix:
            target = target / 'index.html'
        checked += 1
        if not target.is_file():
            errors.append({'source': source, 'href': href, 'error': 'target file missing'})
        elif url.fragment and target.suffix == '.html' and unquote(url.fragment) not in read(str(target)).ids:
            errors.append({'source': source, 'href': href, 'error': 'target anchor missing'})
report = {'pages': len(pages), 'links': checked, 'errors': errors}
Path('_migration/built-links.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'pages': len(pages), 'links': checked, 'errorCount': len(errors), 'firstErrors': errors[:60]}, indent=2))
raise SystemExit(bool(errors))
