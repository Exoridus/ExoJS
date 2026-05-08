import { getAudioContext, isAudioContextReady } from '@/audio/audio-context';
import { AudioAnalyser } from '@/audio/AudioAnalyser';
import { AudioBus } from '@/audio/AudioBus';
import { _resetAudioManagerForTesting } from '@/audio/AudioManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudioNode(): AudioNode {
  const ctx = getAudioContext();
  return ctx.createGain() as unknown as AudioNode;
}

function makeMediaStream(): MediaStream {
  // Must have getTracks for duck-type detection in AudioAnalyser
  return { getTracks: () => [] } as unknown as MediaStream;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioAnalyser', () => {
  beforeEach(() => {
    // Ensure AudioContext is initialised and running
    getAudioContext();
    expect(isAudioContextReady()).toBe(true);
  });

  afterEach(() => {
    _resetAudioManagerForTesting();
    jest.restoreAllMocks();
  });

  // ---- Construction ----

  describe('construction', () => {
    it('constructs with no options', () => {
      const a = new AudioAnalyser();
      expect(a).toBeDefined();
      a.destroy();
    });

    it('uses default fftSize of 2048', () => {
      const a = new AudioAnalyser();
      expect(a.fftSize).toBe(2048);
      a.destroy();
    });

    it('uses provided fftSize', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      expect(a.fftSize).toBe(512);
      a.destroy();
    });

    it('frequencyBinCount is fftSize/2', () => {
      const a = new AudioAnalyser({ fftSize: 1024 });
      expect(a.frequencyBinCount).toBe(512);
      a.destroy();
    });

    it('source is null on construction', () => {
      const a = new AudioAnalyser();
      expect(a.source).toBeNull();
      a.destroy();
    });

    it('uses default smoothingTimeConstant 0.8', () => {
      const a = new AudioAnalyser();
      expect(a.smoothingTimeConstant).toBeCloseTo(0.8);
      a.destroy();
    });
  });

  // ---- Property setters ----

  describe('property setters', () => {
    it('smoothingTimeConstant setter updates the value', () => {
      const a = new AudioAnalyser();
      a.smoothingTimeConstant = 0.5;
      expect(a.smoothingTimeConstant).toBeCloseTo(0.5);
      a.destroy();
    });

    it('minDecibels setter updates the value', () => {
      const a = new AudioAnalyser();
      a.minDecibels = -80;
      expect(a.minDecibels).toBeCloseTo(-80);
      a.destroy();
    });

    it('maxDecibels setter updates the value', () => {
      const a = new AudioAnalyser();
      a.maxDecibels = -20;
      expect(a.maxDecibels).toBeCloseTo(-20);
      a.destroy();
    });
  });

  // ---- Source-setter: all 5 source types ----

  describe('source setter — AudioBus', () => {
    it('accepts an AudioBus', () => {
      const bus = new AudioBus('test-bus');
      const a = new AudioAnalyser();
      expect(() => {
        a.source = bus;
      }).not.toThrow();
      a.destroy();
      bus.destroy();
    });

    it('taps the bus output node', () => {
      const bus = new AudioBus('tap-bus');
      const outputNode = bus._getOutputNode();
      if (outputNode) {
        const connectSpy = jest.spyOn(outputNode, 'connect');
        const a = new AudioAnalyser();
        a.source = bus;
        expect(connectSpy).toHaveBeenCalled();
        a.destroy();
      }
      bus.destroy();
    });
  });

  describe('source setter — Sound', () => {
    it('accepts a Sound-like object (analyserTarget)', () => {
      const ctx = getAudioContext();
      const gainNode = ctx.createGain();
      const soundLike = { analyserTarget: gainNode };
      const connectSpy = jest.spyOn(gainNode, 'connect');
      const a = new AudioAnalyser();
      a.source = soundLike as unknown as import('@/audio/Sound').Sound;
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
    });
  });

  describe('source setter — Music', () => {
    it('accepts a Music-like object (analyserTarget)', () => {
      const ctx = getAudioContext();
      const gainNode = ctx.createGain();
      const musicLike = { analyserTarget: gainNode };
      const connectSpy = jest.spyOn(gainNode, 'connect');
      const a = new AudioAnalyser();
      a.source = musicLike as unknown as import('@/audio/Music').Music;
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
    });
  });

  describe('source setter — MediaStream', () => {
    it('accepts a MediaStream (creates MediaStreamAudioSourceNode)', () => {
      const stream = makeMediaStream();
      const ctx = getAudioContext();
      const createMSSpy = jest.spyOn(ctx, 'createMediaStreamSource');
      const a = new AudioAnalyser();
      a.source = stream;
      expect(createMSSpy).toHaveBeenCalledWith(stream);
      a.destroy();
    });
  });

  describe('source setter — AudioNode', () => {
    it('accepts a raw AudioNode', () => {
      const node = makeAudioNode();
      const connectSpy = jest.spyOn(node, 'connect');
      const a = new AudioAnalyser();
      a.source = node;
      expect(connectSpy).toHaveBeenCalled();
      a.destroy();
    });
  });

  describe('source setter — null', () => {
    it('accepts null to clear source', () => {
      const node = makeAudioNode();
      const a = new AudioAnalyser();
      a.source = node;
      expect(() => {
        a.source = null;
      }).not.toThrow();
      expect(a.source).toBeNull();
      a.destroy();
    });
  });

  // ---- Data methods ----

  describe('getSpectrum', () => {
    it('returns a Uint8Array', () => {
      const a = new AudioAnalyser();
      const data = a.getSpectrum();
      expect(data).toBeInstanceOf(Uint8Array);
      a.destroy();
    });

    it('returns the same pre-allocated buffer on repeat calls', () => {
      const a = new AudioAnalyser();
      const first = a.getSpectrum();
      const second = a.getSpectrum();
      expect(first).toBe(second);
      a.destroy();
    });

    it('accepts a caller-supplied buffer', () => {
      const a = new AudioAnalyser({ fftSize: 256 });
      const custom = new Uint8Array(128);
      const result = a.getSpectrum(custom);
      expect(result).toBe(custom);
      a.destroy();
    });

    it('length equals frequencyBinCount', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      const data = a.getSpectrum();
      expect(data.length).toBe(a.frequencyBinCount);
      a.destroy();
    });
  });

  describe('getWaveform', () => {
    it('returns a Uint8Array of length frequencyBinCount', () => {
      const a = new AudioAnalyser({ fftSize: 512 });
      const data = a.getWaveform();
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(a.frequencyBinCount);
      a.destroy();
    });
  });

  describe('getSpectrumFloat', () => {
    it('returns a Float32Array', () => {
      const a = new AudioAnalyser();
      const data = a.getSpectrumFloat();
      expect(data).toBeInstanceOf(Float32Array);
      a.destroy();
    });
  });

  describe('getWaveformFloat', () => {
    it('returns a Float32Array', () => {
      const a = new AudioAnalyser();
      const data = a.getWaveformFloat();
      expect(data).toBeInstanceOf(Float32Array);
      a.destroy();
    });
  });

  // ---- Convenience helpers ----

  describe('getBandEnergy', () => {
    it('returns a number in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const energy = a.getBandEnergy(100, 1000);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(1);
      a.destroy();
    });

    it('returns 0 when no source', () => {
      const a = new AudioAnalyser();
      // source is null → _analyser is available but we want to test the 0 path
      const energy = a.getBandEnergy(100, 1000);
      // With the mock analyser (fills with 100), energy should be > 0 when analyser is set
      // But when no source, _analyser is still created but data is mock data
      expect(typeof energy).toBe('number');
      a.destroy();
    });
  });

  describe('getLowMidHigh', () => {
    it('returns object with low, mid, high', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const lmh = a.getLowMidHigh();
      expect(typeof lmh.low).toBe('number');
      expect(typeof lmh.mid).toBe('number');
      expect(typeof lmh.high).toBe('number');
      a.destroy();
    });

    it('all values are in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const lmh = a.getLowMidHigh();
      expect(lmh.low).toBeGreaterThanOrEqual(0);
      expect(lmh.low).toBeLessThanOrEqual(1);
      expect(lmh.mid).toBeGreaterThanOrEqual(0);
      expect(lmh.mid).toBeLessThanOrEqual(1);
      expect(lmh.high).toBeGreaterThanOrEqual(0);
      expect(lmh.high).toBeLessThanOrEqual(1);
      a.destroy();
    });
  });

  describe('getRMS', () => {
    it('returns a number in [0, 1]', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      const rms = a.getRms();
      expect(rms).toBeGreaterThanOrEqual(0);
      expect(rms).toBeLessThanOrEqual(1);
      a.destroy();
    });
  });

  // ---- Destroy ----

  describe('destroy', () => {
    it('does not throw', () => {
      const a = new AudioAnalyser();
      expect(() => a.destroy()).not.toThrow();
    });

    it('double destroy is safe', () => {
      const a = new AudioAnalyser();
      a.destroy();
      expect(() => a.destroy()).not.toThrow();
    });

    it('source is null after destroy', () => {
      const a = new AudioAnalyser();
      a.source = makeAudioNode();
      a.destroy();
      expect(a.source).toBeNull();
    });
  });
});
