import { Bug, BugAttachment, AttachmentKind } from "../types";
import { safeMediaUrl } from "./mediaUrl";

export function parseAttachments(raw: unknown): BugAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const url = safeMediaUrl(String(row.url || ""));
      if (!url) return null;
      const kind: AttachmentKind = row.kind === "link" || row.kind === "prototype" ? row.kind : "file";
      return { id: String(row.id || `att-${index}`), url, kind };
    })
    .filter((item): item is BugAttachment => Boolean(item));
}

export function attachmentsOf(bug: Pick<Bug, "attachments" | "evidenceUrl" | "prototypeUrl">): BugAttachment[] {
  if (bug.attachments && bug.attachments.length > 0) return bug.attachments;
  const legacy: BugAttachment[] = [];
  const evidence = safeMediaUrl(bug.evidenceUrl);
  const prototype = safeMediaUrl(bug.prototypeUrl);
  if (evidence) legacy.push({ id: "legacy-evidence", url: evidence, kind: "file" });
  if (prototype) legacy.push({ id: "legacy-prototype", url: prototype, kind: "prototype" });
  return legacy;
}

export function primaryAttachmentUrl(bug: Pick<Bug, "attachments" | "evidenceUrl" | "prototypeUrl">): string | undefined {
  return attachmentsOf(bug)[0]?.url || safeMediaUrl(bug.evidenceUrl);
}

export function makeAttachment(url: string, kind: AttachmentKind = "file"): BugAttachment {
  const safe = safeMediaUrl(url);
  if (!safe) throw new Error("O anexo precisa ser um link https://");
  return { id: crypto.randomUUID(), url: safe, kind };
}
