import { getAudioContext } from '@codexo/exojs';

import { AudioTap } from '../src/AudioTap';

const makeNode = (): AudioNode => ({ connect: vi.fn(), disconnect: vi.fn() }) as unknown as AudioNode;

/** A bus that has not built its nodes yet: `getOutputNode()` is null until `finishSetup()`. */
const makePendingBus = (): { bus: object; output: AudioNode; finishSetup: () => void } => {
  const output = makeNode();
  let ready = false;
  let pending: (() => void) | null = null;
  const bus = {
    getOutputNode: (): AudioNode | null => (ready ? output : null),
    onceSetup: (callback: () => void): void => {
      pending = callback;
    },
  };

  return {
    bus,
    output,
    finishSetup: (): void => {
      ready = true;
      pending?.();
    },
  };
};

describe('AudioTap', () => {
  let context: AudioContext;

  beforeEach(() => {
    context = getAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('feeds a raw node into the attached target', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const source = makeNode();

    tap.attach(target, context);
    tap.source = source;

    expect(source.connect).toHaveBeenCalledWith(target, 0, 0);
    tap.destroy();
  });

  test('connects a source assigned before the target existed once it is attached', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const source = makeNode();

    tap.source = source;
    expect(source.connect).not.toHaveBeenCalled();

    tap.attach(target, context);

    expect(source.connect).toHaveBeenCalledWith(target, 0, 0);
    tap.destroy();
  });

  test('replacing the source cuts only the previous tap edge', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const first = makeNode();
    const second = makeNode();

    tap.attach(target, context);
    tap.source = first;
    tap.source = second;

    expect(first.disconnect).toHaveBeenCalledWith(target);
    expect(second.connect).toHaveBeenCalledWith(target, 0, 0);
    tap.destroy();
  });

  test('taps a voice through its output node', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const output = makeNode();

    tap.attach(target, context);
    tap.source = { output } as never;

    expect(output.connect).toHaveBeenCalledWith(target, 0, 0);
    tap.destroy();
  });

  test('waits for a bus that has not built its nodes yet', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const { bus, output, finishSetup } = makePendingBus();

    tap.attach(target, context);
    tap.source = bus as never;
    expect(output.connect).not.toHaveBeenCalled();

    finishSetup();

    expect(output.connect).toHaveBeenCalledWith(target, 0, 0);
    tap.destroy();
  });

  test('a bus finishing setup after the source changed is not connected', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const { bus, output, finishSetup } = makePendingBus();

    tap.attach(target, context);
    tap.source = bus as never;
    tap.source = null;
    finishSetup();

    expect(output.connect).not.toHaveBeenCalled();
    tap.destroy();
  });

  test('wraps a MediaStream in a stream source and releases it when replaced', () => {
    const tap = new AudioTap();
    const target = makeNode();
    const streamSource = makeNode();
    vi.spyOn(context, 'createMediaStreamSource').mockReturnValue(streamSource as MediaStreamAudioSourceNode);

    tap.attach(target, context);
    tap.source = { getTracks: (): [] => [] } as unknown as MediaStream;

    expect(streamSource.connect).toHaveBeenCalledWith(target, 0, 0);

    tap.source = null;

    expect(streamSource.disconnect).toHaveBeenCalled();
    tap.destroy();
  });

  test('an unrecognised source connects nothing and does not throw', () => {
    const tap = new AudioTap();
    const target = makeNode();

    tap.attach(target, context);

    expect(() => {
      tap.source = {} as never;
    }).not.toThrow();
    expect(target.connect).not.toHaveBeenCalled();
    tap.destroy();
  });

  test('a destroyed tap forgets its source and no longer connects', () => {
    const tap = new AudioTap();
    const source = makeNode();

    tap.source = source;
    tap.destroy();
    tap.attach(makeNode(), context);

    expect(tap.source).toBeNull();
    expect(source.connect).not.toHaveBeenCalled();
  });
});
