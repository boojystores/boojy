/**
 * Client-safe pure sorting helper for categories.
 * Contains no Node.js filesystem dependencies.
 */
export function sortCategoriesByOrder<T extends { id: string; name: string }>(
  categories: T[],
  order: string[],
): T[] {
  if (!order || order.length === 0) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }

  const orderMap = new Map<string, number>();
  order.forEach((id, idx) => {
    orderMap.set(id, idx);
  });

  return [...categories].sort((a, b) => {
    const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
    const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    return a.name.localeCompare(b.name);
  });
}
