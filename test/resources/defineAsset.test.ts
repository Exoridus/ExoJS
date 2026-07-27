import { describe, expect, it } from 'vitest';

import type { AssetHandler } from '#extensions/Extension';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { getAssetKind } from '#resources/assetKindRegistry';
import { defineAsset } from '#resources/defineAsset';
import { resolveKindByPath } from '#resources/extensionKindRegistry';
import { textureSeamlessAdapter } from '#resources/seamless';
import { Json } from '#resources/tokens';

// This file does NOT import coreAssetBindings, so the module-level kind/extension
// registries start empty (vitest isolates modules per file). Each defineAsset
// call is the sole registrant of its kind here.

const noopHandler = (): AssetHandler => ({
  load: () => Promise.resolve(undefined),
});

describe('defineAsset', () => {
  it('returns a binding and registers a resource (seamless) kind + its extensions', () => {
    const binding = defineAsset({
      ctor: Texture,
      type: 'texture',
      extensions: ['png', 'jpg'],
      seamless: textureSeamlessAdapter,
      create: noopHandler,
    });

    expect(binding.ctor).toBe(Texture);
    expect(binding.type).toBe('texture');
    expect(binding.typeNames).toEqual(['texture']);
    expect(binding.extensions).toEqual(['png', 'jpg']);
    expect(binding.seamless).toBe(textureSeamlessAdapter);

    expect(getAssetKind('texture')).toEqual({ adapter: textureSeamlessAdapter, isValue: false });
    expect(resolveKindByPath('a/b.png')).toBe('texture');
    expect(resolveKindByPath('a/b.jpg')).toBe('texture');
  });

  it('defaults typeNames to [kind] and isValue to true for a value kind', () => {
    const binding = defineAsset({
      ctor: Json as never,
      type: 'json',
      extensions: ['json'],
      create: noopHandler,
    });

    expect(binding.typeNames).toEqual(['json']);
    expect(binding.seamless).toBeUndefined();
    expect(getAssetKind('json')).toEqual({ isValue: true });
    expect(resolveKindByPath('level.json')).toBe('json');
  });

  it('honours an explicit typeNames list', () => {
    const binding = defineAsset({
      ctor: Json as never,
      type: 'vtt',
      typeNames: ['vtt', 'srt'],
      extensions: ['vtt'],
      create: noopHandler,
    });

    expect(binding.typeNames).toEqual(['vtt', 'srt']);
    expect(resolveKindByPath('subs.vtt')).toBe('vtt');
  });

  it('does NOT globally register a non-leaf resource kind (isValue:false, no adapter)', () => {
    const binding = defineAsset({
      ctor: BmFont,
      type: 'bmFont',
      extensions: ['fnt'],
      isValue: false,
      create: noopHandler,
    });

    // The binding still carries its extension for the per-loader materialize path…
    expect(binding.extensions).toEqual(['fnt']);
    // …but the GLOBAL kind/extension registries stay untouched: a non-leaf kind
    // has no placeholder strategy, so bare-path inference must not resolve it.
    expect(getAssetKind('bmFont')).toBeUndefined();
    expect(resolveKindByPath('font.fnt')).toBeUndefined();
  });
});
