/**
 * Puts `next` where `current` was (or removes `current` when `next` is undefined), keeping every
 * other entry and its order. A new entry is appended. Returns undefined rather than an empty list,
 * because FHIR does not allow empty arrays.
 *
 * Mappers use it to change only the entry a form edits (one phone, one coding, …) in a list.
 */
export function replaceEntry<T>(
  list: T[] | undefined,
  current: T | undefined,
  next: T | undefined,
): T[] | undefined {
  const entries = list ?? [];
  const result = current
    ? entries.flatMap((entry) => (entry === current ? (next ? [next] : []) : [entry]))
    : next
      ? [...entries, next]
      : entries;
  return result.length ? result : undefined;
}
