import { z } from 'astro/zod';

import { API_SUBSYSTEM_ORDER } from './api-reference';

// Single source of truth for the shape of a generated API symbol. Both the
// content collection (site/src/content.config.ts) and the generator
// (site/scripts/build-api.ts) import this schema, so the emitted JSON, the
// validation the generator runs against its own output, and the type the
// pages consume via `entry.data` can never drift apart. There is no MDX body
// and no regex re-parse: the generator emits this structure directly and the
// pages render it verbatim.

/** A single parameter of a constructor/method signature. */
export const apiParamSchema = z.object({
    name: z.string(),
    type: z.string(),
    optional: z.boolean(),
});

/**
 * One documented member: a constructor/method (with structured params +
 * returnType) or a property/event/enum member (params empty, returnType null).
 * `signature` is the fully rendered, human-readable form the page shows today;
 * the structured fields exist so later phases can highlight/link each token.
 */
export const apiMemberSchema = z.object({
    name: z.string(),
    signature: z.string(),
    params: z.array(apiParamSchema),
    returnType: z.string().nullable(),
    description: z.string(),
});

/** A rendered link (source link on the Source section). */
export const apiLinkSchema = z.object({
    label: z.string(),
    href: z.string(),
});

/**
 * A page section. Heterogeneous on purpose — mirrors what the API page renders
 * today: the Import section carries `importLine` + `paragraphs` (the class
 * description), member sections carry `members`, the Source section carries
 * `sourceLink`. Fields not relevant to a section are empty/null.
 */
export const apiSectionSchema = z.object({
    id: z.string(),
    title: z.string(),
    members: z.array(apiMemberSchema),
    paragraphs: z.array(z.string()),
    importLine: z.string().nullable(),
    sourceLink: apiLinkSchema.nullable(),
});

/** Per-section-kind member tallies used by the index/all pages and stat card. */
export const apiCountsSchema = z.object({
    constructors: z.number().int().min(0),
    methods: z.number().int().min(0),
    properties: z.number().int().min(0),
    events: z.number().int().min(0),
});

/** A complete API symbol page as typed, structured data. */
export const apiSymbolSchema = z.object({
    title: z.string(),
    description: z.string(),
    symbol: z.string(),
    kind: z.enum(['class', 'enum', 'interface', 'type']),
    subsystem: z.enum(API_SUBSYSTEM_ORDER),
    importPath: z.string(),
    tier: z.enum(['stable', 'advanced']),
    memberCount: z.number().int().min(0),
    counts: apiCountsSchema,
    sections: z.array(apiSectionSchema),
    sourcePath: z.string().optional(),
    sourceUrl: z.string().optional(),
});

export type ApiParam = z.infer<typeof apiParamSchema>;
export type ApiMember = z.infer<typeof apiMemberSchema>;
export type ApiSection = z.infer<typeof apiSectionSchema>;
export type ApiCounts = z.infer<typeof apiCountsSchema>;
export type ApiSymbolData = z.infer<typeof apiSymbolSchema>;
