import { SubtitleFactory } from '#resources/factories/SubtitleFactory';

// ---------------------------------------------------------------------------
// VTTCue polyfill — jsdom does not implement the TextTrack cue API, so the
// global constructor is undefined. SubtitleFactory only calls `new VTTCue(...)`
// and assigns a handful of properties inside its function bodies, so a plain
// stand-in installed before the tests run is sufficient (no other test file
// in the repo touches this global).
// ---------------------------------------------------------------------------

class MockVTTCue {
  public vertical: '' | 'rl' | 'lr' = '';
  public line: number | 'auto' = 'auto';
  public lineAlign: 'start' | 'center' | 'end' = 'start';
  public position: number | 'auto' = 'auto';
  public positionAlign: 'auto' | 'line-left' | 'center' | 'line-right' = 'auto';
  public size = 100;
  public align: 'start' | 'center' | 'end' | 'left' | 'right' = 'center';

  public constructor(
    public startTime: number,
    public endTime: number,
    public text: string,
  ) {}
}

const originalVTTCue = (globalThis as { VTTCue?: unknown }).VTTCue;

beforeAll(() => {
  (globalThis as { VTTCue?: unknown }).VTTCue = MockVTTCue;
});

afterAll(() => {
  (globalThis as { VTTCue?: unknown }).VTTCue = originalVTTCue;
});

describe('SubtitleFactory', () => {
  test('storageName is "subtitle"', () => {
    const factory = new SubtitleFactory();
    expect(factory.storageName).toBe('subtitle');
  });

  describe('process()', () => {
    test('detects "srt" format from a .srt URL', async () => {
      const factory = new SubtitleFactory();
      const source = { text: async () => 'raw', url: 'https://example.com/captions.srt' };

      const intermediate = await factory.process(source);

      expect(intermediate).toEqual({ fmt: 'srt', text: 'raw' });
    });

    test('defaults to "vtt" format for unknown extensions', async () => {
      const factory = new SubtitleFactory();
      const source = { text: async () => 'raw', url: 'https://example.com/captions.vtt' };

      const intermediate = await factory.process(source);

      expect(intermediate.fmt).toBe('vtt');
    });

    test('strips query strings before checking the extension', async () => {
      const factory = new SubtitleFactory();
      const source = { text: async () => 'raw', url: 'https://example.com/captions.srt?v=2' };

      const intermediate = await factory.process(source);

      expect(intermediate.fmt).toBe('srt');
    });

    test('is case-insensitive when detecting the extension', async () => {
      const factory = new SubtitleFactory();
      const source = { text: async () => 'raw', url: 'https://example.com/CAPTIONS.SRT' };

      const intermediate = await factory.process(source);

      expect(intermediate.fmt).toBe('srt');
    });
  });

  describe('create() — WebVTT', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.500
Hello there

00:00:03.000 --> 00:00:04.000 align:end line:10%,start
Second cue`;

    test('parses basic cue timing and text', async () => {
      const factory = new SubtitleFactory();

      const cues = (await factory.create({ fmt: 'vtt', text: vtt })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(2);
      expect(cues[0]!.startTime).toBe(1);
      expect(cues[0]!.endTime).toBe(2.5);
      expect(cues[0]!.text).toBe('Hello there');
    });

    test('applies cue settings (align, line) from the settings tail', async () => {
      const factory = new SubtitleFactory();

      const cues = (await factory.create({ fmt: 'vtt', text: vtt })) as unknown as MockVTTCue[];

      expect(cues[1]!.align).toBe('end');
      expect(cues[1]!.line).toBe(10);
      expect(cues[1]!.lineAlign).toBe('start');
    });

    test('ignores unknown or malformed settings tokens without throwing', async () => {
      const factory = new SubtitleFactory();
      const withGarbage = `WEBVTT

00:00:01.000 --> 00:00:02.000 bogus:xyz vertical:rl notokenwithoutcolon
Text`;

      const cues = (await factory.create({ fmt: 'vtt', text: withGarbage })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(1);
      expect(cues[0]!.vertical).toBe('rl');
    });

    test('applies "line:auto", "position", and "size" cue settings', async () => {
      const factory = new SubtitleFactory();
      const withSettings = `WEBVTT

00:00:01.000 --> 00:00:02.000 line:auto position:50%,center size:80%
Text`;

      const cues = (await factory.create({ fmt: 'vtt', text: withSettings })) as unknown as MockVTTCue[];

      expect(cues[0]!.line).toBe('auto');
      expect(cues[0]!.position).toBe(50);
      expect(cues[0]!.positionAlign).toBe('center');
      expect(cues[0]!.size).toBe(80);
    });

    test('ignores an unrecognized positionAlign value while still applying position', async () => {
      const factory = new SubtitleFactory();
      const withSettings = `WEBVTT

00:00:01.000 --> 00:00:02.000 position:25%,bogus-align
Text`;

      const cues = (await factory.create({ fmt: 'vtt', text: withSettings })) as unknown as MockVTTCue[];

      expect(cues[0]!.position).toBe(25);
      expect(cues[0]!.positionAlign).toBe('auto');
    });

    test('applies "vertical:lr" and skips an invalid vertical/lineAlign/position/size/align value', async () => {
      const factory = new SubtitleFactory();
      const withSettings = `WEBVTT

00:00:01.000 --> 00:00:02.000 vertical:lr
First

00:00:03.000 --> 00:00:04.000 vertical:bogus line:notanumber position:notanumber size:notanumber align:bogus
Second`;

      const cues = (await factory.create({ fmt: 'vtt', text: withSettings })) as unknown as MockVTTCue[];

      // First cue: "lr" is a valid vertical value.
      expect(cues[0]!.vertical).toBe('lr');

      // Second cue: every setting is malformed/invalid, so all are silently skipped
      // and every property keeps its constructor default.
      expect(cues[1]!.vertical).toBe('');
      expect(cues[1]!.line).toBe('auto');
      expect(cues[1]!.lineAlign).toBe('start');
      expect(cues[1]!.position).toBe('auto');
      expect(cues[1]!.size).toBe(100);
      expect(cues[1]!.align).toBe('center');
    });

    test('applies "line" with a valid lineAlign and skips when lineAlign is missing or invalid', async () => {
      const factory = new SubtitleFactory();
      const withSettings = `WEBVTT

00:00:01.000 --> 00:00:02.000 line:10%,start
First

00:00:03.000 --> 00:00:04.000 line:20%
Second`;

      const cues = (await factory.create({ fmt: 'vtt', text: withSettings })) as unknown as MockVTTCue[];

      expect(cues[0]!.line).toBe(10);
      expect(cues[0]!.lineAlign).toBe('start');

      // No comma segment => alignPart is undefined => lineAlign keeps its default.
      expect(cues[1]!.line).toBe(20);
      expect(cues[1]!.lineAlign).toBe('start');
    });

    test('parses HH:MM:SS.mmm timestamps with an hours component', async () => {
      const factory = new SubtitleFactory();
      const withHours = `WEBVTT

01:00:00.000 --> 01:00:05.000
Hour cue`;

      const cues = (await factory.create({ fmt: 'vtt', text: withHours })) as unknown as MockVTTCue[];

      expect(cues[0]!.startTime).toBe(3600);
      expect(cues[0]!.endTime).toBe(3605);
    });

    test('parses MM:SS.mmm timestamps (no hours component)', async () => {
      const factory = new SubtitleFactory();
      const withMinutes = `WEBVTT

01:02.500 --> 01:03.750
Minute cue`;

      const cues = (await factory.create({ fmt: 'vtt', text: withMinutes })) as unknown as MockVTTCue[];

      expect(cues[0]!.startTime).toBe(62.5);
      expect(cues[0]!.endTime).toBe(63.75);
    });

    test('parses bare SS.mmm timestamps (no minutes or hours component)', async () => {
      const factory = new SubtitleFactory();
      const withSeconds = `WEBVTT

01.500 --> 02.750
Second cue`;

      const cues = (await factory.create({ fmt: 'vtt', text: withSeconds })) as unknown as MockVTTCue[];

      expect(cues[0]!.startTime).toBe(1.5);
      expect(cues[0]!.endTime).toBe(2.75);
    });

    test('returns an empty array when there are no cues', async () => {
      const factory = new SubtitleFactory();

      const cues = await factory.create({ fmt: 'vtt', text: 'WEBVTT\n' });

      expect(cues).toEqual([]);
    });
  });

  describe('create() — SRT', () => {
    const srt = `1
00:00:01,000 --> 00:00:02,500
Hello there

2
00:00:03,000 --> 00:00:04,000
Second cue
spanning two lines`;

    test('parses indexed cues with comma-decimal timestamps', async () => {
      const factory = new SubtitleFactory();

      const cues = (await factory.create({ fmt: 'srt', text: srt })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(2);
      expect(cues[0]!.startTime).toBe(1);
      expect(cues[0]!.endTime).toBe(2.5);
      expect(cues[0]!.text).toBe('Hello there');
      expect(cues[1]!.text).toBe('Second cue\nspanning two lines');
    });

    test('handles blocks without a leading numeric index', async () => {
      const factory = new SubtitleFactory();
      const withoutIndex = `00:00:01,000 --> 00:00:02,000
Text only`;

      const cues = (await factory.create({ fmt: 'srt', text: withoutIndex })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(1);
      expect(cues[0]!.text).toBe('Text only');
    });

    test('skips a trailing block with fewer than 2 lines', async () => {
      const factory = new SubtitleFactory();
      const withStrayBlock = `1
00:00:01,000 --> 00:00:02,000
Hello

3`;

      const cues = (await factory.create({ fmt: 'srt', text: withStrayBlock })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(1);
      expect(cues[0]!.text).toBe('Hello');
    });

    test('skips a block whose timing line does not contain "-->"', async () => {
      const factory = new SubtitleFactory();
      const withMalformedTiming = `1
00:00:01,000 --> 00:00:02,000
Hello

4
00:00:05,000 not-an-arrow
Ignored`;

      const cues = (await factory.create({ fmt: 'srt', text: withMalformedTiming })) as unknown as MockVTTCue[];

      expect(cues).toHaveLength(1);
      expect(cues[0]!.text).toBe('Hello');
    });
  });
});
