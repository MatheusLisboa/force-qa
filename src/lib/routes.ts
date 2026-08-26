export function dashboardPath(): string {
  return "/";
}

export function roomPath(roomId: string): string {
  return `/?room=${encodeURIComponent(roomId)}`;
}

export function adminBoardViewsPath(projectId?: string | null): string {
  return projectId
    ? `/admin/board-views?project=${encodeURIComponent(projectId)}`
    : "/admin/board-views";
}

export function adminUsersPath(): string {
  return "/admin/users";
}

export function pushPath(path: string): void {
  const url = path.startsWith("http") ? path : `${window.location.origin}${path}`;
  window.history.pushState({ path: url }, "", url);
}
