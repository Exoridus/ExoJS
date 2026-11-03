# Notices

**Hugo Duprez.** `src/core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.

**Hollow Crown.** `src/core/act.js` adapts how Hollow Crown plays its skills (poses on 12 fps steps, hit-stops, the springy
straw target), from
https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026 rehan-remade, MIT License.

**Patch Pixel.** The font in `gallery/fonts` is Patch's own and is not covered by this repository's MIT license. See
`gallery/fonts/NOTICE.md`.

## Vendored subset

Source: https://github.com/patch-gg/pixelfx at a84159688af3ca37a4be05a0d422b94451b2e24e. The upstream core, three transition modules and their shared helper, and the dependency-free PNG encoder are retained without source edits as text snapshots. The generator materializes their original filenames in a temporary directory.

Burn Away adapts Sprite Fusion fire; Pixel Dissolve, Star Iris and the shared glint helper adapt Sprite Fusion sparkle. The core simulation also adapts Sprite Fusion VFX. The retained core act module adapts Hollow Crown (MIT, Copyright (c) 2026 rehan-remade); it is imported by the upstream barrel but no actor or act is rendered.

No gallery assets or gallery/fonts are included or used. The built-in core bitmap font is part of the MIT source and is used only for contact-sheet frame labels.
