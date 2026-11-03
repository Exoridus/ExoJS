import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as core from '@codexo/exojs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = readFileSync('examples/application-scenes/pixelfx-transitions.ts', 'utf8')
  .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '')
  .split('const app = new Application(')[0]!;
const code = ts.transpileModule(
  `${source}\n({ AtlasSession, DemoScene, setTransitions: value => transitions = value, getSelected: () => selected })`,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;

it('holds a rendered cover for one commit, opens after confirmation, and releases each session sprite', () => {
  const sprites: Array<{ frame: core.Rectangle; destroy: ReturnType<typeof vi.fn> }> = [];
  class Sprite {
    frame = new core.Rectangle();
    destroy = vi.fn();

    constructor() {
      sprites.push(this);
    }

    setTextureFrame(frame: core.Rectangle) {
      this.frame.copy(frame);
    }

    setPosition() {}

    setScale() {}
  }
  const { AtlasSession } = runInNewContext(code, { ...core, Sprite });
  const manifest = { width: 320, height: 180, fps: 30 };
  const effect = { frameCount: 6, columns: 3, coverStart: 2, coverEnd: 3 };
  const context = { screenView: { getBounds: () => ({ left: 0, top: 0, right: 1280, bottom: 720 }) }, render: vi.fn() };

  for (let repeat = 0; repeat < 2; repeat++) {
    const environment = { committed: false, commit: vi.fn() };
    const session = new AtlasSession(manifest, effect, {}, environment);
    const sprite = sprites[repeat]!;
    session.update(core.Time.seconds(1 / 30));
    session.render(context);
    expect(sprite.frame.x).toBe(320);
    expect(environment.commit).not.toHaveBeenCalled();
    session.update(core.Time.seconds(1 / 30));
    session.render(context);
    expect(sprite.frame.x).toBe(640);
    expect(environment.commit).not.toHaveBeenCalled();
    session.update(core.Time.seconds(1));
    session.render(context);
    expect(sprite.frame).toMatchObject({ x: 0, y: 180 });
    expect(environment.commit).not.toHaveBeenCalled();
    session.update(core.Time.seconds(1));
    expect(environment.commit).toHaveBeenCalledTimes(1);
    session.update(core.Time.seconds(1));
    session.render(context);
    expect(sprite.frame).toMatchObject({ x: 0, y: 180 });
    environment.committed = true;
    session.update(core.Time.seconds(1));
    session.render(context);
    expect(sprite.frame.y).toBe(180);
    expect(sprite.frame.x).toBe(0);
    session.update(core.Time.seconds(1 / 30));
    session.render(context);
    expect(sprite.frame.x).toBe(320);
    session.update(core.Time.seconds(1 / 30));
    expect(session.done).toBe(true);
    expect(environment.commit).toHaveBeenCalledTimes(1);
    session.destroy();
    expect(sprite.destroy).toHaveBeenCalledOnce();
  }
});

it('ignores replay and effect changes while navigation is pending', async () => {
  const { DemoScene, setTransitions, getSelected } = runInNewContext(code, { ...core });
  let finish!: () => void;
  const change = vi.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  const scene = new DemoScene();
  Object.defineProperty(scene, 'app', { value: { scenes: { change } } });
  setTransitions([{}, {}, {}]);
  scene.select(1);
  scene.play();
  scene.select(2);
  scene.play();
  expect(getSelected()).toBe(1);
  expect(change).toHaveBeenCalledOnce();
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  scene.select(2);
  expect(getSelected()).toBe(2);
});
