import type { Component, ComponentClass } from '#core/Component';
import type { CheckedHistory } from '#core/document/CheckedHistory';
import { DocumentHistory, type VersionedDocument } from '#core/document/DocumentHistory';
import type { DocumentParser } from '#core/document/DocumentParser';
import type { Migration } from '#core/document/Migration';

import type { DeserializeContext, SerializeContext } from './NodeSerializer';

type AnyMigration = Migration<never, unknown>;

/** Opt-in persistence for one component class. */
export interface ComponentTypeDefinition<
  Value extends Component,
  Document extends object,
  Version extends number = 1,
  Min extends number = 1,
  Chain extends readonly AnyMigration[] = readonly [],
> {
  readonly type: string;
  readonly version?: Version;
  readonly minVersion?: Min;
  readonly migrations?: Chain;
  readonly parser: DocumentParser<Document>;
  /** Creates a fresh, detached component from the validated current body. */
  readonly create: (document: NoInfer<Document>, context: DeserializeContext) => NoInfer<Value>;
  /** Writes only the persisted fields. The framework writes type, version and identity. */
  readonly serializer: {
    readonly serialize: (value: NoInfer<Value>, context: SerializeContext) => NoInfer<Document>;
  };
}

interface ComponentSerializerEntry {
  write(value: Component, context: SerializeContext): VersionedDocument;
  read(frame: unknown, context: DeserializeContext): Component;
}

/** The component serializers registered on one scene serialization registry. */
export class ComponentTypeRegistry {
  private readonly _byClass = new Map<ComponentClass, ComponentSerializerEntry>();
  private readonly _byType = new Map<string, ComponentSerializerEntry>();

  /**
   * Registers a class and stable persisted type id. Both must be unique in this
   * registry. Components are constructed and linked before they attach.
   */
  public register<
    Value extends Component,
    Document extends object,
    const Version extends number = 1,
    const Min extends number = 1,
    const Chain extends readonly AnyMigration[] = readonly [],
  >(
    target: ComponentClass<Value>,
    definition: ComponentTypeDefinition<Value, Document, Version, Min, Chain> & CheckedHistory<NoInfer<Document>, Version, Min, Chain>,
  ): void {
    const { type, parser, version, minVersion, migrations, create, serializer } = definition;

    if (typeof type !== 'string' || type.length === 0) {
      throw new TypeError('A component definition needs a non-empty type id.');
    }

    if (this._byType.has(type) || this._byClass.has(target)) {
      throw new Error(`Component type "${type}" or its class is already registered.`);
    }

    const history = new DocumentHistory<Document>({
      id: type,
      parser,
      ...(version !== undefined && { version }),
      ...(minVersion !== undefined && { minVersion }),
      ...(migrations !== undefined && { migrations }),
    });
    const entry: ComponentSerializerEntry = {
      write: (value, context) => {
        if (!(value instanceof target)) {
          throw new TypeError(`Cannot serialize a value under component type "${type}".`);
        }

        return history.frame(serializer.serialize(value, context));
      },
      read: (frame, context) => {
        const value: unknown = create(history.read(frame), context);

        if (!(value instanceof target) || value.attached || value.destroyed) {
          throw new TypeError(`The factory for component type "${type}" must return a fresh detached component.`);
        }

        return value;
      },
    };

    this._byType.set(type, entry);
    this._byClass.set(target, entry);
  }

  /** @internal */
  public _forComponent(value: Component): ComponentSerializerEntry | undefined {
    return this._byClass.get(value.constructor as ComponentClass);
  }

  /** @internal */
  public _forType(type: string): ComponentSerializerEntry | undefined {
    return this._byType.get(type);
  }

  /** @internal */
  public _clear(): void {
    this._byType.clear();
    this._byClass.clear();
  }
}
