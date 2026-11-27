import { asObject } from './read';

/** Identifies an embedded object in the same document. */
export interface LocalReference {
  readonly $ref: number;
}

interface LocalFrame {
  $id?: number;
}

type LocalTarget<T extends object> = abstract new (...args: never[]) => T;

export interface LocalReferenceWriter {
  /** Embeds a value once, adding an identity only if the document references it. */
  embed<T extends object>(value: object, write: () => T): T & LocalFrame;
  local(value: object): LocalReference;
}

export interface LocalReferenceReader {
  /** Constructs an embedded object and reserves its frame identity. */
  read<T extends object>(frame: unknown, create: (data: Readonly<Record<string, unknown>>) => T): T;
  /** Assigns the target after every embedded object has been constructed. */
  link<T extends object>(reference: unknown, type: LocalTarget<T>, assign: (target: T) => void): void;
}

const assertOpen = (open: boolean): void => {
  if (!open) {
    throw new Error('The document-local reference scope has ended.');
  }
};

const readId = (value: unknown, name: '$id' | '$ref'): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`A local document "${name}" must be a positive safe integer.`);
  }

  return value;
};

const rollbackTo = <Key>(map: Map<Key, unknown>, size: number, onRemove?: (key: Key) => void): void => {
  let index = 0;

  for (const key of map.keys()) {
    if (index++ >= size) {
      onRemove?.(key);
      map.delete(key);
    }
  }
};

/** Writes a document with a new identity scope. */
export const writeWithLocalReferences = <T>(write: (references: LocalReferenceWriter) => T): T => {
  const frames = new Map<object, LocalFrame | null>();
  const ids = new Map<object, number>();
  let open = true;

  const references: LocalReferenceWriter = {
    embed<Value extends object>(value: object, writeValue: () => Value): Value & LocalFrame {
      assertOpen(open);

      if (frames.has(value)) {
        throw new Error('This value is already embedded. Use a local reference to share it or close a cycle.');
      }

      const frameCheckpoint = frames.size;
      const idCheckpoint = ids.size;
      frames.set(value, null);

      try {
        const body = writeValue();

        if (asObject(body) === null || Object.hasOwn(body, '$id') || Object.hasOwn(body, '$ref')) {
          throw new TypeError('An embedded value must be an object without reserved "$id" or "$ref" fields.');
        }

        const id = ids.get(value);
        // A later link may mark this frame even if the serializer froze or reused its body.
        const frame = { ...body, ...(id !== undefined && { $id: id }) };
        frames.set(value, frame);

        return frame;
      } catch (error) {
        rollbackTo(frames, frameCheckpoint);
        rollbackTo(ids, idCheckpoint, target => {
          const frame = frames.get(target);

          if (frame) {
            delete frame.$id;
          }
        });

        throw error;
      }
    },
    local(value: object): LocalReference {
      assertOpen(open);
      let id = ids.get(value);

      if (id === undefined) {
        id = ids.size + 1;
        ids.set(value, id);

        const frame = frames.get(value);

        if (frame !== undefined && frame !== null) {
          frame.$id = id;
        }
      }

      return { $ref: id };
    },
  };

  try {
    const result = write(references);

    for (const value of ids.keys()) {
      if (!frames.get(value)) {
        throw new Error('A local reference points to a value not embedded in this document.');
      }
    }

    return result;
  } finally {
    open = false;
    ids.clear();
    frames.clear();
  }
};

/**
 * Reads one provisional tree, validates all links, then runs their assignments.
 * The caller owns teardown of provisional objects if construction or assignment
 * throws, including objects whose factories have already returned.
 */
export const readWithLocalReferences = <T>(read: (references: LocalReferenceReader) => T): T => {
  const objects = new Map<number, object | null>();
  const links: Array<() => () => void> = [];
  let open = true;

  const references: LocalReferenceReader = {
    read<Value extends object>(input: unknown, create: (data: Readonly<Record<string, unknown>>) => Value): Value {
      assertOpen(open);
      const frame = asObject(input);

      if (frame === null || Object.hasOwn(frame, '$ref')) {
        throw new TypeError('Expected an embedded frame without a "$ref" field.');
      }

      const objectCheckpoint = objects.size;
      const linkCheckpoint = links.length;

      try {
        if (!Object.hasOwn(frame, '$id')) {
          return create(frame);
        }

        const { $id, ...body } = frame;
        const id = readId($id, '$id');

        if (objects.has(id)) {
          throw new Error(`Duplicate local id ${id} in this document.`);
        }

        objects.set(id, null);
        const value = create(body);
        objects.set(id, value);

        return value;
      } catch (error) {
        links.length = linkCheckpoint;
        rollbackTo(objects, objectCheckpoint);

        throw error;
      }
    },
    link<Value extends object>(input: unknown, type: LocalTarget<Value>, assign: (target: Value) => void): void {
      assertOpen(open);
      const reference = asObject(input);

      if (reference === null || !Object.hasOwn(reference, '$ref') || Reflect.ownKeys(reference).length !== 1) {
        throw new TypeError('A local reference must contain only a $ref field.');
      }

      const id = readId(reference.$ref, '$ref');

      links.push(() => {
        const target = objects.get(id);

        if (target === undefined || target === null) {
          throw new Error(`Local reference ${id} points at nothing in this document.`);
        }

        if (!(target instanceof type)) {
          throw new TypeError(`Local reference ${id} does not match the expected ${type.name} class.`);
        }

        return () => assign(target);
      });
    },
  };

  try {
    const result = read(references);
    open = false;
    const assignments = links.map(resolve => resolve());

    for (const assign of assignments) {
      assign();
    }

    return result;
  } finally {
    open = false;
    links.length = 0;
    objects.clear();
  }
};
