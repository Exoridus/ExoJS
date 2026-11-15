// @vitest-environment node

import { type HostCommand, probeHost } from '../src/competitive/hostProbe';

describe('competitive host provenance probes', () => {
  test('records Windows display-driver inventory and active power scheme without asking for version strings', () => {
    const read: HostCommand = (program, args) => {
      if (program === 'powershell.exe') {
        expect(args.slice(0, 2)).toEqual(['-NoProfile', '-NonInteractive']);

        return JSON.stringify([
          { Name: 'NVIDIA GeForce RTX 5070 Ti', DriverVersion: '32.0.15.7652' },
          { Name: 'Microsoft Basic Render Driver', DriverVersion: '10.0.0.1' },
        ]);
      }

      if (program === 'powercfg.exe') {
        expect(args).toEqual(['/GETACTIVESCHEME']);

        return 'Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e (Balanced)';
      }

      throw new Error(`Unexpected command: ${program}`);
    };

    const host = probeHost('win32', read);

    expect(host.driver).toContain('NVIDIA GeForce RTX 5070 Ti: 32.0.15.7652');
    expect(host.driver).toContain('Microsoft Basic Render Driver');
    expect(host.power).toContain('381b4222-f694-41f0-9685-ff5bb260df2e');
    expect(host.power).toContain('AC/DC source not established');
  });

  test('records Apple OS-build graphics-stack proxy and live AC/low-power state', () => {
    const read: HostCommand = (program, args) => {
      const key = `${program} ${args.join(' ')}`;

      switch (key) {
        case 'sw_vers -productVersion':
          return '27.0';
        case 'sw_vers -buildVersion':
          return '26A5555b';
        case 'pmset -g batt':
          return "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1) 100%; charged;";
        case 'pmset -g':
          return 'System-wide power settings:\n lowpowermode 0\n';
        default:
          throw new Error(`Unexpected command: ${key}`);
      }
    };

    expect(probeHost('darwin', read)).toEqual({
      driver: 'Apple graphics stack: macOS 27.0 build 26A5555b (OS-build proxy; standalone GPU driver not exposed)',
      power: 'macOS AC Power; lowpowermode=0',
    });
  });

  test('marks unreadable or unsupported host data unverified instead of inventing a driver version', () => {
    const missing: HostCommand = () => null;

    expect(probeHost('win32', missing)).toEqual({ driver: 'UNVERIFIED', power: 'UNVERIFIED' });
    expect(probeHost('darwin', missing)).toEqual({ driver: 'UNVERIFIED', power: 'UNVERIFIED' });
    expect(probeHost('linux', missing)).toEqual({ driver: 'UNVERIFIED', power: 'UNVERIFIED' });
  });

  test('rejects malformed Windows driver payload and incomplete macOS builds', () => {
    const malformedWindows: HostCommand = () => '{not json';
    const incompleteMac: HostCommand = (program, args) => (program === 'sw_vers' && args[0] === '-productVersion' ? '27.0' : null);

    expect(probeHost('win32', malformedWindows).driver).toBe('UNVERIFIED');
    expect(probeHost('darwin', incompleteMac).driver).toBe('UNVERIFIED');
  });
});
