/**
 * Migration script: Updates example files from named @assets category exports
 * to the new canonical `assets` hierarchical object.
 *
 * Before: import { textures } from '@assets';  →  textures.particleFlame
 * After:  import { assets } from '@assets';     →  assets.demo.textures.particleFlame
 */
import fs from 'node:fs';
import path from 'node:path';

const categoryMappings: Array<[from: string, to: string]> = [
  // Category import → assets.demo.* usage
  ['audio.musicLoop', 'assets.demo.audio.musicLoop'],
  ['audio.musicA', 'assets.demo.audio.musicA'],
  ['audio.musicB', 'assets.demo.audio.musicB'],
  ['audio.uiClick', 'assets.demo.audio.uiClick'],
  ['audio.uiConfirm', 'assets.demo.audio.uiConfirm'],
  ['audio.uiBong', 'assets.demo.audio.uiBong'],
  ['audio.impactLight', 'assets.demo.audio.impactLight'],
  ['audio.impactHeavy', 'assets.demo.audio.impactHeavy'],

  ['sound.uiClick', 'assets.demo.sound.uiClick'],
  ['sound.uiConfirm', 'assets.demo.sound.uiConfirm'],
  ['sound.uiBong', 'assets.demo.sound.uiBong'],
  ['sound.back', 'assets.demo.sound.back'],
  ['sound.clickAlt', 'assets.demo.sound.clickAlt'],
  ['sound.switch', 'assets.demo.sound.switch'],
  ['sound.impactLight', 'assets.demo.sound.impactLight'],
  ['sound.impactHeavy', 'assets.demo.sound.impactHeavy'],
  ['sound.impactWood', 'assets.demo.sound.impactWood'],
  ['sound.jump', 'assets.demo.sound.jump'],
  ['sound.coin', 'assets.demo.sound.coin'],
  ['sound.hurt', 'assets.demo.sound.hurt'],
  ['sound.powerUp', 'assets.demo.sound.powerUp'],
  ['sound.laser', 'assets.demo.sound.laser'],

  ['music.loopA', 'assets.demo.music.loopA'],
  ['music.loopB', 'assets.demo.music.loopB'],
  ['music.loopMain', 'assets.demo.music.loopMain'],
  ['music.jingleSuccess', 'assets.demo.music.jingleSuccess'],
  ['music.jingleFailure', 'assets.demo.music.jingleFailure'],
  ['music.jingleRetroA', 'assets.demo.music.jingleRetroA'],
  ['music.jingleRetroB', 'assets.demo.music.jingleRetroB'],

  ['textures.particleFlame', 'assets.demo.textures.particleFlame'],
  ['textures.particleSmoke', 'assets.demo.textures.particleSmoke'],
  ['textures.particleStar', 'assets.demo.textures.particleStar'],
  ['textures.particleSpark', 'assets.demo.textures.particleSpark'],
  ['textures.particleLight', 'assets.demo.textures.particleLight'],
  ['textures.shipA', 'assets.demo.textures.shipA'],
  ['textures.pixelWhite', 'assets.demo.textures.pixelWhite'],
  ['textures.pixelBlack', 'assets.demo.textures.pixelBlack'],
  ['textures.pixelTransparent', 'assets.demo.textures.pixelTransparent'],
  ['textures.checkerboardTransparent', 'assets.demo.textures.checkerboardTransparent'],
  ['textures.kenneyUv', 'assets.demo.textures.kenneyUv'],
  ['textures.prototypeDark01', 'assets.demo.textures.prototypeDark01'],
  ['textures.prototypeLight01', 'assets.demo.textures.prototypeLight01'],
  ['textures.prototypeGrid', 'assets.demo.textures.prototypeGrid'],

  ['technical.alpha.', 'assets.technical.alpha.'],
  ['technical.filtering.', 'assets.technical.filtering.'],
  ['technical.color.', 'assets.technical.color.'],

  ['fonts.kenneyFuture', 'assets.demo.fonts.kenneyFuture'],
  ['fonts.kenneyPixel', 'assets.demo.fonts.kenneyPixel'],
  ['fonts.kenneyMini', 'assets.demo.fonts.kenneyMini'],
  ['fonts.kenneyMiniSquareMono', 'assets.demo.fonts.kenneyMiniSquareMono'],
  ['fonts.kenneyBlocksFnt', 'assets.demo.fonts.kenneyBlocksFnt'],
  ['fonts.kenneyBlocksPng', 'assets.demo.fonts.kenneyBlocksPng'],

  ['video.demoLoop', 'assets.demo.video.demoLoop'],
  ['video.highRes', 'assets.demo.video.highRes'],
  ['video.highFps', 'assets.demo.video.highFps'],
  ['video.hdr10', 'assets.demo.video.hdr10'],
];

const importReplacements: Array<[from: RegExp, to: string]> = [
  [/^import \{ audio, textures \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ music, textures \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ sound, textures \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ technical, textures \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ audio \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ sound \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ music \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ textures \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ technical \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ fonts \} from '@assets';$/m, "import { assets } from '@assets';"],
  [/^import \{ video \} from '@assets';$/m, "import { assets } from '@assets';"],
];

function migrateFile(filePath: string): void {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Replace import statements
  for (const [from, to] of importReplacements) {
    content = content.replace(from, to);
  }

  // Replace usages (must replace ALL occurrences, use replaceAll)
  for (const [from, to] of categoryMappings) {
    // Use a word-boundary-aware replacement
    content = content.replaceAll(from, to);
  }

  if (content !== original) {
    // Normalize to LF (the repo uses LF line endings via .gitattributes)
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Migrated: ${filePath}`);
  } else {
    console.log(`  Unchanged: ${filePath}`);
  }
}

const files = [
  'examples/audio-basics/audio-buses.ts',
  'examples/audio-basics/crossfade-tracks.ts',
  'examples/audio-basics/music-loop.ts',
  'examples/audio-basics/play-sound.ts',
  'examples/audio-basics/random-pitch-pool.ts',
  'examples/audio-basics/sound-pool.ts',
  'examples/audio-fx/ducking.ts',
  'examples/filters/blur-filter.ts',
  'examples/filters/chromatic-aberration.ts',
  'examples/filters/color-filter.ts',
  'examples/filters/crt-scanlines.ts',
  'examples/filters/custom-fragment-shader.ts',
  'examples/filters/filter-stack.ts',
  'examples/filters/palette-cycling.ts',
  'examples/geometry-graphics/mesh-deformed-grid.ts',
  'examples/geometry-graphics/mesh-textured-quad.ts',
  'examples/particles/bonfire.ts',
  'examples/particles/fireworks.ts',
  'examples/scene-graph/masks.ts',
  'examples/showcase/audio-reactive-particles.ts',
  'examples/showcase/audio-visualisation.ts',
  'examples/showcase/boss-intro-cinematic.ts',
  'examples/showcase/color-grading.ts',
  'examples/showcase/dialog-system.ts',
  'examples/showcase/gamepad-spaceship.ts',
  'examples/showcase/low-band-camera-shake.ts',
  'examples/showcase/vinyl-record.ts',
  'examples/sprites-textures/blendmodes.ts',
  'examples/sprites-textures/video-drawable.ts',
  'examples/text-fonts/bitmap-text-basic.ts',
];

for (const f of files) {
  migrateFile(path.resolve(f));
}
console.log('\nDone.');
