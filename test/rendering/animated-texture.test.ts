import { Signal } from '#core/Signal';
import type { TextureSource } from '#core/types';
import { Sprite } from '#rendering/sprite/Sprite';
import { AnimatedTexture } from '#rendering/texture/AnimatedTexture';
import type { FrameSource } from '#rendering/texture/FrameSource';
import { Texture } from '#rendering/texture/Texture';

class ManualFrames implements FrameSource {
  public image: TextureSource = document.createElement('canvas');
  public revision = 0;
  public destroyed = false;
  public readonly onFrame = new Signal();

  public get width(): number {
    return (this.image as HTMLCanvasElement).width;
  }

  public get height(): number {
    return (this.image as HTMLCanvasElement).height;
  }

  public present(): void {
    this.revision++;
    this.onFrame.dispatch();
  }

  public destroy(): void {
    this.destroyed = true;
    this.onFrame.destroy();
  }
}

describe('dynamic frames in normal Texture', () => {
  test('new versions update the existing texture without new objects or extra uploads for unchanged frames', () => {
    const source = new ManualFrames();
    const texture = new Texture();

    texture._attachFrameSource(source, true);
    const first = texture.version;

    expect(texture.source).toBe(source.image);
    expect(texture.version).toBe(first);

    source.present();
    expect(texture.version).toBeGreaterThan(first);
    const next = texture.version;
    expect(texture.version).toBe(next);

    texture.destroy();
    expect(source.destroyed).toBe(true);
  });

  test('a retained Sprite invalidates its content when a source presents a new frame', () => {
    const frames = new ManualFrames();
    const texture = new Texture();
    const sprite = new Sprite(texture);
    const before = sprite._contentRevision;

    texture._attachFrameSource(frames, true);
    frames.present();

    expect(sprite._contentRevision).not.toBe(before);
    sprite.destroy();
    texture.destroy();
  });

  test('copying a donor shares the provider but only the donor owns its lifetime', () => {
    const source = new ManualFrames();
    const donor = new Texture();
    const handle = new Texture();

    donor._attachFrameSource(source, true);
    handle._copyPayloadFrom(donor);

    const first = handle.version;

    source.present();

    expect(handle.version).toBeGreaterThan(first);
    handle.setSource(null);
    expect(source.destroyed).toBe(false);

    donor.destroy();
    expect(source.destroyed).toBe(true);
    handle.destroy();
  });

  test('AnimatedTexture(path) remains a path handle with user playback options', () => {
    const texture = new AnimatedTexture('effects/fire.webp');

    expect(texture._pathAsset()).not.toBeNull();
    expect(texture.ready).toBe(false);
    expect(texture.playbackRate).toBe(1);

    texture.playbackRate = 2;
    texture.loop = false;
    texture.pause();

    expect(texture.playbackRate).toBe(2);
    expect(texture.loop).toBe(false);
    expect(texture.playing).toBe(false);
    texture.destroy();
  });
});
