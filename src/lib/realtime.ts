export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export function applyRealtimeChange<T>(
  items: T[],
  event: RealtimeEvent,
  record: T,
  getId: (item: T) => string
): T[] {
  const id = getId(record);
  if (!id) return items;

  if (event === "INSERT") {
    if (items.some((item) => getId(item) === id)) {
      return items.map((item) => (getId(item) === id ? record : item));
    }
    return [record, ...items];
  }

  if (event === "UPDATE") {
    const exists = items.some((item) => getId(item) === id);
    if (!exists) return [record, ...items];
    return items.map((item) => (getId(item) === id ? record : item));
  }

  return items.filter((item) => getId(item) !== id);
}

export function isIncompleteRow(row: Record<string, unknown>, requiredKeys: string[]): boolean {
  return requiredKeys.some((key) => row[key] === undefined);
}
