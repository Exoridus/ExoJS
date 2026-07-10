import '#resources/coreAssetBindings'; // trigger core registrations at import

import { describe, expect, it } from 'vitest';

import { resolveKindByPath } from '#resources/extensionKindRegistry';

describe('core extension→kind registrations', () => {
  it.each([
    ['a/b.png', 'texture'],
    ['a/b.jpg', 'texture'],
    ['a/b.jpeg', 'texture'],
    ['a/b.webp', 'texture'],
    ['a/b.avif', 'texture'],
    ['a/b.gif', 'texture'],
    ['a/b.ogg', 'sound'],
    ['a/b.mp3', 'sound'],
    ['a/b.wav', 'sound'],
    ['a/b.m4a', 'sound'],
    ['a/b.aac', 'sound'],
    ['a/b.json', 'json'],
    ['a/b.txt', 'text'],
    ['a/b.csv', 'csv'],
    ['a/b.xml', 'xml'],
    ['a/b.vtt', 'vtt'],
    ['a/b.srt', 'srt'],
    ['a/b.bin', 'binary'],
    ['a/b.wasm', 'wasm'],
  ])('resolves %s → %s', (path, kind) => {
    expect(resolveKindByPath(path)).toBe(kind);
  });

  it.each([['a/b.woff'], ['a/b.fnt'], ['a/b.svg'], ['a/b.mp4']])('does NOT infer non-leaf-capable / unregistered suffix %s (use X.of or a config)', path => {
    expect(resolveKindByPath(path)).toBeUndefined();
  });
});
