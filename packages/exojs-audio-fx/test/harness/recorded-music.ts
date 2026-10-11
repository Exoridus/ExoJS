import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from '../fixtures/music/manifest.json';
import { computeMirMetrics } from './beat-metrics';
import type { WorkletMessage } from './beat-sandbox';

export type MusicAnnotation =
  | { status: 'unreviewed'; candidateBeatTimesSec: number[]; notes: string }
  | { status: 'reviewed'; kind: 'beats' | 'no-pulse'; beatTimesSec: number[]; reviewedBy: string; notes: string };

interface RecordedMusic {
  label: string;
  samples: Float32Array;
  annotation: MusicAnnotation;
}

const corpusDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/music');

/** Accepts only the corpus's canonical 48 kHz mono signed-16 WAV, without gain adjustment. */
export const decodeRecordedPcm = (bytes: Buffer): Float32Array => {
  if (
    bytes.length < 44 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    bytes.readUInt32LE(16) !== 16 ||
    bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== 1 ||
    bytes.readUInt32LE(24) !== 48000 ||
    bytes.readUInt32LE(28) !== 96000 ||
    bytes.readUInt16LE(32) !== 2 ||
    bytes.readUInt16LE(34) !== 16 ||
    bytes.toString('ascii', 36, 40) !== 'data' ||
    bytes.readUInt32LE(40) !== bytes.length - 44 ||
    (bytes.length - 44) % 2 !== 0
  ) {
    throw new Error('Expected canonical 48 kHz mono signed-16 PCM WAV');
  }

  const samples = new Float32Array((bytes.length - 44) / 2);

  for (let i = 0; i < samples.length; i++) {
    samples[i] = bytes.readInt16LE(44 + i * 2) / 32768;
  }

  return samples;
};

const validateAnnotation = (annotation: MusicAnnotation, durationSec: number): void => {
  if (annotation.status !== 'reviewed' && annotation.status !== 'unreviewed') {
    throw new Error('Unknown annotation status');
  }

  const times = annotation.status === 'reviewed' ? annotation.beatTimesSec : annotation.candidateBeatTimesSec;

  if (
    !Array.isArray(times) ||
    times.some((time, i) => !Number.isFinite(time) || time < 0 || time >= durationSec || (i > 0 && time <= times[i - 1]))
  ) {
    throw new Error('Beat times must be finite, increasing and within the excerpt');
  }

  if (!annotation.notes?.trim()) {
    throw new Error('Annotation method or review notes required');
  }

  if (annotation.status === 'reviewed') {
    if (!annotation.reviewedBy?.trim()) {
      throw new Error('Reviewer required');
    }

    if (annotation.kind === 'beats' ? times.length < 2 : annotation.kind !== 'no-pulse' || times.length !== 0) {
      throw new Error('Reviewed beats require at least two timestamps; reviewed no-pulse requires none');
    }
  }
};

export const loadRecordedMusic = (): RecordedMusic[] => {
  if (manifest.schemaVersion !== 1 || manifest.sampleRate !== 48000 || manifest.channels !== 1 || manifest.bitsPerSample !== 16) {
    throw new Error('Unsupported recorded music corpus');
  }

  return manifest.fixtures.map(entry => {
    const bytes = readFileSync(resolve(corpusDirectory, entry.file));

    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
      throw new Error(`Music checksum mismatch: ${entry.id}`);
    }

    const samples = decodeRecordedPcm(bytes);

    if (samples.length !== entry.durationSec * 48000) {
      throw new Error(`Music duration mismatch: ${entry.id}`);
    }

    const annotation = entry.annotation as MusicAnnotation;
    validateAnnotation(annotation, entry.durationSec);

    return { label: entry.id, samples, annotation };
  });
};

/** Unreviewed proposals produce observations only, never accuracy or false-positive claims. */
export const evaluateRecordedMusic = (messages: WorkletMessage[], fixture: RecordedMusic) => {
  const { samples, label, annotation } = fixture;
  validateAnnotation(annotation, samples.length / 48000);
  const beats = messages.filter(message => message.type === 'beat');
  const states = messages.filter(message => message.type === 'state');
  const tempos = states
    .map(state => state.tempo)
    .filter(tempo => tempo > 0)
    .sort((a, b) => a - b);
  const observed = {
    provisionalCount: beats.filter(beat => beat.status === 'provisional').length,
    lockedCount: beats.filter(beat => beat.status === 'locked').length,
    firstPostedSec: beats.length ? Math.min(...beats.map(beat => beat._audioTimeSec)) : null,
    medianEstimatedTempo: tempos.length ? tempos[Math.floor(tempos.length / 2)] : null,
    meanConfidence: states.length ? states.reduce((sum, state) => sum + state.confidence, 0) / states.length : null,
  };

  if (annotation.status === 'unreviewed') {
    return { label, annotationStatus: annotation.status, observed, quality: null };
  }

  const times = annotation.beatTimesSec;

  const bpm = (time: number): number => {
    const next = times.findIndex(beatTime => beatTime > time);

    return next > 0 ? 60 / (times[next] - times[next - 1]) : 0;
  };

  return {
    label,
    annotationStatus: annotation.status,
    observed,
    quality: computeMirMetrics(messages, { label, samples, beatTimesSec: times, bpm }),
  };
};
