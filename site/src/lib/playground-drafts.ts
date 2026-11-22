import { isEditableSharedFile } from './preview-modules';
import { channelStorageKey, siteBuild, type SiteBuildInfo } from './site-build-info';

export interface PlaygroundDraft {
  entry: string;
  helpers: Record<string, { source: string; original: string }>;
}

export interface DraftWriteResult {
  persistence: 'session' | 'memory';
  evicted: number;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;
interface DraftStore {
  load(key: string): PlaygroundDraft | null;
  isPersisted(key: string): boolean;
  hasUnpersistedChanges(): boolean;
  save(key: string, draft: PlaygroundDraft): DraftWriteResult;
  remove(key: string): DraftWriteResult;
}

const STORAGE_KEY = channelStorageKey('playground-drafts:v1');

const isDraft = (value: unknown): value is PlaygroundDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const draft = value as Partial<PlaygroundDraft>;

  return (
    typeof draft.entry === 'string' &&
    draft.helpers !== null &&
    typeof draft.helpers === 'object' &&
    !Array.isArray(draft.helpers) &&
    Object.entries(draft.helpers).every(
      ([path, helper]) => isEditableSharedFile(path) && typeof helper?.source === 'string' && typeof helper.original === 'string',
    )
  );
};

/** Session storage is bounded; its failure never prevents editing or navigation. */
export const createDraftStore = (storage: () => DraftStorage, limits: { maxDrafts?: number; maxChars?: number } = {}): DraftStore => {
  const maxDrafts = limits.maxDrafts ?? 12;
  const maxChars = limits.maxChars ?? 2_000_000;
  const drafts = new Map<string, PlaygroundDraft>();
  let persisted = new Map<string, PlaygroundDraft>();
  let initialized = false;

  const read = (): void => {
    if (initialized) {
      return;
    }

    initialized = true;

    try {
      const serialized = storage().getItem(STORAGE_KEY);

      if (!serialized || serialized.length > maxChars) {
        return;
      }

      const entries: unknown = JSON.parse(serialized);

      if (!Array.isArray(entries)) {
        return;
      }

      for (const entry of entries.slice(-maxDrafts)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && isDraft(entry[1])) {
          drafts.set(entry[0], entry[1]);
          persisted.set(entry[0], entry[1]);
        }
      }
    } catch {
      // Memory still retains edits if storage access is denied or corrupt.
    }
  };

  const write = (snapshot: Map<string, PlaygroundDraft>, evicted = 0): DraftWriteResult => {
    try {
      storage().setItem(STORAGE_KEY, JSON.stringify([...snapshot]));
      persisted = snapshot;

      return { persistence: 'session', evicted };
    } catch {
      return { persistence: 'memory', evicted: 0 };
    }
  };

  return {
    load(key): PlaygroundDraft | null {
      read();
      const draft = drafts.get(key);

      return draft ? structuredClone(draft) : null;
    },
    isPersisted(key): boolean {
      read();

      return drafts.has(key) && JSON.stringify(drafts.get(key)) === JSON.stringify(persisted.get(key));
    },
    hasUnpersistedChanges(): boolean {
      read();

      return (
        drafts.size !== persisted.size || [...drafts].some(([key, draft]) => JSON.stringify(draft) !== JSON.stringify(persisted.get(key)))
      );
    },
    save(key, draft): DraftWriteResult {
      read();
      // Navigation always gets the newest edits, even when a durable snapshot
      // is too large or storage is temporarily unavailable.
      drafts.set(key, structuredClone(draft));

      if (JSON.stringify([[key, draft]]).length > maxChars) {
        return { persistence: 'memory', evicted: 0 };
      }

      const snapshot = new Map(persisted);
      snapshot.delete(key);
      snapshot.set(key, structuredClone(draft));
      let evicted = 0;

      while (snapshot.size > maxDrafts || JSON.stringify([...snapshot]).length > maxChars) {
        snapshot.delete(snapshot.keys().next().value!);
        evicted++;
      }

      return write(snapshot, evicted);
    },
    remove(key): DraftWriteResult {
      read();
      drafts.delete(key);
      const snapshot = new Map(persisted);
      snapshot.delete(key);

      return write(snapshot);
    },
  };
};

export const playgroundDrafts = createDraftStore(() => window.sessionStorage);
export const playgroundDraftKey = (
  version: string,
  path: string,
  build: Pick<SiteBuildInfo, 'packageVersion' | 'sourceSha'> = siteBuild,
): string => JSON.stringify(version === 'current' ? [version, build.packageVersion, build.sourceSha, path] : [version, path]);
