import { execFileSync } from 'node:child_process';

/** Host-only probes. They never use shell interpolation or change system configuration. */
export type HostCommand = (program: string, args: readonly string[]) => string | null;

const readCommand: HostCommand = (program, args) => {
  try {
    const value = execFileSync(program, [...args], {
      encoding: 'utf8',
      timeout: 6_000,
      windowsHide: true,
      maxBuffer: 128 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return value.length > 0 ? value : null;
  } catch {
    // Absent platform utilities, unsupported drivers and access restrictions
    // are missing evidence, never a reason to invent a version or abort a run.
    return null;
  }
};

export interface HostProbe {
  /** Actual OS-reported display-driver versions, or the macOS OS-build proxy. */
  readonly driver: string;
  /** Observed active power source and/or plan, never an assumed AC connection. */
  readonly power: string;
}

const windowsDriver = (read: HostCommand): string => {
  const output = read('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$g = @(Get-CimInstance Win32_VideoController -ErrorAction Stop | Where-Object { $_.Name -and $_.DriverVersion } | Select-Object Name,DriverVersion); $g | ConvertTo-Json -Compress',
  ]);

  if (output === null) {
    return 'UNVERIFIED';
  }

  try {
    const parsed: unknown = JSON.parse(output);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const identified = entries
      .filter((entry): entry is { Name: string; DriverVersion: string } => {
        if (typeof entry !== 'object' || entry === null) {
          return false;
        }

        const record = entry as Record<string, unknown>;

        return typeof record.Name === 'string' && typeof record.DriverVersion === 'string';
      })
      .map(entry => `${entry.Name.trim()}: ${entry.DriverVersion.trim()}`)
      .filter(value => !value.startsWith(':') && value.length > 3)
      .sort();

    return identified.length > 0 ? `Windows display-driver inventory: ${identified.join('; ')}` : 'UNVERIFIED';
  } catch {
    return 'UNVERIFIED';
  }
};

const windowsPower = (read: HostCommand): string => {
  const output = read('powercfg.exe', ['/GETACTIVESCHEME']);

  if (output === null) {
    return 'UNVERIFIED';
  }

  // The GUID is locale-independent. Record the plan, but do not claim that
  // the current AC/DC source can be inferred from the active power plan.
  const match = /([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})/i.exec(output);

  return match === null ? 'UNVERIFIED' : `Windows active power scheme ${match[1]}; AC/DC source not established`;
};

const macDriver = (read: HostCommand): string => {
  const version = read('sw_vers', ['-productVersion']);
  const build = read('sw_vers', ['-buildVersion']);

  const versionParts = version?.split('.') ?? [];
  const validVersion =
    versionParts.length > 0 &&
    versionParts.length <= 4 &&
    versionParts.every(part => part.length > 0 && part.length <= 3 && /^[0-9]+$/.test(part));

  if (!validVersion || build === null || !/^[\w.]+$/.test(build)) {
    return 'UNVERIFIED';
  }

  // Apple does not expose a separately comparable GPU driver version.
  // The exact OS build is a reproducible graphics-stack version proxy.
  return `Apple graphics stack: macOS ${version} build ${build} (OS-build proxy; standalone GPU driver not exposed)`;
};

const macPower = (read: HostCommand): string => {
  const output = read('pmset', ['-g', 'batt']);
  const source = output === null ? null : /Now drawing from '([^']+)'/.exec(output)?.[1];

  if (source === undefined || source === null) {
    return 'UNVERIFIED';
  }

  const settings = read('pmset', ['-g']);
  const lowPower = settings === null ? null : /(?:^|\n)\s*lowpowermode\s+(\d+)/.exec(settings)?.[1];

  return `macOS ${source}${lowPower === undefined || lowPower === null ? '' : `; lowpowermode=${lowPower}`}`;
};

/**
 * Best-effort host metadata that is stable across a measurement session.
 *
 * Background GPU activity cannot be proven absent through a generic system
 * command. The caller must retain UNVERIFIED unless the operator explicitly
 * declares controlled conditions; do not silently stamp "idle".
 */
export const probeHost = (hostPlatform: NodeJS.Platform, read: HostCommand = readCommand): HostProbe => {
  if (hostPlatform === 'win32') {
    return { driver: windowsDriver(read), power: windowsPower(read) };
  }

  if (hostPlatform === 'darwin') {
    return { driver: macDriver(read), power: macPower(read) };
  }

  return { driver: 'UNVERIFIED', power: 'UNVERIFIED' };
};
