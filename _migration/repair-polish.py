#!/usr/bin/env python3
"""Repair the observed documentation errors without changing engine code."""
import re
from pathlib import Path

changed = []

def replace(path, old, new):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        if new in text:
            return
        raise AssertionError(f'Expected source text missing in {path}: {old[:80]}')
    file.write_text(text.replace(old, new))
    changed.append(path)

replace('packages/exojs-ldtk/README.md', "import { ldtkExtension, TileMapNode } from '@codexo/exojs-ldtk';", "import { ldtkExtension } from '@codexo/exojs-ldtk';\nimport { TileMapNode } from '@codexo/exojs-tilemap';")
replace('packages/exojs-ldtk/README.md', 'Runtime classes re-exported by the adapter are the same bindings as in `@codexo/exojs-tilemap`.', 'Import the format-neutral rendering nodes, including `TileMapNode`, from `@codexo/exojs-tilemap`; the adapter owns LDtk loading and conversion.')
replace('packages/exojs-pathfinding/README.md', 'const pathfinder = new Pathfinder(grid);\nconst route = pathfinder.findPathBetween({ x: 16, y: 16 }, { x: 336, y: 208 });', 'const pathfinder = new Pathfinder();\nconst route = pathfinder.findPathBetween(grid, 16, 16, 336, 208);')
replace('packages/exojs-pathfinding/README.md', 'console.log(route.waypoints);', 'console.log(route.points);')
replace('packages/exojs-pathfinding/README.md', '`findPathBetween` uses world points', '`findPathBetween` takes the navigation space followed by the start and goal world coordinates')
replace('packages/exojs-pathfinding/README.md', 'Incremental query budgets bound search work', 'Query budgets bound search work')
replace('_migration/check-readme-examples.py', "'include': ['*.ts']", "'include': ['*.ts', '../../src/typings.d.ts']")
replace('site/src/content/guide/recipes/ui-patterns.mdx', "Form elements (text inputs, dropdowns, sliders) — these don't exist in ExoJS's canvas rendering.", 'Browser-native forms and document semantics. Core also provides `TextInput`, `TextArea`, `Dropdown`, and `Slider`; choose DOM controls when native accessibility and integration with the surrounding page are required.')
replace('site/src/content/guide/recipes/ui-patterns.mdx', "Coordinate the two by listening to `app.input.onCanvasFocusChange` and toggling `pointer-events: none` on the DOM overlay when the game needs the pointer.", 'Coordinate focus and gameplay action availability explicitly. Use `pointer-events: none` only on display-only overlays; interactive DOM controls must retain their own pointer and keyboard input.')
replace('site/src/content/guide/recipes/ui-patterns.mdx', 'When progress reaches 1, the tween completes.', 'When progress reaches 1, the tween completes. This is animated progress, not evidence that loading succeeded; a real loading screen must derive completion and errors from its loading queue.')
replace('site/src/content/guide/debugging/authoring-extensions.mdx', '`@codexo/exojs-tilemap`, and `@codexo/exojs-physics` packages plug into the core.', '`@codexo/exojs-tilemap` packages plug into the core. Physics, pathfinding, and lighting are constructed directly instead; an optional package does not necessarily contribute an extension descriptor.')
replace('site/src/content/guide/debugging/authoring-extensions.mdx', 'The [previous chapter]', 'The [Custom renderers chapter]')
replace('site/src/content/guide/debugging/authoring-extensions.mdx', '0.15.x', '0.18.x')

# Grouping is now thematic. Existing contextual links remain useful, but no
# longer imply that their destination is the next numbered chapter.
for file in Path('site/src/content/guide').rglob('*.mdx'):
    text = file.read_text()
    after = re.sub(r'The next (?:chapter|recipe), (\[[^\]]+\]\([^\)]+\)), covers', r'Continue with \1, which covers', text)
    if after != text:
        file.write_text(after)
        changed.append(str(file))
print('REPAIRED', '\n'.join(sorted(set(changed))))
