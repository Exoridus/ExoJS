/**
 * Writes the current document body for a runtime value.
 *
 * The document frame supplies its own type and version. Return only the
 * persisted fields and leave runtime state out of the document.
 */
export interface Serializer<Value, Document extends object> {
  readonly serialize: (value: Value) => Document;
}
