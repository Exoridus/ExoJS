/**
 * Validates untrusted document data of the current version.
 *
 * `parse` returns the data as the current document type, or throws. It runs
 * after all migrations, so every document is checked in one place whatever its
 * age. It validates data only: it builds no runtime objects and loads nothing.
 *
 * Check each field instead of casting; a TypeScript cast says nothing about
 * what a file contains.
 *
 * @typeParam Document - the document body at the current version.
 * @advanced
 */
export interface DocumentParser<Document> {
  parse(input: unknown): Document;
}
