import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { ScriptTarget, transpileModule } from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sceneClass = (path: string, name: string): new () => object => {
  const source = readFileSync(resolve(import.meta.dirname, '../../examples', `${path}.ts`), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
    .split('const app = new Application(')[0]!;
  const code = transpileModule(`${source}\n${name};`, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;

  return runInNewContext(code, {
    Scene: class {
      lifecycleSignal = new AbortController().signal;

      track<T>(value: T): T {
        return value;
      }
    },
    Color: class {
      static white = {};
    },
    Graphics: class {},
    Text: class {},
    ActionMap: class {
      constructor(actions: Record<string, unknown>) {
        Object.assign(this, actions);
      }
    },
    ButtonAction: class {
      pressed = false;
    },
    Keyboard: { Space: 1 },
    GamepadButton: { South: 2 },
    Asset: { type: (_type: string, source: string) => ({ source }) },
    assets: { uvGrid256: { source: '/grid.png' }, hueRamp: { source: '/ramp.png' }, pixelWhite: { source: '/pixel.png' } },
  }) as new () => object;
};

beforeEach(() => vi.clearAllMocks());

describe('curated loading queue', () => {
  it('retries only the failed row and leaves successful claims alone', async () => {
    const scene = new (sceneClass('application-scenes/loading-screen', 'BootScene'))() as unknown as {
      loader: { load: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
      panel: { status: ReturnType<typeof vi.fn> };
      states: string[];
      attempts: number[];
      loadAssets(broken: boolean): Promise<void>;
      retry(): Promise<void>;
    };
    scene.loader = {
      load: vi.fn((descriptor: { source: string }) =>
        descriptor.source.includes('.missing') ? Promise.reject(new Error('404')) : Promise.resolve(),
      ),
      release: vi.fn(),
    };
    scene.panel = { status: vi.fn() };
    await scene.loadAssets(true);
    expect(scene.states).toEqual(['loaded', 'loaded', 'failed']);
    expect(scene.attempts).toEqual([1, 1, 1]);
    scene.loader.load.mockClear();
    scene.loader.release.mockClear();
    await scene.retry();
    expect(scene.states).toEqual(['loaded', 'loaded', 'loaded']);
    expect(scene.attempts).toEqual([1, 1, 2]);
    expect(scene.loader.load).toHaveBeenCalledExactlyOnceWith({ source: '/pixel.png' });
    expect(scene.loader.release).not.toHaveBeenCalled();
  });
});

describe('curated dialogue', () => {
  const makeScene = () => {
    const scene = new (sceneClass('showcase/dialog-system', 'DialogSystemScene'))() as unknown as {
      chars: number;
      lineIndex: number;
      text: string;
      ending: number | null;
      pendingChoice: number | null;
      pendingAdvance: boolean;
      awaitingChoice: boolean;
      actions: { advance: { pressed: boolean } };
      continueButton: { label: string; visible: boolean };
      replyButtons: Array<{ visible: boolean; focus(): void }>;
      box: { text: string };
      caption: { setStatus: ReturnType<typeof vi.fn> };
      update(delta: number): void;
    };
    Object.assign(scene, {
      continueButton: { label: 'Continue', visible: true },
      replyButtons: [
        { visible: false, focus: vi.fn() },
        { visible: false, focus: vi.fn() },
      ],
      box: { text: '' },
      caption: { setStatus: vi.fn() },
    });

    return scene;
  };

  it('coalesces UI activation and the action in the same frame', () => {
    const scene = makeScene();
    scene.pendingAdvance = true;
    scene.actions.advance.pressed = true;
    scene.update(0);
    expect(scene.lineIndex).toBe(0);
    expect(scene.chars).toBe(scene.text.length);
  });
  it.each([0, 1])('choice %i begins its distinct consequence without advancing it twice', choice => {
    const scene = makeScene();
    scene.awaitingChoice = true;
    scene.pendingChoice = choice;
    scene.pendingAdvance = true;
    scene.actions.advance.pressed = true;
    scene.update(0);
    expect(scene.ending).toBe(choice);
    expect(scene.chars).toBe(0);
    expect(scene.text).toContain(choice === 0 ? 'safe crossing' : 'hidden garden');
    expect(scene.awaitingChoice).toBe(false);
    expect(scene.pendingAdvance).toBe(false);
  });
});
