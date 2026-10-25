// @vitest-environment node
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';

import { Ease, Scene, SceneAvailability, Time, TweenState } from '@codexo/exojs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { TweenSystem } from '#animation/TweenSystem';

interface TweenExample {
  position: { x: number; y: number };
  clock: { t: number };
  steps: Array<{ state: TweenState }>;
  motionPaused: boolean;
  moving: boolean;
  leg: number;
  panel: { values: { easing: keyof typeof Ease; mode: string }; set(key: string, value: string): void };
  moveTo(x: number, y: number): void;
  pause(): void;
  reset(): void;
}

const createTweenExample = (mode = 'One-way'): { scene: TweenExample; advance(seconds: number): void } => {
  const source = fs.readFileSync('examples/tweens-animation/tween-basics.ts', 'utf8');
  const body = source.slice(source.indexOf('class InteractiveTweensScene'), source.indexOf('const app = new Application'));
  const output = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  // Runnable examples bootstrap an application; expose only the scene class for isolated simulation.
  const Example = runInNewContext(`${output}; InteractiveTweensScene;`, { Scene, SceneAvailability, Ease, TweenState }) as {
    prototype: object;
  };
  const scene = Object.create(Example.prototype) as TweenExample;
  const system = new TweenSystem();
  const values = { easing: 'linear' as keyof typeof Ease, mode };

  Object.assign(scene, {
    position: { x: 0.5, y: 0.5 },
    clock: { t: 0 },
    steps: [],
    motionPaused: false,
    moving: false,
    leg: 0,
    panel: {
      values,
      set: (key: 'easing' | 'mode', value: string) => {
        Object.assign(values, { [key]: value });
      },
    },
  });
  Object.defineProperty(scene, 'tweens', { value: { create: (target: object) => system.create(target) } });

  return {
    scene,
    advance: seconds => {
      for (let frame = 0; frame < Math.round(seconds * 100); frame++) {
        system.preFrame(Time.seconds(0.01));
      }
    },
  };
};

describe('B1 tween interaction', () => {
  it('stops a replaced route, holds pause, and reaches only the replacement target', () => {
    const { scene, advance } = createTweenExample('Route');

    scene.moveTo(0.8, 0.2);
    advance(0.2);
    expect(scene.position.x).toBeCloseTo(0.5 + 0.3 * scene.clock.t, 10);
    const interrupted = [...scene.steps];

    scene.panel.values.mode = 'One-way';
    scene.moveTo(0.2, 0.7);
    expect(interrupted.every(tween => tween.state !== TweenState.Active)).toBe(true);
    scene.pause();
    const paused = { ...scene.position };
    const time = scene.clock.t;

    advance(0.3);
    expect(scene.position).toEqual(paused);
    expect(scene.clock.t).toBe(time);
    scene.pause();
    advance(4);
    expect(scene.position).toEqual({ x: 0.2, y: 0.7 });
    expect(scene.moving).toBe(false);
  });

  it.each(['Roundtrip', 'Route'])('%s returns to its starting position and resets its clock', mode => {
    const { scene, advance } = createTweenExample(mode);

    scene.moveTo(0.8, 0.2);
    advance(5);
    expect(scene.position).toEqual({ x: 0.5, y: 0.5 });
    expect(scene.leg).toBe(mode === 'Route' ? 4 : 2);
    expect(scene.moving).toBe(false);
    scene.reset();
    expect(scene.clock.t).toBe(0);
    expect(scene.steps).toEqual([]);
    expect(scene.panel.values).toEqual({ easing: 'sineInOut', mode: 'One-way' });
  });
});

describe('B1 bitmap material', () => {
  it('the comparison word and counter are present in the supplied atlas', () => {
    const descriptor = fs.readFileSync('examples/assets/demo/fonts/kenney-blocks-32.fnt', 'utf8');
    const glyphs = new Set([...descriptor.matchAll(/^char id=(\d+)/gm)].map(match => Number(match[1])));

    for (const character of 'PLAYCOUNT 0123456789') {
      expect(glyphs.has(character.codePointAt(0)!)).toBe(true);
    }

    expect(Object.keys(Ease)).toHaveLength(31);
  });
});
