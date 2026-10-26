/** Published reliable containers; future versions are never accepted implicitly. */
export const isReliableState = value => [3, 4].includes(typeof value === 'object' ? value?.schema_version : value);
