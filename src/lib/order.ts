export function reorderIndex(ids: string[], dragId: string, beforeId: string | null): number | null {
  const without = ids.filter((id) => id !== dragId);
  const index = beforeId === null ? without.length : without.indexOf(beforeId);
  if (index < 0) return null;
  const next = without.slice();
  next.splice(index, 0, dragId);
  if (next.length === ids.length && next.every((id, position) => id === ids[position])) return null;
  return index;
}

export function adjacentIndex(ids: string[], id: string, offset: -1 | 1): number | null {
  const index = ids.indexOf(id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  return target;
}
