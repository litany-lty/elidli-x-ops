/** The normal writer target. NEXT-2.3 flips only this constant after phase-A evidence passes. */
export const CURRENT_STATE_VERSION = 5;

/** Published reliable containers; future versions are never accepted implicitly. */
export const isReliableState = value => [3, 4, 5].includes(typeof value === 'object' ? value?.schema_version : value);

export const hasKnowledgeState = value => [4, 5].includes(typeof value === 'object' ? value?.schema_version : value);
