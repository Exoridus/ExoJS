import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { getAudioContext, isAudioContextReady } from '#audio/audioContext';
import { AudioGenerator } from '#audio/AudioGenerator';
import { AudioSend } from '#audio/AudioSend';
import { AudioStream } from '#audio/AudioStream';
import { AudioSystem } from '#audio/AudioSystem';
import type { Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { SceneAudio } from '#core/scene/SceneAudio';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import { Time } from '#core/units';

const NativeAudioContext = globalThis.AudioContext;
const constructedContexts: AudioContext[] = [];

beforeAll(() => {
  vi.stubGlobal(
    'AudioContext',
    class extends NativeAudioContext {
      public constructor(options?: AudioContextOptions) {
        super(options);
        constructedContexts.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all(constructedContexts.map(context => context.close()));
  vi.unstubAllGlobals();
});

const unlockAudio = async (firstUnlock = false): Promise<AudioContext> => {
  const button = document.createElement('button');
  button.textContent = 'Enable audio';
  document.body.append(button);

  try {
    await userEvent.click(button);

    if (firstUnlock) {
      expect(constructedContexts).toHaveLength(1);
      const context = constructedContexts[0]!;
      await expect.poll(() => context.state).toBe('running');

      return context;
    }

    const context = getAudioContext();
    expect(context).toBeInstanceOf(NativeAudioContext);
    await context.resume();
    expect(context.state).toBe('running');

    return context;
  } finally {
    button.remove();
  }
};

/** Native media needs decodable data, but constructing it must not open a live context. */
const silentWav = (): ArrayBuffer => {
  const samples = 8_000;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);

  const ascii = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, samples, true);
  view.setUint32(28, samples, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);

  return buffer;
};

// The first case owns the singleton's first gesture. Later cases exercise its running graph.
describe('SceneAudio native graph ownership', { concurrent: false }, () => {
  test('defers every pending graph until activation and keeps a locked stream waiting for the first gesture', async () => {
    expect(constructedContexts).toHaveLength(0);
    expect(isAudioContextReady()).toBe(false);
    const system = new AudioSystem();
    const sound = new Sound(new AudioBuffer({ numberOfChannels: 1, length: 44_100, sampleRate: 44_100 }));
    const generator = new AudioGenerator();
    const url = URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));
    const element = document.createElement('audio');
    const mediaPlay = vi.spyOn(element, 'play');
    const stream = new AudioStream(element);
    let state: SceneState = SceneState.Preparing;
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => state);
    const play = vi.spyOn(system, 'play');

    try {
      const metadata = new Promise<void>((resolve, reject) => {
        element.addEventListener('loadedmetadata', () => resolve(), { once: true });
        element.addEventListener('error', () => reject(new Error('The native audio fixture could not load.')), { once: true });
      });
      element.src = url;
      await metadata;
      expect(element.duration).toBe(1);

      const cancelled = audio.play(sound);
      const cancelledSends = cancelled.sends;
      const cancelledSend = cancelled.addSend(system.music, 0.3);
      const cancelledEnd = vi.fn(() => {
        expect(cancelledSend.destroyed).toBe(true);
        expect(cancelledSends).toHaveLength(0);
      });
      cancelled.onEnd.add(cancelledEnd);

      const soundVoice = audio.play(sound);
      const generatorVoice = audio.play(generator);
      const streamVoice = audio.play(stream, { loop: true });
      const soundSend = soundVoice.addSend(system.music);
      const generatorSend = generatorVoice.addSend(system.music);
      const soundEnd = vi.fn(() => {
        expect(soundSend.destroyed).toBe(true);
      });
      const generatorEnd = vi.fn(() => {
        expect(generatorSend.destroyed).toBe(true);
      });
      const streamEnd = vi.fn();
      soundVoice.onEnd.add(soundEnd);
      generatorVoice.onEnd.add(generatorEnd);
      streamVoice.onEnd.add(streamEnd);
      streamVoice.pause();
      streamVoice.seek(0.25);
      streamVoice.playbackRate = 1.25;
      streamVoice.volume = 0.5;
      streamVoice.fade(0.2, Time.seconds(0.1));
      const streamSends = streamVoice.sends;
      const streamSend = streamVoice.addSend(system.sound, 0.4);
      streamSend.level = 0.7;

      expect(constructedContexts).toHaveLength(0);

      for (const voice of [cancelled, soundVoice, generatorVoice, streamVoice]) {
        expect(() => voice.output).toThrow();
      }

      expect(constructedContexts).toHaveLength(0);

      cancelled.stop();
      cancelled.stop();
      expect(cancelledEnd).toHaveBeenCalledTimes(1);
      state = SceneState.Active;
      audio._flushPending();
      expect(soundVoice.ended).toBe(true);
      expect(generatorVoice.ended).toBe(true);
      expect(soundEnd).toHaveBeenCalledTimes(1);
      expect(generatorEnd).toHaveBeenCalledTimes(1);
      expect(streamVoice.ended).toBe(false);
      expect(streamVoice.paused).toBe(true);
      expect(() => streamVoice.output).toThrow();
      expect(constructedContexts).toHaveLength(0);

      await unlockAudio(true);
      await expect.poll(() => streamVoice.output).toBeInstanceOf(GainNode);
      expect(constructedContexts).toHaveLength(1);
      expect(play.mock.calls.filter(([source]) => source === sound)).toHaveLength(1);
      expect(play.mock.calls.filter(([source]) => source === generator)).toHaveLength(1);
      expect(play.mock.calls.filter(([source]) => source === stream)).toHaveLength(1);
      expect(soundEnd).toHaveBeenCalledTimes(1);
      expect(generatorEnd).toHaveBeenCalledTimes(1);
      expect(streamVoice.sends).toBe(streamSends);
      expect(streamSends).toEqual([streamSend]);
      expect(streamSend.destroyed).toBe(false);
      expect(streamSend.level).toBe(0.7);
      expect(streamVoice.paused).toBe(true);
      expect(element.paused).toBe(true);
      expect(element.currentTime).toBeCloseTo(0.25, 2);
      expect(streamVoice.playbackRate).toBe(1.25);
      expect(streamVoice.volume).toBe(0.2);
      expect(mediaPlay).not.toHaveBeenCalled();

      streamVoice.resume();
      expect(mediaPlay).toHaveBeenCalledTimes(1);
      await expect(mediaPlay.mock.results[0]?.value).resolves.toBeUndefined();
      await expect.poll(() => element.paused).toBe(false);

      streamVoice.stop();
      streamVoice.stop();
      expect(streamEnd).toHaveBeenCalledTimes(1);
      expect(streamSend.destroyed).toBe(true);
      expect(streamSends).toHaveLength(0);
    } finally {
      audio.destroy();
      stream.destroy();
      generator.destroy();
      sound.destroy();
      system.destroy();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    }
  });

  test.each(['add', 'adopt'] as const)('releases a native send requested after pending cancellation: %s', async method => {
    const audioContext = await unlockAudio();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);
    const source = audioContext.createGain();

    try {
      const voice = audio.play(sound);
      const bus = system.music;
      expect(bus.getInputNode()).toBeInstanceOf(GainNode);
      expect(() => voice.output).toThrow();
      voice.stop();
      const createGain = vi.spyOn(audioContext, 'createGain');

      if (method === 'add') {
        expect(() => voice.addSend(bus)).toThrow('already ended');
        expect(voice.sends).toHaveLength(0);
        audio._flushPending();
        expect(createGain).not.toHaveBeenCalled();

        return;
      }

      const send = new AudioSend(audioContext, source, bus, 1);
      const gain = createGain.mock.results[0]?.value as GainNode;
      expect(gain).toBeInstanceOf(GainNode);
      const disconnect = vi.spyOn(gain, 'disconnect');
      const disconnectSource = vi.spyOn(source, 'disconnect');
      const retarget = vi.spyOn(send, '_retarget');

      voice._adoptSend(send);

      expect(retarget).not.toHaveBeenCalled();
      expect(send.destroyed).toBe(true);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(disconnectSource).toHaveBeenCalledWith(gain);
      expect(voice.sends).toHaveLength(0);
      voice.stop();
      audio._flushPending();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      source.disconnect();
      audio.destroy();
      sound.destroy();
      system.destroy();
    }
  });

  test('pending cancellation destroys its deferred send before ending without allocating a native node', async () => {
    const audioContext = await unlockAudio();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);
    const play = vi.spyOn(system, 'play');
    const createGain = vi.spyOn(audioContext, 'createGain');

    try {
      const voice = audio.play(sound);
      const sends = voice.sends;
      const send = voice.addSend(system.music);
      const ended = vi.fn(() => {
        expect(send.destroyed).toBe(true);
        expect(voice.sends).toBe(sends);
        expect(sends).toHaveLength(0);
        expect(createGain).not.toHaveBeenCalled();
      });
      voice.onEnd.add(ended);
      expect(() => voice.output).toThrow();
      voice.stop();
      voice.stop();
      audio._flushPending();
      expect(ended).toHaveBeenCalledTimes(1);
      expect(play).not.toHaveBeenCalled();
      expect(createGain).not.toHaveBeenCalled();
      expect(system.music.getInputNode()).toBeInstanceOf(GainNode);
    } finally {
      audio.destroy();
      sound.destroy();
      system.destroy();
    }
  });

  test('flush materializes native routing with the same send and live sends view', async () => {
    const audioContext = await unlockAudio();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);
    const createGain = vi.spyOn(audioContext, 'createGain');
    const connect = vi.spyOn(AudioNode.prototype, 'connect');
    const play = vi.spyOn(system, 'play');

    try {
      const voice = audio.play(sound, { loop: true });
      const sends = voice.sends;
      const send = voice.addSend(system.music, 0.4);
      const removed = voice.addSend(system.sound);
      send.level = 0.7;
      voice.removeSend(removed);
      expect(removed.destroyed).toBe(true);
      expect(sends).toEqual([send]);
      expect(() => voice.output).toThrow();
      expect(createGain).not.toHaveBeenCalled();

      audio._flushPending();

      const output = voice.output;
      expect(output).toBeInstanceOf(GainNode);
      expect(voice.sends).toBe(sends);
      expect(sends).toEqual([send]);
      expect(send.destroyed).toBe(false);
      const sendGain = createGain.mock.results.map(result => result.value as GainNode).find(node => node !== output);
      expect(sendGain).toBeInstanceOf(GainNode);
      const edges = connect.mock.calls.map((args, index) => ({ source: connect.mock.contexts[index], target: args[0] }));
      expect(edges).toEqual(
        expect.arrayContaining([
          { source: output, target: sendGain },
          { source: sendGain, target: system.music.getInputNode() },
        ]),
      );
      expect(sendGain!.gain.value).toBeCloseTo(0.7);
      const disconnectSend = vi.spyOn(sendGain!, 'disconnect');
      const disconnectOutput = vi.spyOn(output, 'disconnect');
      const later = voice.addSend(system.sound);
      expect(sends).toEqual([send, later]);
      voice.removeSend(later);
      expect(later.destroyed).toBe(true);
      expect(sends).toEqual([send]);

      voice.stop();
      voice.stop();
      audio._flushPending();
      expect(play).toHaveBeenCalledTimes(1);
      expect(send.destroyed).toBe(true);
      expect(sends).toHaveLength(0);
      expect(disconnectSend).toHaveBeenCalledTimes(1);
      expect(disconnectOutput).toHaveBeenCalledWith(sendGain);
      expect(system.music.getInputNode()).toBeInstanceOf(GainNode);
    } finally {
      audio.destroy();
      sound.destroy();
      system.destroy();
    }
  });

  test('repeated suspend and restore preserves each pending handle until destruction', async () => {
    const audioContext = await unlockAudio();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    let state: SceneState = SceneState.Preparing;
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => state);
    const play = vi.spyOn(system, 'play');
    const voices: Voice[] = [];
    const sends: AudioSend[] = [];
    const ended = vi.fn();

    try {
      const first = audio.play(sound, { loop: true, when: SceneAvailability.Active });
      expect('pause' in first).toBe(true);

      if (!('pause' in first)) {
        throw new Error('A pending Sound must carry its pause capability.');
      }

      first.pause();
      first.onEnd.add(ended);
      voices.push(first);
      sends.push(first.addSend(system.music));
      state = SceneState.Active;
      audio._flushPending();
      audio._sync();
      const firstOutput = first.output;
      expect(firstOutput).toBeInstanceOf(GainNode);

      for (let i = 0; i < 3; i++) {
        state = SceneState.Suspended;
        audio._sync();
        const pending = audio.play(sound, { loop: true });
        pending.onEnd.add(ended);
        voices.push(pending);
        sends.push(pending.addSend(system.music));
        expect(() => pending.output).toThrow();
        state = SceneState.Active;
        audio._flushPending();
        audio._sync();
        expect(pending.output).toBeInstanceOf(GainNode);
        expect(first.output).toBe(firstOutput);
        expect(first.paused).toBe(true);
        expect(voices.every(voice => !voice.ended)).toBe(true);
        expect(sends.every(send => !send.destroyed)).toBe(true);
      }

      expect(play).toHaveBeenCalledTimes(voices.length);
      first.resume();
      expect(first.paused).toBe(false);
      audio.destroy();
      audio.destroy();
      audio._flushPending();
      audio._sync();
      expect(voices.every(voice => voice.ended)).toBe(true);
      expect(sends.every(send => send.destroyed)).toBe(true);
      expect(ended).toHaveBeenCalledTimes(voices.length);
      expect(play).toHaveBeenCalledTimes(voices.length);
    } finally {
      audio.destroy();
      sound.destroy();
      system.destroy();
    }
  });
});
