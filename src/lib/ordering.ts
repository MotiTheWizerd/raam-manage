/**
 * Sort `list` by a saved `order` of keys (manager-chosen, via edit mode).
 * Items whose key is absent from `order` keep their default relative position
 * at the END — so a newly-added item is never dropped by a stale saved order.
 * Stable.
 */
export function applyOrder<T>(
  list: T[],
  order: string[],
  getKey: (item: T) => string
): T[] {
  if (order.length === 0) return list;
  const rank = new Map(order.map((key, i) => [key, i]));
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ra = rank.get(getKey(a.item)) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(getKey(b.item)) ?? Number.MAX_SAFE_INTEGER;
      return ra === rb ? a.i - b.i : ra - rb;
    })
    .map((x) => x.item);
}
