import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const readScene = (file: string, expression: string, additions: Record<string, unknown> = {}): unknown => {
  const source = readFileSync(resolve('examples', `${file}.ts`), 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

  return runInNewContext(`${compiled}\n${expression}`, { ...Exo, ...additions });
};

interface RebindingScene {
  rebinding: boolean;
  message: string;
  actions: Exo.ActionMap<{ move: Exo.VectorAction; pulse: Exo.ButtonAction }>;
  profile: Exo.BindingProfile;
  onKeyDown(channel: number): void;
}

const rebindScene = (storage: { setItem(key: string, value: string): void }): RebindingScene =>
  readScene('input/action-mapping', 'new ActionMappingScene()', { localStorage: storage }) as RebindingScene;

describe('B3 input and camera contracts', () => {
  it('rejects movement conflicts, cancels capture, and persists a rebound pulse with its gamepad alternative', () => {
    let saved = '';
    const storage = {
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    const scene = rebindScene(storage);
    scene.rebinding = true;
    scene.onKeyDown(Exo.Keyboard.W);
    expect(scene.rebinding).toBe(true);
    expect(scene.message).toContain('Conflict');
    expect(scene.actions.pulse.channels).toContain(Exo.Keyboard.Space);
    scene.onKeyDown(Exo.Keyboard.Escape);
    expect(scene.rebinding).toBe(false);
    expect(saved).toBe('');
    scene.rebinding = true;
    scene.onKeyDown(Exo.Keyboard.Q);
    expect(scene.rebinding).toBe(false);
    expect(scene.actions.pulse.channels).toContain(Exo.Keyboard.Q);
    expect(scene.actions.pulse.channels).toContain(Exo.GamepadButton.South);
    const reloaded = rebindScene(storage);
    reloaded.actions.applyProfile(Exo.BindingProfile.fromJSON(JSON.parse(saved)));
    expect(reloaded.actions.pulse.channels).toEqual(scene.actions.pulse.channels);
    reloaded.actions.applyProfile(null);
    expect(reloaded.actions.pulse.channels).toContain(Exo.Keyboard.Space);
  });

  it('keeps nose, muzzle, flame axis and acceleration aligned in all eight headings', () => {
    const rotate = readScene('showcase/gamepad-spaceship', 'headingToRotation') as (heading: number) => number;
    const ship = new Exo.Container().setPosition(400, 300);
    const muzzle = new Exo.Container().setPosition(0, -32);
    const flame = new Exo.Container().setPosition(0, 30);
    ship.addChild(muzzle);
    ship.addChild(flame);

    for (let i = 0; i < 8; i++) {
      const heading = (i * Math.PI) / 4;
      ship.setRotation(rotate(heading));
      const nose = new Exo.Vector(0, 0).transform(muzzle.getGlobalTransform()).subtract(400, 300);
      const tail = new Exo.Vector(0, 0).transform(flame.getGlobalTransform()).subtract(400, 300);
      expect(nose.x / 32).toBeCloseTo(Math.cos(heading), 8);
      expect(nose.y / 32).toBeCloseTo(Math.sin(heading), 8);
      expect(tail.x / 30).toBeCloseTo(-Math.cos(heading), 8);
      expect(tail.y / 30).toBeCloseTo(-Math.sin(heading), 8);
    }

    ship.destroy();
  });

  it('converts clockwise gesture radians to counterclockwise scene degrees and clamps pinch scale', () => {
    const scene = readScene('input/multitouch', 'new MultitouchScene()') as {
      onRotate(delta: number, x: number, y: number): void;
      onPinch(scale: number, x: number, y: number): void;
      gestureDegrees: number;
      gestureScale: number;
    };
    scene.onRotate(Math.PI / 2, 400, 300);
    expect(scene.gestureDegrees).toBeCloseTo(-90);
    scene.onPinch(100, 400, 300);
    expect(scene.gestureScale).toBe(3);
    scene.onPinch(0.001, 400, 300);
    expect(scene.gestureScale).toBe(0.25);
  });
});
