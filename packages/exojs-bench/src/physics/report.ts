import type { LibraryProvenance } from '../shared/provenance';
import { csvField, formatCount as count, formatMs as ms, writeReportArtifacts } from '../shared/report';
import type { PhysicsProvenance } from './driver';
import type { PhysicsCellResult } from './PhysicsAdapter';

/** Everything one physics run produces: the provenance stamp, arm versions, and per-cell results. */
export interface PhysicsReportData {
  /** The run's provenance stamp (host, engine version, timestep, caveats). */
  readonly provenance: PhysicsProvenance;
  /** Version + resolution provenance for each physics engine arm. */
  readonly libraries: readonly LibraryProvenance[];
  /** One result per matrix cell. */
  readonly results: readonly PhysicsCellResult[];
}

/** Ordered columns shared by the CSV and the Markdown table. */
const COLUMNS = [
  'engine',
  'config',
  'archetype',
  'bodyCount',
  'warmupSteps',
  'timedSteps',
  'stepMsMedian',
  'stepMsP95',
  'bodies',
  'contacts',
  'status',
  'note',
] as const;

const toRow = (result: PhysicsCellResult): string[] => {
  const { spec, structural } = result;

  return [
    spec.engine,
    spec.config,
    spec.archetype,
    String(spec.bodyCount),
    String(spec.warmupSteps),
    String(spec.timedSteps),
    ms(result.stepMsMedian),
    ms(result.stepMsP95),
    count(structural.bodyCount),
    count(structural.contactCount),
    result.status,
    result.note ?? '',
  ];
};

const toCsv = (data: PhysicsReportData): string =>
  [COLUMNS.join(','), ...data.results.map(result => toRow(result).map(csvField).join(','))].join('\n');

/**
 * Human-readable Markdown: the arm versions and the host/provenance block first
 * (a step-time number is only comparable if the CPU + Node + exojs-physics
 * version that produced it are on the record), the disclosed caveats, then one
 * table with the structural counters (bodies, contacts) sitting BESIDE the
 * timings — a fast step that came from fewer contacts must be visible in the
 * same row.
 */
const toMarkdown = (data: PhysicsReportData): string => {
  const { provenance } = data;
  const lines: string[] = [];

  lines.push('# Physics Benchmark Results', '');

  lines.push('## Arms', '');

  if (data.libraries.length === 0) {
    lines.push('- (none)', '');
  } else {
    for (const library of data.libraries) {
      const resolved = library.resolvedFrom.length > 0 ? library.resolvedFrom : 'not resolved';

      lines.push(`- \`${library.name}\` @ **${library.version}** (resolved from: ${resolved})`);
    }

    lines.push('');
  }

  lines.push('## Provenance', '');
  lines.push(`- Engine version (exojs-physics): ${provenance.engineVersion}`);
  lines.push(`- Node: ${provenance.host.node}`);
  lines.push(`- CPU: ${provenance.host.cpu} (${String(provenance.host.cpuCount)} logical)`);
  lines.push(`- OS: ${provenance.host.os} (${provenance.host.arch})`);
  lines.push(`- Fixed timestep: ${String(provenance.fixedDelta)} s`);
  lines.push(`- Timestamp: ${provenance.timestamp}`);
  lines.push('');

  lines.push('## Caveats', '');

  for (const caveat of provenance.caveats) {
    lines.push(`- ${caveat}`);
  }

  lines.push('');

  lines.push('## Results', '');
  lines.push(`| ${COLUMNS.join(' | ')} |`);
  lines.push(`| ${COLUMNS.map(() => '---').join(' | ')} |`);

  for (const result of data.results) {
    lines.push(`| ${toRow(result).map(field => field.replaceAll('|', '\\|')).join(' | ')} |`);
  }

  lines.push('');

  return lines.join('\n');
};

/**
 * Writes the three physics report artifacts into `outDir`:
 * - `results.json` — full fidelity (provenance + every result field).
 * - `results.csv` — one row per cell, machine-parseable.
 * - `results.md` — provenance/caveats block plus a human-readable table.
 */
export const writePhysicsReport = (data: PhysicsReportData, outDir: string): void => {
  writeReportArtifacts(outDir, {
    json: `${JSON.stringify(data, null, 2)}\n`,
    csv: `${toCsv(data)}\n`,
    md: toMarkdown(data),
  });
};
