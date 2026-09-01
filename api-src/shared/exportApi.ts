import { getSupabaseAdmin } from "./auth";
import { appRedirectTo } from "./appUrl";
import {
  extractExportToken,
  generateExportToken,
  hashExportToken,
  hashesMatch,
} from "../../src/lib/exportToken";
import {
  mapExportCard,
  mapExportRoom,
  parseExportCardQuery,
  type ExportCard,
  type ExportRoom,
} from "../../src/lib/exportCards";

const EXPORT_WINDOW_MS = 60 * 1000;
const EXPORT_MAX_HITS = 60;
const exportHits = new Map<string, number[]>();

export function applyExportCors(res: { setHeader: (name: string, value: string) => void }): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, X-Api-Key, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "");
  return value || "";
}

function assertExportRateLimit(key: string): void {
  const now = Date.now();
  const recent = (exportHits.get(key) || []).filter((t) => now - t < EXPORT_WINDOW_MS);
  if (recent.length >= EXPORT_MAX_HITS) {
    throw Object.assign(new Error("Muitas extrações. Tente de novo em um minuto."), { status: 429 });
  }
  recent.push(now);
  exportHits.set(key, recent);
}

export async function requireExportOrganization(headers: {
  authorization?: string | string[];
  "x-api-key"?: string | string[];
}): Promise<{ organizationId: string }> {
  const token = extractExportToken(headerValue(headers.authorization), headerValue(headers["x-api-key"]));
  const presentedHash = hashExportToken(token);
  assertExportRateLimit(presentedHash);

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organization_integrations")
    .select("organization_id, export_token_hash")
    .eq("export_token_hash", presentedHash)
    .maybeSingle();
  if (error) throw error;
  const storedHash = String(data?.export_token_hash || "");
  if (!data?.organization_id || !hashesMatch(presentedHash, storedHash)) {
    throw Object.assign(new Error("Token inválido."), { status: 401 });
  }
  return { organizationId: data.organization_id as string };
}

export async function getExportTokenMeta(organizationId: string): Promise<{
  configured: boolean;
  prefix: string | null;
  createdAt: string | null;
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organization_integrations")
    .select("export_token_prefix, export_token_created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  const prefix = data?.export_token_prefix ? String(data.export_token_prefix) : null;
  return {
    configured: Boolean(prefix),
    prefix,
    createdAt: data?.export_token_created_at ? String(data.export_token_created_at) : null,
  };
}

export async function rotateExportToken(
  organizationId: string
): Promise<{ token: string; prefix: string }> {
  const generated = generateExportToken();
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = {
    export_token_hash: generated.hash,
    export_token_prefix: generated.prefix,
    export_token_created_at: now,
    updated_at: now,
  };

  const { data: existing, error: lookupError } = await admin
    .from("organization_integrations")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await admin
      .from("organization_integrations")
      .update(payload)
      .eq("organization_id", organizationId);
    if (error) throw error;
  } else {
    const { error } = await admin.from("organization_integrations").insert({
      organization_id: organizationId,
      ...payload,
    });
    if (error) throw error;
  }

  return { token: generated.token, prefix: generated.prefix };
}

export async function revokeExportToken(organizationId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("organization_integrations")
    .update({
      export_token_hash: null,
      export_token_prefix: null,
      export_token_created_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error) throw error;
}

const ROOM_SELECT = "id, name, room_type, status, project, organization_id";
const CARD_SELECT =
  "id, war_room_id, title, description, criticism, status, kanban_column_id, owner_name, environment, affected_url, build_version, tags, priority, type, duplicate_of_bug_id, created_at, updated_at, created_by_name, resolved_at, archived";

export async function listExportRooms(organizationId: string): Promise<{
  organizationId: string;
  rooms: ExportRoom[];
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("war_rooms")
    .select(ROOM_SELECT)
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error) throw error;
  return {
    organizationId,
    rooms: (data || []).map((row) => mapExportRoom(row as Record<string, unknown>)),
  };
}

export async function listExportCards(
  organizationId: string,
  query: unknown
): Promise<{
  room: ExportRoom;
  cards: ExportCard[];
  page: { limit: number; offset: number; count: number; hasMore: boolean };
}> {
  const parsed = parseExportCardQuery(query);
  const admin = getSupabaseAdmin();
  const { data: room, error: roomError } = await admin
    .from("war_rooms")
    .select(ROOM_SELECT)
    .eq("id", parsed.roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room || String(room.organization_id) !== organizationId) {
    throw Object.assign(new Error("Sala não encontrada."), { status: 404 });
  }

  const take = parsed.limit + 1;
  let request = admin
    .from("bugs")
    .select(CARD_SELECT)
    .eq("war_room_id", parsed.roomId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(parsed.offset, parsed.offset + take - 1);

  if (!parsed.includeArchived) request = request.eq("archived", false);
  if (parsed.status) request = request.eq("status", parsed.status);
  if (parsed.updatedSince) request = request.gte("updated_at", parsed.updatedSince);

  const { data, error } = await request;
  if (error) throw error;

  const rows = (data || []) as Record<string, unknown>[];
  const hasMore = rows.length > parsed.limit;
  const origin = appRedirectTo();
  const cards = rows.slice(0, parsed.limit).map((row) => mapExportCard(row, origin));

  return {
    room: mapExportRoom(room as Record<string, unknown>),
    cards,
    page: {
      limit: parsed.limit,
      offset: parsed.offset,
      count: cards.length,
      hasMore,
    },
  };
}
