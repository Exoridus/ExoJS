import { parseSubtitles } from '#assets/factories/parseSubtitles';

describe('subtitle positioning with native VTTCue', () => {
  test.each([0, 12.5, 80, 100])('uses percentage positioning for line:%s', line => {
    expect(new VTTCue(1, 2, 'Text').snapToLines).toBe(true);
    const [cue] = parseSubtitles({ fmt: 'vtt', text: `WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:${line}%,center\nText` });

    expect(cue).toBeInstanceOf(VTTCue);
    expect(cue!.line).toBe(line);
    expect(cue!.snapToLines).toBe(false);
    expect(cue!.lineAlign).toBe('center');
  });

  test('a later bare numeric setting restores line counting', () => {
    const [cue] = parseSubtitles({ fmt: 'vtt', text: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:80% line:-2,end\nText' });

    expect(cue!.line).toBe(-2);
    expect(cue!.snapToLines).toBe(true);
    expect(cue!.lineAlign).toBe('end');
  });

  test('omitted WebVTT settings and SubRip preserve native defaults', () => {
    const [vtt] = parseSubtitles({ fmt: 'vtt', text: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nText' });
    const [srt] = parseSubtitles({ fmt: 'srt', text: '1\n00:00:01,000 --> 00:00:02,000\nText' });

    for (const cue of [vtt!, srt!]) {
      expect(cue).toBeInstanceOf(VTTCue);
      expect(cue.line).toBe('auto');
      expect(cue.snapToLines).toBe(true);
    }
  });
});

describe('malformed cue timings with native VTTCue', () => {
  test.each([
    ['vtt', 'WEBVTT\n\nbad --> 00:00:02.000\nBad\n\n00:00:03.000 --> 00:00:04.000\nGood'],
    ['srt', '1\nbad --> 00:00:02,000\nBad\n\n2\n00:00:03,000 --> 00:00:04,000\nGood'],
  ] as const)('%s skips a cue whose timing does not parse and keeps the rest', (fmt, text) => {
    const cues = parseSubtitles({ fmt, text });

    expect(cues.map(cue => [cue.startTime, cue.endTime, cue.text])).toEqual([[3, 4, 'Good']]);
  });
});
