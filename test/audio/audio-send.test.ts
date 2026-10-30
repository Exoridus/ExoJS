import type { AudioBus } from '#audio/AudioBus';
import { AudioSend } from '#audio/AudioSend';

const createNode = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } });

describe('AudioSend', () => {
  test('destroy() cuts the source feed into the send, not only the send output', () => {
    const gain = createNode();
    const context = { currentTime: 0, createGain: () => gain } as unknown as AudioContext;
    const source = createNode();
    const bus = { getInputNode: () => null, onceSetup: () => () => undefined } as unknown as AudioBus;

    const send = new AudioSend(context, source as unknown as AudioNode, bus, 1);

    send.destroy();
    send.destroy();

    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledWith(gain);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });
});
