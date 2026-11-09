import type { AudioEffect } from '#audio/AudioEffect';
import type { Loopable, Pausable, Playable, RatePitched, Seekable, Voice } from '#audio/Playable';
import type { Application } from '#core/Application';
import { SceneState } from '#core/scene/SceneState';
import { Time } from '#core/units';

import { mutable } from '../../support/mutable';

type FullVoice = Voice & Seekable & Pausable & Loopable & RatePitched;

describe('PendingVoice without an eager audio graph', () => {
  const OriginalAudioContext = globalThis.AudioContext;
  let created: number;
  let gains: GainNode[];
  let edges: Map<AudioNode, Set<AudioNode>>;
  let api: {
    scene: typeof import('#core/scene/SceneAudio');
    system: typeof import('#audio/AudioSystem');
    sound: typeof import('#audio/Sound');
    stream: typeof import('#audio/AudioStream');
    effect: typeof import('#audio/AudioEffect');
    context: typeof import('#audio/audioContext');
  };
  let dispose: Array<() => void>;
  let interactionListeners: Array<[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]>;

  beforeEach(async () => {
    vi.resetModules();
    created = 0;
    gains = [];
    edges = new Map();
    dispose = [];
    interactionListeners = [];

    class CountingAudioContext extends OriginalAudioContext {
      private readonly _events = new EventTarget();

      public constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        mutable(this).state = 'suspended';
        created++;
      }

      public override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        this._events.addEventListener(type, listener);
      }

      public override resume(): Promise<void> {
        mutable(this).state = 'running';
        this._events.dispatchEvent(new Event('statechange'));

        return Promise.resolve();
      }

      public override suspend(): Promise<void> {
        mutable(this).state = 'suspended';
        this._events.dispatchEvent(new Event('statechange'));

        return Promise.resolve();
      }

      public override createGain(): GainNode {
        const node = super.createGain();
        gains.push(node);
        const destinations = new Set<AudioNode>();
        edges.set(node, destinations);
        Object.assign(node, {
          connect: vi.fn((destination: AudioNode) => {
            destinations.add(destination);

            return destination;
          }),
          disconnect: vi.fn((destination?: AudioNode) => {
            if (destination === undefined) {
              destinations.clear();
            } else {
              destinations.delete(destination);
            }
          }),
        });

        return node;
      }
    }

    vi.stubGlobal('AudioContext', CountingAudioContext);
    const add = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((event, listener, options) => {
      interactionListeners.push([event, listener, options]);
      add(event, listener, options);
    });

    api = {
      scene: await import('#core/scene/SceneAudio'),
      system: await import('#audio/AudioSystem'),
      sound: await import('#audio/Sound'),
      stream: await import('#audio/AudioStream'),
      effect: await import('#audio/AudioEffect'),
      context: await import('#audio/audioContext'),
    };
  });

  afterEach(() => {
    for (const cleanup of dispose.reverse()) {
      cleanup();
    }

    for (const [event, listener, options] of interactionListeners) {
      document.removeEventListener(event, listener, options);
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const fixture = () => {
    const system = new api.system.AudioSystem();
    const sound = new api.sound.Sound({ duration: 10 } as AudioBuffer);
    let state = SceneState.Preparing;
    let paused = false;
    const audio = new api.scene.SceneAudio(
      { audio: system } as unknown as Application,
      () => state,
      () => paused,
    );

    dispose.push(
      () => system.destroy(),
      () => sound.destroy(),
      () => audio.destroy(),
    );

    return {
      system,
      sound,
      audio,
      activate: () => {
        state = SceneState.Active;
        audio._flushPending();
        audio._sync();
      },
      suspend: () => {
        state = SceneState.Suspended;
        audio._sync();
      },
      setPaused: (value: boolean) => {
        paused = value;
        audio._sync();
      },
    };
  };

  const unlock = async (): Promise<void> => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await Promise.resolve();
    expect(api.context.isAudioContextReady()).toBe(true);
    expect(created).toBe(1);
  };

  const stream = () => {
    const element = document.createElement('audio');
    Object.defineProperty(element, 'paused', { value: true, writable: true });
    vi.spyOn(element, 'play').mockImplementation(() => {
      mutable(element).paused = false;

      return Promise.resolve();
    });
    vi.spyOn(element, 'pause').mockImplementation(() => {
      mutable(element).paused = true;
    });
    const asset = new api.stream.AudioStream(element);
    dispose.push(() => asset.destroy());

    return { asset, element };
  };

  const effect = (initialize = true) => {
    class TestEffect extends api.effect.AudioEffect {
      private _input: GainNode | null = null;
      private _output: GainNode | null = null;

      public constructor() {
        super();

        if (initialize) {
          this._deferSetup(context => {
            this._input = context.createGain();
            this._output = context.createGain();
            this._input.connect(this._output);
          });
        }
      }

      public get inputNode(): AudioNode {
        if (this._input === null) {
          throw new Error('effect is not ready');
        }

        return this._input;
      }

      public get outputNode(): AudioNode {
        if (this._output === null) {
          throw new Error('effect is not ready');
        }

        return this._output;
      }

      public destroy(): void {
        this._input?.disconnect();
        this._output?.disconnect();
        this._teardown();
      }
    }

    const result = new TestEffect();
    dispose.push(() => result.destroy());

    return result;
  };

  test('registration before unlock does not construct a live AudioContext', () => {
    const { system, sound, audio } = fixture();
    expect(created).toBe(0);

    const voice = audio.play(sound);

    expect(voice.ended).toBe(false);
    expect(created).toBe(0);
    expect(system.locked).toBe(true);
    expect(gains).toHaveLength(0);
  });

  test('buffered controls and sends do not allocate nodes or read an effect graph', () => {
    const { system, sound, audio } = fixture();
    const voice = audio.play(sound) as FullVoice;
    const pendingEffect: AudioEffect = effect();
    voice.volume = 0.6;
    voice.fade(0.2, Time.seconds(1));
    voice.seek(3);
    voice.pause();
    voice.loop = true;
    voice.playbackRate = 1.5;
    voice.detune = 12;
    voice.position = { x: 4, y: 5 };
    voice.velocity = { x: 1, y: 2 };
    voice.addEffect(pendingEffect);
    voice.removeEffect(pendingEffect);
    const send = voice.addSend(system.music, 0.25);
    send.level = 0.75;

    expect(voice.sends).toEqual([send]);
    expect(send.level).toBe(0.75);
    expect(voice.time).toBe(3);
    expect(voice.paused).toBe(true);
    expect(created).toBe(0);
    expect(gains).toHaveLength(0);

    voice.removeSend(send);
    voice.stop();
    expect(send.destroyed).toBe(true);
    expect(created).toBe(0);
  });

  test('output never manufactures a placeholder, even after unlock before activation', async () => {
    const { audio, sound, activate } = fixture();
    const voice = audio.play(sound);

    expect(() => voice.output).toThrow('output');
    expect(created).toBe(0);
    await unlock();
    const before = gains.length;
    expect(() => voice.output).toThrow('output');
    expect(gains).toHaveLength(before);

    activate();
    const output = voice.output;
    expect(gains).toContain(output);
    expect(voice.output).toBe(output);
    voice.stop();
    expect(voice.output).toBe(output);
  });

  test('locked Sound flush ends once and releases deferred sends without creating a context', () => {
    const { audio, sound, system, activate } = fixture();
    const voice = audio.play(sound);
    const send = voice.addSend(system.music);
    const ended = vi.fn();
    voice.onEnd.add(ended);

    activate();
    audio._flushPending();
    voice.stop();

    expect(voice.ended).toBe(true);
    expect(send.destroyed).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(created).toBe(0);
    expect(gains).toHaveLength(0);
  });

  test('a stream flushed before unlock stays node-free and preserves its controls and sends', async () => {
    const { audio, system, activate } = fixture();
    const { asset } = stream();
    const voice = audio.play(asset);
    const send = voice.addSend(system.sound, 0.2);
    voice.pause();
    voice.seek(2);
    voice.loop = true;
    voice.playbackRate = 1.5;
    activate();

    expect(created).toBe(0);
    expect(gains).toHaveLength(0);
    expect(voice.ended).toBe(false);
    expect(() => voice.output).toThrow('output');
    send.level = 0.7;
    await unlock();

    expect(voice.sends).toEqual([send]);
    expect(send.destroyed).toBe(false);
    expect(send.level).toBe(0.7);
    expect(voice.time).toBe(2);
    expect(voice.paused).toBe(true);
    expect(voice.loop).toBe(true);
    expect(voice.playbackRate).toBe(1.5);
    expect(gains).toContain(voice.output);
  });

  test('a cached sends view and its handles survive flush and subsequent changes', async () => {
    const { audio, sound, system, activate } = fixture();
    const voice = audio.play(sound);
    const view = voice.sends;
    const send = voice.addSend(system.music, 0.2);
    await unlock();
    activate();

    expect(voice.sends).toBe(view);
    expect(view).toEqual([send]);
    const later = voice.addSend(system.sound, 0.3);
    expect(view).toEqual([send, later]);
    voice.removeSend(send);
    expect(view).toEqual([later]);
    voice.stop();
    expect(view).toHaveLength(0);
    expect(later.destroyed).toBe(true);
  });

  test('cancellation is terminal before callbacks reenter flush and stop', () => {
    const { audio, sound, system, activate } = fixture();
    const voice = audio.play(sound);
    const send = voice.addSend(system.music);
    const play = vi.spyOn(system, 'play');
    const ended = vi.fn(() => {
      expect(send.destroyed).toBe(true);
      expect(voice.sends).toHaveLength(0);
      voice.stop();
      activate();
    });
    voice.onEnd.add(ended);

    voice.stop();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(voice.onEnd.count).toBe(0);
    expect(play).not.toHaveBeenCalled();
    expect(created).toBe(0);
  });

  test('stop inside createVoice cancels the real voice returned afterwards', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    let real: Voice | undefined;
    const source: Playable = {
      createVoice: (owner, options) => {
        voice.stop();
        real = sound.createVoice(owner, options);

        return real;
      },
    };
    const voice = audio.play(source);
    const send = voice.addSend(system.music);
    const ended = vi.fn();
    voice.onEnd.add(ended);

    activate();
    expect(real?.ended).toBe(true);
    expect(voice.ended).toBe(true);
    expect(send.destroyed).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  test('recursive flush inside createVoice never creates a second real voice', async () => {
    const { audio, sound, activate } = fixture();
    await unlock();
    let calls = 0;
    const source: Playable = {
      createVoice: (system, options) => {
        calls++;

        if (calls === 1) {
          audio._flushPending();
        }

        return sound.createVoice(system, options);
      },
    };
    const voice = audio.play(source);

    activate();
    expect(calls).toBe(1);
    voice.stop();
  });

  test('a reentrant restore flushes voices registered during an in-progress creation', async () => {
    const { audio, sound, system, activate, suspend } = fixture();
    await unlock();
    let calls = 0;
    let nested: Voice | undefined;
    const source: Playable = {
      createVoice: (owner, options) => {
        calls++;

        if (calls === 1) {
          suspend();
          nested = audio.play(sound);
          nested.addSend(system.music);
          activate();
        }

        return sound.createVoice(owner, options);
      },
    };
    const voice = audio.play(source);

    activate();

    expect(calls).toBe(1);
    expect(() => nested!.output).not.toThrow();
    expect(nested?.sends[0]?.destroyed).toBe(false);
    expect(nested?.ended).toBe(false);
    voice.stop();
    nested?.stop();
  });

  test('option sends can be edited or removed before flush without duplication', async () => {
    const { audio, sound, system, activate } = fixture();
    const voice = audio.play(sound, {
      sends: [
        { bus: system.music, level: 0.2 },
        { bus: system.sound, level: 0.3 },
      ],
    });
    const [kept, removed] = voice.sends;

    expect(voice.sends).toHaveLength(2);
    kept!.level = 0.7;
    voice.removeSend(removed!);
    expect(removed!.destroyed).toBe(true);
    expect(created).toBe(0);
    await unlock();
    activate();

    expect(voice.sends).toEqual([kept]);
    expect(kept!.level).toBe(0.7);
    const destinations = [...edges.get(voice.output)!];
    expect(destinations).toHaveLength(2);
    const wet = destinations.find(node => node !== system.sound.inputNode) as GainNode;
    expect(wet.gain.value).toBe(0.7);
    expect(edges.get(wet)).toEqual(new Set([system.music.inputNode]));
  });

  test('sends remain connected through buffered and subsequent effect and bus changes', async () => {
    const { audio, sound, system, activate } = fixture();
    const voice = audio.play(sound);
    const send = voice.addSend(system.music, 0.4);
    await unlock();
    const first = effect();
    const second = effect();
    const destroyFirst = vi.spyOn(first, 'destroy');
    const destroySecond = vi.spyOn(second, 'destroy');
    voice.addEffect(first);
    voice.addEffect(second);
    activate();
    const wet = [...edges.get(voice.output)!].find(node => node !== first.inputNode)!;

    expect(wet).toBeDefined();
    expect(edges.get(first.outputNode)).toEqual(new Set([second.inputNode]));
    expect(edges.get(second.outputNode)).toEqual(new Set([system.sound.inputNode]));
    expect(edges.get(wet)).toEqual(new Set([system.music.inputNode]));
    voice.removeEffect(first);
    expect(edges.get(voice.output)).toEqual(new Set([second.inputNode, wet]));
    voice.removeEffect(second);
    voice.bus = system.master;
    expect(edges.get(voice.output)).toEqual(new Set([system.master.inputNode, wet]));
    voice.stop();
    expect(send.destroyed).toBe(true);
    expect(destroyFirst).not.toHaveBeenCalled();
    expect(destroySecond).not.toHaveBeenCalled();
  });

  test('a replay failure releases the started voice and all sends before propagating', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    const play = vi.spyOn(system, 'play');
    const voice = audio.play(sound);
    const send = voice.addSend(system.music);
    voice.addEffect(effect(false));
    const ended = vi.fn();
    voice.onEnd.add(ended);

    expect(activate).toThrow();
    const real = play.mock.results[0]!.value as Voice;
    expect(real.ended).toBe(true);
    expect(send.destroyed).toBe(true);
    expect(voice.ended).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
    audio._flushPending();
    expect(play).toHaveBeenCalledTimes(1);
  });

  test.each(['stop', 'destroy'] as const)('cancels a stream waiting for unlock through %s', async action => {
    const { audio, system, activate } = fixture();
    const { asset, element } = stream();
    const voice = audio.play(asset);
    const send = voice.addSend(system.sound);
    const ended = vi.fn();
    voice.onEnd.add(ended);
    const play = vi.spyOn(system, 'play');
    activate();

    if (action === 'stop') {
      voice.stop();
    } else {
      audio.destroy();
    }

    expect(created).toBe(0);
    expect(send.destroyed).toBe(true);
    await unlock();
    audio._flushPending();
    expect(play).not.toHaveBeenCalled();
    expect(element.play).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(() => voice.output).toThrow('output');
  });

  test('suspension before the unlock callback retains a stream until one restore', async () => {
    const { audio, system, activate, suspend } = fixture();
    const { asset, element } = stream();
    const voice = audio.play(asset);
    const send = voice.addSend(system.sound);
    const play = vi.spyOn(system, 'play');
    api.context.onAudioContextReady.add(suspend);
    activate();
    await unlock();

    expect(play).not.toHaveBeenCalled();
    expect(element.play).not.toHaveBeenCalled();
    expect(send.destroyed).toBe(false);
    expect(() => voice.output).toThrow('output');
    activate();
    expect(play).toHaveBeenCalledTimes(1);
    expect(element.play).toHaveBeenCalledTimes(1);
    const output = voice.output;

    for (let i = 0; i < 3; i++) {
      suspend();
      activate();
      audio._flushPending();
    }

    await api.context.getAudioContext().suspend();
    await unlock();
    expect(play).toHaveBeenCalledTimes(1);
    expect(voice.output).toBe(output);
    expect(voice.sends).toEqual([send]);
    audio.destroy();
    expect(voice.ended).toBe(true);
    expect(send.destroyed).toBe(true);
  });

  test.each(['suspend', 'destroy'] as const)('holds a new stream when the previous voice reenters scene %s', async action => {
    const { audio, system, activate, suspend } = fixture();
    const { asset, element } = stream();
    await unlock();
    const previous = system.play(asset);
    expect(element.play).toHaveBeenCalledTimes(1);
    previous.onEnd.add(() => {
      if (action === 'suspend') {
        suspend();
      } else {
        audio.destroy();
      }
    });
    const voice = audio.play(asset);
    const send = voice.addSend(system.sound);
    activate();

    expect(element.play).toHaveBeenCalledTimes(1);

    if (action === 'suspend') {
      expect(voice.ended).toBe(false);
      activate();
      expect(element.play).toHaveBeenCalledTimes(2);
    } else {
      expect(voice.ended).toBe(true);
      expect(send.destroyed).toBe(true);
    }
  });

  test('a throwing cancellation listener is released and cannot prevent another pending cleanup', () => {
    const { audio, sound, system } = fixture();
    const first = audio.play(sound);
    const second = audio.play(sound);
    const sends = [first.addSend(system.music), second.addSend(system.music)];
    const failure = new Error('onEnd failed');
    first.onEnd.add(() => {
      throw failure;
    });
    const ended = vi.fn();
    second.onEnd.add(ended);
    const report = vi.fn();
    audio._destroy(report);

    expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    expect(sends.every(send => send.destroyed)).toBe(true);
    expect(first.onEnd.count).toBe(0);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(created).toBe(0);
  });

  test('a failed creation preserves its error despite a throwing end listener and flushes the next voice', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    const failure = new Error('create failed');
    const first = audio.play({
      createVoice: () => {
        throw failure;
      },
    });
    const send = first.addSend(system.music);
    first.onEnd.add(() => {
      throw new Error('secondary listener failure');
    });
    const second = audio.play(sound);

    expect(activate).toThrow(failure);
    expect(first.ended).toBe(true);
    expect(send.destroyed).toBe(true);
    expect(first.onEnd.count).toBe(0);
    expect(second.ended).toBe(false);
    expect(gains).toContain(second.output);
  });

  test('reentrant effect changes keep the original insertion order', async () => {
    const { audio, sound, activate } = fixture();
    await unlock();
    const first = effect();
    const second = effect();
    const third = effect();
    const fourth = effect();
    const attached: AudioEffect[] = [];
    const source: Playable = {
      createVoice: (system, options) => {
        const real = sound.createVoice(system, options);
        const add = real.addEffect.bind(real);
        vi.spyOn(real, 'addEffect').mockImplementation(effectToAdd => {
          attached.push(effectToAdd);

          if (effectToAdd === first) {
            voice.removeEffect(third);
            voice.addEffect(fourth);
          }

          return add(effectToAdd);
        });

        return real;
      },
    };
    const voice = audio.play(source);
    voice.addEffect(first).addEffect(second).addEffect(third);
    activate();

    expect(attached).toEqual([first, second, fourth]);
  });

  test('reentrant sends stay visible and follow the handles opened before flush', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    const firstEffect = effect();
    let added: ReturnType<Voice['addSend']> | undefined;
    const source: Playable = {
      createVoice: (owner, options) => {
        const real = sound.createVoice(owner, options);
        const add = real.addEffect.bind(real);
        vi.spyOn(real, 'addEffect').mockImplementation(value => {
          added = voice.addSend(system.master, 0.6);
          expect([...view]).toEqual([first, added]);

          return add(value);
        });

        return real;
      },
    };
    const voice = audio.play(source);
    const view = voice.sends;
    const first = voice.addSend(system.music, 0.2);
    voice.addEffect(firstEffect);
    activate();

    expect([...view]).toEqual([first, added]);
    expect(Object.keys(view)).toEqual(['0', '1']);
    expect(0 in view).toBe(true);
    expect(view.map(send => send.level)).toEqual([0.2, 0.6]);
    voice.stop();
    expect(first.destroyed).toBe(true);
    expect(added?.destroyed).toBe(true);
  });

  test('a dry bus that sets up later in the unlock keeps the deferred send connected', async () => {
    const { audio, system, activate } = fixture();
    const { asset } = stream();
    const voice = audio.play(asset);
    activate();
    const { AudioBus } = await import('#audio/AudioBus');
    const lateBus = new AudioBus('late', { parent: system.master });
    dispose.push(() => lateBus.destroy());
    voice.bus = lateBus;
    const send = voice.addSend(system.sound, 0.3);
    await unlock();

    const sendGain = gains.find(node => node.gain.value === 0.3)!;
    expect(sendGain).toBeDefined();
    expect(edges.get(voice.output)).toEqual(new Set([lateBus.inputNode, sendGain]));
    expect(edges.get(sendGain)).toEqual(new Set([system.sound.inputNode]));
    voice.stop();
    expect(send.destroyed).toBe(true);
  });

  test('adopting a live send detaches its old source until the same handle is flushed', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    const context = api.context.getAudioContext();
    const source = context.createGain();
    const { AudioSend } = await import('#audio/AudioSend');
    const send = new AudioSend(context, source, system.music, 0.4);
    const oldGain = [...edges.get(source)!][0]!;
    const voice = audio.play(sound);
    voice._adoptSend(send);

    expect(edges.get(source)).toEqual(new Set());
    expect(edges.get(oldGain)).toEqual(new Set());
    expect(send.destroyed).toBe(false);
    const before = gains.length;
    send.level = 0.8;
    voice._adoptSend(send);
    expect(gains).toHaveLength(before);
    expect(voice.sends).toEqual([send]);
    activate();
    expect(voice.sends).toEqual([send]);
    expect(send.level).toBe(0.8);
    const sendGain = gains.find(node => node.gain.value === 0.8)!;
    expect(edges.get(voice.output)).toContain(sendGain);
    expect(edges.get(sendGain)).toEqual(new Set([system.music.inputNode]));
    voice.stop();
    expect(send.destroyed).toBe(true);
  });

  test('the retained sends view supports a custom voice exposing a frozen readonly array', async () => {
    const { audio, sound, system, activate } = fixture();
    await unlock();
    let real: Voice | undefined;
    const source: Playable = {
      createVoice: (owner, options) => {
        real = sound.createVoice(owner, options);
        const sends = real.sends;
        Object.defineProperty(real, 'sends', { get: () => Object.freeze([...sends]) });

        return real;
      },
    };
    const voice = audio.play(source);
    const view = voice.sends;
    const first = voice.addSend(system.music);
    activate();
    const second = real!.addSend(system.sound);

    expect(voice.sends).toBe(view);
    expect(Object.keys(view)).toEqual(['0', '1']);
    expect([...view]).toEqual([first, second]);
    real!.removeSend(second);
    expect([...view]).toEqual([first]);
    voice.stop();
    expect(Object.keys(view)).toEqual([]);
  });

  test.each(['creation', 'replay'] as const)(
    'cancellation during %s stops an enveloped generator without leaving a release tail',
    async phase => {
      const { audio, system, activate } = fixture();
      await unlock();
      const { AudioGenerator } = await import('#audio/AudioGenerator');
      const { Envelope } = await import('#audio/Envelope');
      const generator = new AudioGenerator({ envelope: new Envelope({ release: Time.seconds(5) }) });
      dispose.push(() => generator.destroy());
      let real: Voice | undefined;
      const source: Playable = {
        createVoice: (owner, options) => {
          if (phase === 'creation') {
            voice.stop();
          }

          real = generator.createVoice(owner, options);

          if (phase === 'replay') {
            const add = real.addEffect.bind(real);
            vi.spyOn(real, 'addEffect').mockImplementation(value => {
              voice.stop(Time.seconds(2));

              return add(value);
            });
          }

          return real;
        },
      };
      const voice = audio.play(source);
      const send = voice.addSend(system.music);
      voice.addEffect(effect());
      const ended = vi.fn();
      voice.onEnd.add(ended);
      activate();

      expect(real?.ended).toBe(true);
      expect(voice.ended).toBe(true);
      expect(send.destroyed).toBe(true);
      expect(ended).toHaveBeenCalledTimes(1);
    },
  );
});
