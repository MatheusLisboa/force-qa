import { getSupabaseAdmin } from "./auth";
import { appRedirectTo } from "./appUrl";
import { extractExportToken, hashExportToken, hashesMatch } from "../../src/lib/exportToken";
import { throwIfExportTokenSqlMissing } from "./exportTokenStore";
import {
  mapExportCard,
  mapExportRoom,
  parseExportCardQuery,
  type ExportAttachment,
  type ExportCard,
  type ExportRoom,
} from "../../src/lib/exportCards";
import { storagePathFromUrl } from "../../src/lib/mediaUrl";
import type { SupabaseClient } from "@supabase/supabase-js";

/** GitLab precisa baixar o print no mesmo job; 24h cobre um sync noturno. */
export const EXPORT_SIGNED_TTL_SEC = 24 * 60 * 60;

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
  if (error) throwIfExportTokenSqlMissing(error);
  const storedHash = String(data?.export_token_hash || "");
  if (!data?.organization_id || !hashesMatch(presentedHash, storedHash)) {
    throw Object.assign(new Error("Token inválido."), { status: 401 });
  }
  return { organizationId: data.organization_id as string };
}

const ROOM_SELECT = "id, name, room_type, status, project, organization_id";
const CARD_SELECT =
  "id, war_room_id, title, description, criticism, status, kanban_column_id, owner_name, environment, affected_url, build_version, tags, priority, type, duplicate_of_bug_id, created_at, updated_at, created_by_name, resolved_at, archived, attachments, evidence_url, prototype_url";

async function signExportAttachments(
  admin: SupabaseClient,
  attachments: ExportAttachment[]
): Promise<ExportAttachment[]> {
  if (attachments.length === 0) return attachments;

  const uniquePaths = [
    ...new Set(
      attachments
        .map((item) => storagePathFromUrl(item.url))
        .filter((path): path is string => Boolean(path))
    ),
  ];
  const signedByPath = new Map<string, { url: string; expiresAt: string }>();
  if (uniquePaths.length > 0) {
    const { data, error } = await admin.storage
      .from("evidence")
      .createSignedUrls(uniquePaths, EXPORT_SIGNED_TTL_SEC);
    if (error) {
      console.error("export createSignedUrls:", error);
    }
    const expiresAt = new Date(Date.now() + EXPORT_SIGNED_TTL_SEC * 1000).toISOString();
    for (const item of data || []) {
      const path = String(item.path || "");
      const signedUrl = String(item.signedUrl || (item as { signedURL?: string }).signedURL || "");
      if (path && signedUrl && !item.error) {
        signedByPath.set(path, { url: signedUrl, expiresAt });
      }
    }
  }

  return attachments.map((attachment) => {
    const path = storagePathFromUrl(attachment.url);
    const signed = path ? signedByPath.get(path) : undefined;
    if (!signed) return attachment;
    return { ...attachment, url: signed.url, expiresAt: signed.expiresAt };
  });
}

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
  attachmentExpiresInSeconds: number;
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
  const cards = await Promise.all(
    rows.slice(0, parsed.limit).map(async (row) => {
      const card = mapExportCard(row, origin);
      return {
        ...card,
        attachments: await signExportAttachments(admin, card.attachments),
      };
    })
  );

  return {
    room: mapExportRoom(room as Record<string, unknown>),
    cards,
    attachmentExpiresInSeconds: EXPORT_SIGNED_TTL_SEC,
    page: {
      limit: parsed.limit,
      offset: parsed.offset,
      count: cards.length,
      hasMore,
    },
  };
}
