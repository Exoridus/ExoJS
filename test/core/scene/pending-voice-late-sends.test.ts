import { getAudioContext } from '#audio/audioContext';
import { AudioSend } from '#audio/AudioSend';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { SceneAudio } from '#core/scene/SceneAudio';
import { SceneState } from '#core/scene/SceneState';

describe('Cancelled pending voice sends', () => {
  test.each(['add', 'adopt'] as const)('destroys a send requested after cancellation: %s', method => {
    const system = new AudioSystem();
    const sound = new Sound({ duration: 10 } as AudioBuffer);
    const audio = new SceneAudio({ audio: system } as unknown as Application, () => SceneState.Preparing);
    const voice = audio.play(sound);
    const context = getAudioContext();
    const bus = system.music;
    const source = context.createGain();
    const gain = context.createGain();
    const disconnect = vi.spyOn(gain, 'disconnect');
    const outputDisconnect = vi.spyOn(voice.output, 'disconnect');
    const outputConnect = vi.spyOn(voice.output, 'connect');
    const play = vi.spyOn(system, 'play');
    voice.stop();
    const createGain = vi.spyOn(context, 'createGain').mockReturnValueOnce(gain);
    let send: AudioSend;

    try {
      if (method === 'add') {
        send = voice.addSend(bus);
        expect(outputConnect).toHaveBeenCalledTimes(1);
        expect(outputDisconnect).toHaveBeenCalledTimes(3);
      } else {
        send = new AudioSend(context, source, bus, 1);
        const retarget = vi.spyOn(send, '_retarget');
        voice._adoptSend(send);
        expect(retarget).not.toHaveBeenCalled();
        expect(outputConnect).not.toHaveBeenCalled();
      }

      expect(send.destroyed).toBe(true);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(voice.sends).toHaveLength(0);
      voice.stop();
      audio._flushPending();
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(play).not.toHaveBeenCalled();
    } finally {
      createGain.mockRestore();
      source.disconnect();
      audio.destroy();
      sound.destroy();
      system.destroy();
    }
  });
});
