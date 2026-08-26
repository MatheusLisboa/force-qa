export function diffRoomAccess(
  currentIds: string[],
  desiredIds: string[]
): { add: string[]; remove: string[] } {
  const current = new Set(currentIds);
  const desired = new Set(desiredIds);
  return {
    add: desiredIds.filter((id) => !current.has(id)),
    remove: currentIds.filter((id) => !desired.has(id)),
  };
}
