/**
 * Animated widget backgrounds: the `kind: 'animated'` descriptor, the node
 * `WidgetBackground` builds for it, and the reuse rules that keep a repaint
 * from rewinding a running clip.
 */

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import type { Texture } from '#rendering/texture/Texture';
import { Panel } from '#ui/Panel';
import type { UIAnimatedBackground } from '#ui/theme';

const texture = (width = 128, height = 128): Texture => ({ width, height }) as unknown as Texture;

const clips = {
  idle: { frames: [new Rectangle(0, 0, 32, 32), new Rectangle(32, 0, 32, 32)], fps: 10 },
  alert: { frames: [new Rectangle(0, 32, 32, 32)], fps: 10 },
};

const animated = (overrides: Partial<UIAnimatedBackground> = {}): UIAnimatedBackground => ({
  kind: 'animated',
  texture: texture(),
  clips,
  clip: 'idle',
  ...overrides,
});

const spriteOf = (panel: Panel): AnimatedSprite => {
  const node = panel.backgroundNode;

  if (!(node instanceof AnimatedSprite)) {
    throw new Error('expected the panel to paint an AnimatedSprite');
  }

  return node;
};

describe('animated widget background', () => {
  test('paints a playing clip stretched to the widget box', () => {
    const panel = new Panel({ width: 200, height: 80, background: animated() });
    const sprite = spriteOf(panel);

    expect(sprite.currentClip).toBe('idle');
    expect(sprite.playing).toBe(true);
    expect(sprite.width).toBeCloseTo(200);
    expect(sprite.height).toBeCloseTo(80);

    panel.destroy();
  });

  test('resizing the widget restretches the same sprite', () => {
    const panel = new Panel({ width: 200, height: 80, background: animated() });
    const sprite = spriteOf(panel);

    panel.setSize(50, 40);

    expect(panel.backgroundNode).toBe(sprite);
    expect(sprite.width).toBeCloseTo(50);
    expect(sprite.height).toBeCloseTo(40);

    panel.destroy();
  });

  test('a repaint with the same atlas and clip does not rewind playback', () => {
    const panel = new Panel({ width: 200, height: 80, background: animated() });
    const sprite = spriteOf(panel);

    sprite.update(0.15);

    const frame = sprite.currentFrame;

    expect(frame).not.toBe(0);

    panel.setSize(120, 60);

    expect(panel.backgroundNode).toBe(sprite);
    expect(sprite.currentFrame).toBe(frame);

    panel.destroy();
  });

  test('naming a different clip switches it without replacing the node', () => {
    const source = texture();
    const panel = new Panel({ width: 200, height: 80, background: animated({ texture: source }) });
    const sprite = spriteOf(panel);

    panel.setBackground(animated({ texture: source, clip: 'alert' }));

    expect(panel.backgroundNode).toBe(sprite);
    expect(sprite.currentClip).toBe('alert');

    panel.destroy();
  });

  test('a different atlas builds a new sprite', () => {
    const panel = new Panel({ width: 200, height: 80, background: animated() });
    const first = spriteOf(panel);

    panel.setBackground(animated({ texture: texture(64, 64) }));

    expect(panel.backgroundNode).not.toBe(first);
    expect(first.destroyed).toBe(true);

    panel.destroy();
  });

  test('switching to another kind of background drops the sprite', () => {
    const panel = new Panel({ width: 200, height: 80, background: animated() });
    const sprite = spriteOf(panel);

    panel.setBackground(new Color(1, 0, 0, 1));

    expect(panel.backgroundNode).toBeInstanceOf(Graphics);
    expect(sprite.destroyed).toBe(true);

    panel.destroy();
  });
});
