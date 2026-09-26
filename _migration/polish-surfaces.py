#!/usr/bin/env python3
"""Apply bounded editorial corrections; never change runtime implementation."""
import re
from pathlib import Path

changed = []

def edit(name, replacements):
    path = Path(name)
    text = path.read_text()
    before = text
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new)
    if text != before:
        path.write_text(text)
        changed.append(name)

edit('site/README.md', [('Astro + Lit docs/playground app', 'Astro + React docs/playground app'), ('Astro pages and Lit playground shell', 'Astro pages and React playground shell')])
edit('packages/exojs-react/README.md', [
    ("import { Color } from '@codexo/exojs';", "import { Color, FadeSceneTransition, Time } from '@codexo/exojs';"),
    ("import { TitleScene, GameScene } from './scenes';\n\nfunction Game()", "import { TitleScene, GameScene } from './scenes';\n\nconst transition = new FadeSceneTransition({ duration: Time.seconds(0.3) });\n\nfunction Game()"),
    ('transition={{ type: \'fade\', duration: 300 }}', 'transition={transition}'),
    ("size it to drive `'fill'`/`'letterbox'` sizing.", 'size it for the configured canvas sizing policy.'),
])
edit('site/src/content/guide/input/keyboard-and-actions.mdx', [
    ('ExoJS does not ship a dedicated action-map abstraction layer. Instead, the existing binding API supports multi-channel arrays and the scene-scoped `this.inputs` registry gives you automatic cleanup. You structure the mapping yourself, but the pieces are already in place.', 'Use `ActionMap` with typed `ButtonAction`, `AxisAction`, or `VectorAction` values to name gameplay intent. Attach the map through `this.inputs.attach(actions)` so its bindings follow the scene lifetime, then read its values in `update`. The lower-level multi-channel bindings below remain useful for individual shortcuts; they are not a replacement for the action-map API.'),
    ('`onTrigger` for one-shot actions: jump, shoot, menu open/close, toggle.', '`onTrigger` for release-time taps: menu toggles or actions that deliberately wait for a short press to finish.'),
    ("`onStart` for actions that fire once on press and don't care about release timing: inventory open, screenshot.", '`onStart` for immediate press-time actions: jump, shoot, inventory open, or screenshot.'),
])
edit('site/src/content/guide/recipes/game-feel.mdx', [
    ('Each pattern is fire-and-forget — call `.start()` inside an event handler and the tween runs to completion. No per-frame tracking, no cleanup. The existing tween system handles all active tweens each frame.', 'Call `.start()` inside an event handler and the tween system advances the animation each frame. Lifetime still matters: use scene-scoped tweens for scene-owned targets, or retain and stop application-level tweens before their targets are destroyed. Repeated triggers also need an explicit interrupt-or-replace policy.'),
])
edit('site/src/components/pages/HomePage.astro', [
    ('<span class="file">game.ts</span>', '<span class="file">basic-lightmap.ts</span>'),
    ('Post-processing, bloom, blur, particles — composable and GPU-accelerated.', 'Compose filters and optional particles; simulation uses a CPU or eligible WebGPU compute path.'),
])
print('EDITORIAL_POLISH', '\n'.join(changed))
