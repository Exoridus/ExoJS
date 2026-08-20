import type { SerializedActionBinding } from './serialization';

/** Wire format {@link BindingProfile.toJSON} produces and {@link BindingProfile.fromJSON} accepts. */
export interface BindingProfileData {
  readonly version: 1;
  readonly overrides: Readonly<Record<string, SerializedActionBinding>>;
}

const currentVersion = 1;

/**
 * A player's rebindings, as the persistable delta against the developer's
 * defaults.
 *
 * A profile stores ONLY the actions a player actually changed. That is the
 * whole point of keeping it separate from the defaults: a full snapshot taken
 * today would freeze every action a game gains tomorrow at whatever binding it
 * had — or lacked — when the save was written, so adding a new action with a
 * new default would silently do nothing for returning players.
 *
 * A profile holds no reference to any live action or map. Apply it with
 * {@link ActionMap.applyProfile}, which validates it against the map's actual
 * actions and applies it as one transaction.
 *
 * @example
 * ```ts
 * const profile = BindingProfile.fromJSON(JSON.parse(localStorage.getItem('bindings') ?? '{}'));
 *
 * controls.applyProfile(profile);
 * ```
 */
export class BindingProfile {
  private readonly _overrides = new Map<string, SerializedActionBinding>();

  /** Number of actions this profile overrides. */
  public get size(): number {
    return this._overrides.size;
  }

  /** Names of the overridden actions, in insertion order. */
  public get names(): readonly string[] {
    return [...this._overrides.keys()];
  }

  /** The stored override for `action`, or `undefined` when it keeps its default. */
  public get(action: string): SerializedActionBinding | undefined {
    return this._overrides.get(action);
  }

  /** Record `binding` as `action`'s override, replacing any earlier one. */
  public set(action: string, binding: SerializedActionBinding): this {
    this._overrides.set(action, binding);

    return this;
  }

  /** Drop `action`'s override so it falls back to its developer default. */
  public reset(action: string): this {
    this._overrides.delete(action);

    return this;
  }

  /** Drop every override. */
  public clear(): this {
    this._overrides.clear();

    return this;
  }

  /** Snapshot suitable for `JSON.stringify`. Contains tokens only — no gamepad slots, no device indices. */
  public toJSON(): BindingProfileData {
    return { version: currentVersion, overrides: Object.fromEntries(this._overrides) };
  }

  /**
   * Rebuild a profile from {@link toJSON} output (or from `JSON.parse` of it).
   *
   * Structure is validated here; individual tokens are validated when the
   * profile is applied to a map, since only the map knows which action kind
   * each entry has to fit.
   *
   * @throws {Error} If `data` is not a profile of a version this build
   * understands, or an entry is not a `{ kind, binding }` pair. A malformed
   * save is reported rather than partially honoured.
   */
  public static fromJSON(data: unknown): BindingProfile {
    if (data === null || typeof data !== 'object') {
      throw new Error('BindingProfile: expected a serialized profile object.');
    }

    const { version, overrides } = data as Partial<BindingProfileData>;

    if (version !== currentVersion) {
      throw new Error(`BindingProfile: unsupported profile version ${String(version)} (this build reads version ${currentVersion}).`);
    }

    if (overrides === undefined || typeof overrides !== 'object') {
      throw new Error('BindingProfile: a serialized profile needs an "overrides" object.');
    }

    const profile = new BindingProfile();

    for (const [action, binding] of Object.entries(overrides)) {
      if (binding === null || typeof binding !== 'object' || typeof (binding).kind !== 'string' || !('binding' in binding)) {
        throw new Error(`BindingProfile: the override for "${action}" is not a { kind, binding } pair.`);
      }

      profile.set(action, binding);
    }

    return profile;
  }
}
