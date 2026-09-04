import { describe, expect, it } from 'vitest';

import { defineRendererBinding } from '#extensions/defineRendererBinding';
import type { Drawable } from '#rendering/Drawable';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { Text } from '#rendering/text/Text';

const stubRenderer = <Target extends Drawable>(): Renderer<RenderBackend, Target> => ({
  backendType: RenderBackendType.WebGl2,
  connect: () => undefined,
  disconnect: () => undefined,
  render: () => undefined,
  flush: () => undefined,
});

describe('defineRendererBinding', () => {
  it('returns the plain descriptor the extension array consumes', () => {
    const renderer = stubRenderer<Sprite>();
    const binding = defineRendererBinding([Sprite], () => renderer);

    expect(binding.targets).toEqual([Sprite]);
    expect(binding.create({} as RenderBackend)).toBe(renderer);
  });

  it('accepts a renderer covering every target of a multi-target binding', () => {
    const renderer = stubRenderer<Text | BitmapText>();
    const binding = defineRendererBinding([Text, BitmapText], () => renderer);

    expect(binding.targets).toEqual([Text, BitmapText]);
  });

  it('passes undefined through for an unsupported backend', () => {
    const binding = defineRendererBinding([Sprite], () => undefined);

    expect(binding.create({} as RenderBackend)).toBeUndefined();
  });

  it('rejects a renderer that does not match the declared targets', () => {
    // @ts-expect-error a Sprite renderer cannot serve a Mesh target
    const binding = defineRendererBinding([Mesh], () => stubRenderer<Sprite>());

    expect(binding.targets).toEqual([Mesh]);
  });

  it('rejects a renderer that covers only part of a multi-target binding', () => {
    // @ts-expect-error the binding also targets BitmapText
    const binding = defineRendererBinding([Text, BitmapText], () => stubRenderer<Text>());

    expect(binding.targets).toEqual([Text, BitmapText]);
  });
});
