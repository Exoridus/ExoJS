import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { getAudioContext } from '#audio/audioContext';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { SceneAudio } from '#core/scene/SceneAudio';
import { SceneState } from '#core/scene/SceneState';

let context: AudioContext | undefined;

beforeAll(async () => {
  context = getAudioContext();
  expect(context).toBeInstanceOf(AudioContext);
  const button = document.createElement('button');
  button.textContent = 'Enable audio';
  document.body.append(button);

  try {
    await userEvent.click(button);
    await context.resume();
    expect(context.state).toBe('running');
  } finally {
    button.remove();
  }
});

afterAll(async () => {
  await context?.close();
});

describe('SceneAudio native graph ownership', () => {
  test('pending cancellation disconnects its native placeholder and send before ending', () => {
    const audioContext = getAudioContext();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);
    const play = vi.spyOn(system, 'play');

    try {
      const voice = audio.play(sound);
      expect(voice.output).toBeInstanceOf(GainNode);
      expect(system.music.getInputNode()).toBeInstanceOf(GainNode);
      const disconnect = vi.spyOn(voice.output, 'disconnect');
      const createGain = vi.spyOn(audioContext, 'createGain');
      const send = voice.addSend(system.music);
      const sendGain = createGain.mock.results[0]?.value as GainNode;
      createGain.mockRestore();
      expect(sendGain).toBeInstanceOf(GainNode);
      const disconnectSend = vi.spyOn(sendGain, 'disconnect');
      const ended = vi.fn(() => {
        expect(send.destroyed).toBe(true);
        expect(voice.sends).toHaveLength(0);
        expect(disconnect).toHaveBeenCalledTimes(1);
        expect(disconnectSend).toHaveBeenCalledTimes(1);
      });
      voice.onEnd.add(ended);
      voice.stop();
      voice.stop();
      audio._flushPending();
      expect(ended).toHaveBeenCalledTimes(1);
      expect(play).not.toHaveBeenCalled();
      expect(system.music.getInputNode()).toBeInstanceOf(GainNode);
    } finally {
      audio.destroy();
      sound.destroy();
      system.destroy();
      vi.restoreAllMocks();
    }
  });

  test('flush keeps the native send on the real voice and releases the placeholder', () => {
    const audioContext = getAudioContext();
    const system = new AudioSystem();
    const sound = new Sound(audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate));
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);

    try {
      const voice = audio.play(sound, { loop: true });
      const placeholder = voice.output;
      expect(placeholder).toBeInstanceOf(GainNode);
      const disconnect = vi.spyOn(placeholder, 'disconnect');
      const send = voice.addSend(system.music);
      audio._flushPending();
      expect(voice.ended).toBe(false);
      expect(voice.output).toBeInstanceOf(GainNode);
      expect(voice.output).not.toBe(placeholder);
      expect(voice.sends).toEqual([send]);
      expect(send.destroyed).toBe(false);
      expect(disconnect).toHaveBeenCalledTimes(2);
      expect(disconnect).toHaveBeenCalledWith();
      voice.stop();
      expect(send.destroyed).toBe(true);
      expect(system.music.getInputNode()).toBeInstanceOf(GainNode);
    } finally {
      audio.destroy();
      sound.destroy();
      system.destroy();
      vi.restoreAllMocks();
    }
  });
});
