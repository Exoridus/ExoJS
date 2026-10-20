import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { runDetector } from '../harness/beat-sandbox';

interface ProcessorPort {
  onmessage: (event: { data: Record<string, unknown> }) => void;
}

describe('beat processor history lifetime', () => {
  it('resets complete analysis history but preserves the lifetime bar count', () => {
    let processor: Record<string, unknown>;
    const { messages } = runDetector(clicktrack(120, 6).samples, {
      prepare: value => {
        processor = value;
      },
    });
    const value = processor!;
    expect(value['_bestBpm']).toBeGreaterThan(0);
    const bars = value['_barNumber'];
    const revision = value['_lookaheadRevision'];
    (value['port'] as ProcessorPort).onmessage({ data: { type: 'reset', epoch: 1 } });

    expect(value['_bestBpm']).toBe(0);
    expect(value['_locked']).toBe(false);
    expect(value['_sampleCount']).toBe(0);
    expect((value['_onsets'] as { count: number }).count).toBe(0);
    expect(value['_fluxCount']).toBe(0);
    expect(value['_fullWindowAttempted']).toBe(false);
    expect(value['_lookahead']).toEqual([]);
    expect(value['_barNumber']).toBe(bars);
    expect(value['_lookaheadRevision']).toBe(revision);
    expect(messages.at(-1)).toMatchObject({ type: 'reset', epoch: 1 });
    (value['port'] as ProcessorPort).onmessage({ data: { type: 'destroy' } });
    expect(value['_destroyed']).toBe(true);
  });

  it('invalidates on disconnected input and reacquires on the context clock', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        const process = value['process'] as (
          inputs: Float32Array[][],
          outputs: Float32Array[][],
          params: Record<string, Float32Array>,
        ) => boolean;
        const samples = clicktrack(120, 4).samples;
        const globals = globalThis as Record<string, unknown>;

        for (let offset = 0; offset < samples.length; offset += 128) {
          globals['currentFrame'] = offset;
          process.call(value, [[samples.subarray(offset, offset + 128)]], [], {});
        }

        expect(value['_bestBpm']).toBeGreaterThan(0);
        process.call(value, [], [], {});
        expect(value['_bestBpm']).toBe(0);
        expect(value['_lookahead']).toEqual([]);

        globals['currentFrame'] = 20 * SAMPLE_RATE;
        process.call(value, [[new Float32Array(512)]], [], {});
        const at = value['_contextTimeAt'] as (sample: number) => number;
        expect(at.call(value, 0)).toBe(20);
      },
    });
  });
});
