import { AudioBus } from '@/audio/AudioBus';
import { disposeAudioManager, AudioManager, getAudioManager } from '@/audio/AudioManager';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioManager', () => {
  beforeEach(() => {
    disposeAudioManager();
  });

  afterEach(() => {
    disposeAudioManager();
    jest.restoreAllMocks();
  });

  // 1. Singleton
  test('getAudioManager() returns the same instance on repeated calls', () => {
    const a = getAudioManager();
    const b = getAudioManager();
    expect(a).toBe(b);
  });

  // 2. Built-in buses exist
  test('built-in buses master, music, sound exist as AudioBus instances', () => {
    const mixer = getAudioManager();
    expect(mixer.master).toBeInstanceOf(AudioBus);
    expect(mixer.music).toBeInstanceOf(AudioBus);
    expect(mixer.sound).toBeInstanceOf(AudioBus);
  });

  test('built-in buses have correct names', () => {
    const mixer = getAudioManager();
    expect(mixer.master.name).toBe('master');
    expect(mixer.music.name).toBe('music');
    expect(mixer.sound.name).toBe('sound');
  });

  // 3. Bus hierarchy
  test('music parent is master', () => {
    const mixer = getAudioManager();
    expect(mixer.music.parent).toBe(mixer.master);
  });

  test('sound parent is master', () => {
    const mixer = getAudioManager();
    expect(mixer.sound.parent).toBe(mixer.master);
  });

  test('master parent is null', () => {
    const mixer = getAudioManager();
    expect(mixer.master.parent).toBeNull();
  });

  // 4. registerBus succeeds for new bus
  test('registerBus() adds a custom bus that can be retrieved via getBus()', () => {
    const mixer = getAudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    expect(mixer.getBus('voice')).toBe(voice);
  });

  // 5. Re-registering same name throws
  test('registerBus() throws if name is already registered', () => {
    const mixer = getAudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    const voice2 = new AudioBus('voice');
    expect(() => mixer.registerBus(voice2)).toThrow('Audio bus "voice" is already registered.');
    voice2.destroy();
  });

  // 6. unregisterBus
  test('unregisterBus() removes and destroys a custom bus', () => {
    const mixer = getAudioManager();
    const voice = new AudioBus('voice');
    mixer.registerBus(voice);
    mixer.unregisterBus(voice);
    expect(mixer.hasBus('voice')).toBe(false);
  });

  test('unregisterBus() throws for master', () => {
    const mixer = getAudioManager();
    expect(() => mixer.unregisterBus(mixer.master)).toThrow('Cannot unregister built-in bus "master".');
  });

  test('unregisterBus() throws for music', () => {
    const mixer = getAudioManager();
    expect(() => mixer.unregisterBus(mixer.music)).toThrow('Cannot unregister built-in bus "music".');
  });

  test('unregisterBus() throws for sound', () => {
    const mixer = getAudioManager();
    expect(() => mixer.unregisterBus(mixer.sound)).toThrow('Cannot unregister built-in bus "sound".');
  });

  test('unregisterBus() is a no-op for a bus that was never registered', () => {
    const mixer = getAudioManager();
    const orphan = new AudioBus('orphan');
    expect(() => mixer.unregisterBus(orphan)).not.toThrow();
    orphan.destroy();
  });

  // 7. getBus / hasBus
  test('getBus() returns the registered bus by name', () => {
    const mixer = getAudioManager();
    const bus = new AudioBus('sfx');
    mixer.registerBus(bus);
    expect(mixer.getBus('sfx')).toBe(bus);
  });

  test('getBus() throws for an unknown name', () => {
    const mixer = getAudioManager();
    expect(() => mixer.getBus('typo')).toThrow('Audio bus "typo" is not registered.');
  });

  test('hasBus() returns true for registered bus', () => {
    const mixer = getAudioManager();
    expect(mixer.hasBus('master')).toBe(true);
    const bus = new AudioBus('ambient');
    mixer.registerBus(bus);
    expect(mixer.hasBus('ambient')).toBe(true);
  });

  test('hasBus() returns false for unregistered name', () => {
    const mixer = getAudioManager();
    expect(mixer.hasBus('typo')).toBe(false);
  });

  // 8. muteOnHidden
  test('muteOnHidden defaults to false', () => {
    const mixer = getAudioManager();
    expect(mixer.muteOnHidden).toBe(false);
  });

  test('muteOnHidden=true: _applyVisibility(false) mutes master', () => {
    const mixer = getAudioManager();
    mixer.muteOnHidden = true;
    expect(mixer.master.muted).toBe(false);
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
  });

  test('muteOnHidden=false: _applyVisibility(false) does NOT mute master', () => {
    const mixer = getAudioManager();
    mixer.muteOnHidden = false;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(false);
  });

  test('after visibility returns to true, master is unmuted', () => {
    const mixer = getAudioManager();
    mixer.muteOnHidden = true;
    mixer._applyVisibility(false);
    expect(mixer.master.muted).toBe(true);
    mixer._applyVisibility(true);
    expect(mixer.master.muted).toBe(false);
  });

  // 9. AudioManager constructor creates a new independent instance
  test('new AudioManager() creates independent buses (not the singleton)', () => {
    const mixer1 = getAudioManager();
    const mixer2 = new AudioManager();

    expect(mixer2).not.toBe(mixer1);
    expect(mixer2.master).not.toBe(mixer1.master);

    mixer2.destroy();
  });
});
