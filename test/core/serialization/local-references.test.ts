import { Component } from '#core/Component';
import { type LocalReference, readWithLocalReferences, writeWithLocalReferences } from '#core/serialization/localReferences';
import { Container } from '#rendering/Container';

class Item {
  public target: Item | undefined;
  public readonly children: Item[] = [];

  public constructor(public readonly name: string) {}
}

class Other {}

interface ItemFrame {
  readonly $type: 'item';
  readonly $version: 1;
  readonly $id?: number;
  readonly name: string;
  readonly target?: LocalReference;
  readonly children: readonly ItemFrame[];
}

const writeItem = (root: Item): ItemFrame =>
  writeWithLocalReferences(references => {
    const write = (item: Item): ItemFrame =>
      references.embed(item, () => ({
        $type: 'item',
        $version: 1,
        name: item.name,
        ...(item.target !== undefined && { target: references.local(item.target) }),
        children: item.children.map(write),
      }));

    return write(root);
  });

const readItem = (frame: unknown): Item =>
  readWithLocalReferences(references => {
    const read = (input: unknown): Item =>
      references.read(input, data => {
        if (data.$type !== 'item' || data.$version !== 1 || typeof data.name !== 'string' || !Array.isArray(data.children)) {
          throw new TypeError('Invalid item frame.');
        }

        const item = new Item(data.name);

        if (data.target !== undefined) {
          references.link(data.target, Item, target => {
            item.target = target;
          });
        }

        for (const child of data.children) {
          item.children.push(read(child));
        }

        return item;
      });

    return read(frame);
  });

describe('document-local references', () => {
  test('round-trips shared identity, a forward reference and a cycle with flat frames', () => {
    const root = new Item('root');
    const first = new Item('first');
    const second = new Item('second');
    root.children.push(first, second, new Item('unreferenced'));
    root.target = second;
    first.target = second;
    second.target = first;

    const frame = writeItem(root);

    expect(frame).not.toHaveProperty('$id');
    expect(frame.children[0]).toMatchObject({ $type: 'item', $version: 1, $id: 2, target: { $ref: 1 } });
    expect(frame.children[1]).toMatchObject({ $type: 'item', $version: 1, $id: 1, target: { $ref: 2 } });
    expect(frame.children[2]).not.toHaveProperty('$id');
    expect(frame.target).toEqual({ $ref: 1 });

    const restored = readItem(JSON.parse(JSON.stringify(frame)));
    expect(restored.children[0]?.target).toBe(restored.children[1]);
    expect(restored.children[1]?.target).toBe(restored.children[0]);
    expect(restored.target).toBe(restored.children[1]);
  });

  test('refuses values outside the document, repeated embeddings and by-value cycles', () => {
    const outside = new Item('outside');
    const root = new Item('root');
    root.target = outside;
    expect(() => writeItem(root)).toThrow(/not embedded in this document/);

    root.target = undefined;
    root.children.push(outside, outside);
    expect(() => writeItem(root)).toThrow(/already embedded/);

    root.children.length = 0;
    root.children.push(root);
    expect(() => writeItem(root)).toThrow(/already embedded/);
  });

  test.each([{ $id: 5 }, { $ref: 5 }])('rejects serializer-supplied reserved marker fields %o', body => {
    expect(() => writeWithLocalReferences(references => references.embed(new Item('root'), () => body))).toThrow(/reserved/);
  });

  test('uses fresh identities for each document even when writing the same runtime objects', () => {
    const root = new Item('root');
    root.target = root;
    const frame = writeItem(root);
    const copy = readItem(frame);
    expect(copy.target).toBe(copy);
    expect(writeItem(root)).toEqual(frame);
    expect(readItem(frame).target).not.toBe(copy);
  });

  test('a failed embedded write does not retain its identities or mark previous frames', () => {
    const retained = new Item('retained');
    const failed = new Item('failed');

    const document = writeWithLocalReferences(references => {
      const first = references.embed(retained, () => ({ name: retained.name }));
      expect(() =>
        references.embed(failed, () => {
          references.local(retained);
          references.local(failed);

          throw new Error('discard this write');
        }),
      ).toThrow('discard this write');

      return [first, references.embed(failed, () => ({ name: 'fallback' }))];
    });

    expect(document).toEqual([{ name: 'retained' }, { name: 'fallback' }]);
  });

  test.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1', undefined])(
    'rejects malformed id and reference markers %o',
    malformed => {
      expect(() => readWithLocalReferences(references => references.read({ $id: malformed }, () => new Item('a')))).toThrow(
        /positive safe integer/,
      );
      expect(() =>
        readWithLocalReferences(references => {
          references.link({ $ref: malformed }, Item, vi.fn());
        }),
      ).toThrow(/positive safe integer/);
    },
  );

  test('rejects duplicate ids before constructing the second object', () => {
    const duplicate = vi.fn(() => new Item('b'));

    expect(() =>
      readWithLocalReferences(references => {
        references.read({ $id: 1 }, () => new Item('a'));
        references.read({ $id: 1 }, duplicate);
      }),
    ).toThrow(/duplicate local id 1/i);
    expect(duplicate).not.toHaveBeenCalled();
  });

  test('rejects mixed frame and reference fields', () => {
    expect(() => readWithLocalReferences(references => references.read({ $ref: 1 }, () => new Item('a')))).toThrow(/embedded frame/);
    expect(() =>
      readWithLocalReferences(references => {
        references.link({ $ref: 1, $type: 'texture', source: 'texture.png' }, Item, vi.fn());
      }),
    ).toThrow(/only a \$ref/);
  });

  test('validates all target identities and classes before making any assignments', () => {
    const assign = vi.fn();
    const read = (expected: typeof Item | typeof Other, id: number): void =>
      readWithLocalReferences(references => {
        references.read({ $id: 1 }, () => new Item('a'));
        references.link({ $ref: 1 }, Item, assign);
        references.link({ $ref: id }, expected, assign);
      });

    expect(() => read(Item, 2)).toThrow(/points at nothing/);
    expect(() => read(Other, 1)).toThrow(/expected Other/);
    expect(assign).not.toHaveBeenCalled();
  });

  test('a recovered child read discards only its provisional ids and links', () => {
    const assign = vi.fn();
    const omitted = vi.fn();
    const restored = readWithLocalReferences(references => {
      references.read({ $id: 1 }, () => new Item('already-built'));
      references.link({ $ref: 1 }, Item, assign);
      expect(() =>
        references.read({}, () => {
          references.link({ $ref: 99 }, Item, omitted);
          references.read({ $id: 2 }, () => new Item('discarded'));

          throw new Error('discard this read');
        }),
      ).toThrow('discard this read');

      return references.read({ $id: 2 }, () => new Item('fallback'));
    });

    expect(restored.name).toBe('fallback');
    expect(assign).toHaveBeenCalledOnce();
    expect(omitted).not.toHaveBeenCalled();
  });

  test('paired components stay provisional until they can attach with resolved peers', () => {
    class Paired extends Component {
      public peer: Paired | undefined;
      public linkedAtAttach = false;

      protected override onAttach(): void {
        this.linkedAtAttach = this.peer?.peer === this;
      }
    }

    const [first, second] = readWithLocalReferences(references => {
      const read = (id: number, peer: number): Paired =>
        references.read({ $id: id, peer: { $ref: peer } }, data => {
          const component = new Paired();

          references.link(data.peer, Paired, target => {
            component.peer = target;
          });

          return component;
        });

      return [read(1, 2), read(2, 1)] as const;
    });

    expect(first.attached).toBe(false);
    expect(second.attached).toBe(false);

    const firstHost = new Container();
    const secondHost = new Container();
    firstHost.addComponent(first);
    secondHost.addComponent(second);

    expect(first.linkedAtAttach).toBe(true);
    expect(second.linkedAtAttach).toBe(true);
    firstHost.destroy();
    secondHost.destroy();
    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(true);
  });
});
