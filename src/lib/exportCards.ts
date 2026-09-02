import { BugStatus } from "../types";
import { attachmentsOf, parseAttachments } from "./attachments";
import { isImageEvidence } from "./mediaUrl";
import { cardUrl } from "./routes";

export const DEFAULT_EXPORT_LIMIT = 200;
export const MAX_EXPORT_LIMIT = 500;

const BUG_STATUSES: BugStatus[] = [
  "new",
  "under_analysis",
  "in_progress",
  "ready_for_qa",
  "validated",
  "reopened",
];

export interface ExportAttachment {
  id: string;
  kind: "file" | "link" | "prototype";
  contentType: "image" | "link";
  url: string;
  expiresAt: string | null;
}

export interface ExportCard {
  id: string;
  title: string;
  description: string;
  status: string;
  column: string;
  severity: string;
  priority: string;
  type: string;
  environment: string;
  tags: string[];
  ownerName: string | null;
  affectedUrl: string | null;
  buildVersion: string | null;
  duplicateOf: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  createdByName: string;
  url: string;
  attachments: ExportAttachment[];
}

export interface ExportRoom {
  id: string;
  name: string;
  type: string;
  status: string;
  project: string;
  cardsPath: string;
}

export interface ExportCardQuery {
  roomId: string;
  includeArchived: boolean;
  status: BugStatus | null;
  updatedSince: string | null;
  limit: number;
  offset: number;
}

export function readQueryParam(query: unknown, key: string): string {
  if (!query || typeof query !== "object") return "";
  const value = (query as Record<string, unknown>)[key];
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  if (value == null) return "";
  return String(value).trim();
}

export function parseExportCardQuery(query: unknown): ExportCardQuery {
  const roomId = readQueryParam(query, "roomId");
  if (!roomId) {
    throw Object.assign(new Error("Informe roomId."), { status: 400 });
  }

  const archivedRaw = readQueryParam(query, "archived").toLowerCase();
  const includeArchived = archivedRaw === "1" || archivedRaw === "true";

  const statusRaw = readQueryParam(query, "status") as BugStatus;
  const status = BUG_STATUSES.includes(statusRaw) ? statusRaw : null;

  const updatedSinceRaw = readQueryParam(query, "updatedSince");
  const updatedSince =
    updatedSinceRaw && !Number.isNaN(Date.parse(updatedSinceRaw)) ? updatedSinceRaw : null;

  const limitRaw = Number.parseInt(readQueryParam(query, "limit") || "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_EXPORT_LIMIT, Math.max(1, limitRaw))
    : DEFAULT_EXPORT_LIMIT;

  const offsetRaw = Number.parseInt(readQueryParam(query, "offset") || "", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  return { roomId, includeArchived, status, updatedSince, limit, offset };
}

export function collectExportAttachmentSources(row: Record<string, unknown>): ExportAttachment[] {
  const parsed = parseAttachments(row.attachments);
  const sources = attachmentsOf({
    attachments: parsed,
    evidenceUrl: typeof row.evidence_url === "string" ? row.evidence_url : undefined,
    prototypeUrl: typeof row.prototype_url === "string" ? row.prototype_url : undefined,
  });
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    contentType: isImageEvidence(source.url) ? "image" : "link",
    url: source.url,
    expiresAt: null,
  }));
}

export function mapExportRoom(row: Record<string, unknown>): ExportRoom {
  const id = String(row.id || "");
  return {
    id,
    name: String(row.name || id),
    type: String(row.room_type || "war_room"),
    status: String(row.status || "active"),
    project: String(row.project || ""),
    cardsPath: `/api/export/cards?roomId=${encodeURIComponent(id)}`,
  };
}

export function mapExportCard(
  row: Record<string, unknown>,
  appOrigin: string
): ExportCard {
  const id = String(row.id || "");
  const roomId = String(row.war_room_id || "");
  const status = String(row.status || "");
  const origin = appOrigin.replace(/\/$/, "");
  const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [];
  return {
    id,
    title: String(row.title || ""),
    description: String(row.description || ""),
    status,
    column: String(row.kanban_column_id || status),
    severity: String(row.criticism || ""),
    priority: String(row.priority || ""),
    type: String(row.type || ""),
    environment: String(row.environment || ""),
    tags,
    ownerName: row.owner_name ? String(row.owner_name) : null,
    affectedUrl: row.affected_url ? String(row.affected_url) : null,
    buildVersion: row.build_version ? String(row.build_version) : null,
    duplicateOf: row.duplicate_of_bug_id ? String(row.duplicate_of_bug_id) : null,
    archived: Boolean(row.archived),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdByName: String(row.created_by_name || ""),
    url: cardUrl(roomId, id, origin),
    attachments: collectExportAttachmentSources(row),
  };
}
