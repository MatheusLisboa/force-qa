import { looksLikeGuestToken } from "./guestInvite";

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

export function roomInviteUrl(
  roomId: string,
  origin = window.location.origin,
  guestToken?: string | null
): string {
  const params = new URLSearchParams();
  params.set("room", roomId);
  if (guestToken) params.set("guest", guestToken);
  return `${origin}/?${params.toString()}`;
}

function decodeParam(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/** Accepts a share link (`/?room=`), a full URL, or a raw room id/name. */
export function parseRoomInvite(input: string): string {
  return parseGuestInvite(input).roomId;
}

export function parseGuestInvite(input: string): { roomId: string; token: string } {
  const trimmed = input.trim();
  if (!trimmed) return { roomId: "", token: "" };

  const fromSearch = (params: URLSearchParams): { roomId: string; token: string } => ({
    roomId: (params.get("room") || "").trim(),
    token: (params.get("guest") || params.get("g") || "").trim(),
  });

  try {
    const url = new URL(trimmed);
    const parsed = fromSearch(url.searchParams);
    if (parsed.roomId || parsed.token) return parsed;
  } catch {
    /* relative or raw */
  }

  const query = trimmed.startsWith("/") || trimmed.includes("?") ? trimmed : "";
  if (query.includes("?")) {
    const qs = query.slice(query.indexOf("?") + 1);
    const parsed = fromSearch(new URLSearchParams(qs));
    if (parsed.roomId || parsed.token) {
      parsed.roomId = decodeParam(parsed.roomId);
      parsed.token = decodeParam(parsed.token);
      return parsed;
    }
  }

  const roomMatch = trimmed.match(/[?&]room=([^&]+)/i);
  const guestMatch = trimmed.match(/[?&](?:guest|g)=([^&]+)/i);
  if (roomMatch || guestMatch) {
    return { roomId: decodeParam(roomMatch?.[1]), token: decodeParam(guestMatch?.[1]) };
  }

  if (looksLikeGuestToken(trimmed)) return { roomId: "", token: trimmed };
  return { roomId: trimmed, token: "" };
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

export function adminPermissionsPath(): string {
  return "/admin/permissions";
}

export type AdminPagePath =
  | "/admin/board-views"
  | "/admin/users"
  | "/admin/integrations"
  | "/admin/organizations"
  | "/admin/permissions";

export function pushPath(path: string): void {
  const url = path.startsWith("http") ? path : `${window.location.origin}${path}`;
  window.history.pushState({ path: url }, "", url);
}
