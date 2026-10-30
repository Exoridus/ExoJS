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
