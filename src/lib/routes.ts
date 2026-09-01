export function dashboardPath(): string {
  return "/";
}

export function inboxPath(): string {
  return "/inbox";
}

export function roomPath(roomId: string, pulse?: string | null, cardId?: string | null): string {
  const params = new URLSearchParams();
  params.set("room", roomId);
  if (pulse && pulse !== "all") params.set("pulse", pulse);
  if (cardId) params.set("card", cardId);
  return `/?${params.toString()}`;
}

export function cardUrl(roomId: string, cardId: string, origin = window.location.origin): string {
  return `${origin}${roomPath(roomId, null, cardId)}`;
}

export function roomInviteUrl(roomId: string, origin = window.location.origin): string {
  return `${origin}${roomPath(roomId)}`;
}

/** Accepts a share link (`/?room=`), a full URL, or a raw room id/name. */
export function parseRoomInvite(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const room = url.searchParams.get("room");
    if (room) return room.trim();
  } catch {
    /* not an absolute URL */
  }
  const queryMatch = trimmed.match(/[?&]room=([^&]+)/i);
  if (queryMatch) {
    try {
      return decodeURIComponent(queryMatch[1]).trim();
    } catch {
      return queryMatch[1].trim();
    }
  }
  return trimmed;
}

export function adminBoardViewsPath(projectId?: string | null): string {
  return projectId
    ? `/admin/board-views?project=${encodeURIComponent(projectId)}`
    : "/admin/board-views";
}

export function adminUsersPath(): string {
  return "/admin/users";
}

export function adminIntegrationsPath(): string {
  return "/admin/integrations";
}

export function adminOrganizationsPath(): string {
  return "/admin/organizations";
}

export type AdminPagePath =
  | "/admin/board-views"
  | "/admin/users"
  | "/admin/integrations"
  | "/admin/organizations";

export function pushPath(path: string): void {
  const url = path.startsWith("http") ? path : `${window.location.origin}${path}`;
  window.history.pushState({ path: url }, "", url);
}
