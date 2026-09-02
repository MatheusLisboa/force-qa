import { supabase } from "./supabase";
import { safeMediaUrl, storagePathFromUrl } from "./mediaUrl";

export {
  evidenceLabel,
  isHttpEvidence,
  isImageEvidence,
  safeMediaUrl,
  storagePathFromUrl,
} from "./mediaUrl";

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const SIGNED_URL_TTL_SEC = 60 * 60;

export async function signStorageUrl(url: string): Promise<string> {
  const path = storagePathFromUrl(url);
  if (!path) return safeMediaUrl(url) || url;
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}

export async function withSignedMedia<T extends {
  evidenceUrl?: string;
  prototypeUrl?: string;
  attachments?: { id: string; url: string; kind: "file" | "link" | "prototype" }[];
}>(item: T): Promise<T> {
  const evidenceUrl = item.evidenceUrl
    ? await signStorageUrl(item.evidenceUrl)
    : undefined;
  const prototypeUrl = item.prototypeUrl
    ? await signStorageUrl(item.prototypeUrl)
    : undefined;
  const attachments = item.attachments
    ? await Promise.all(
        item.attachments.map(async (attachment) => ({
          ...attachment,
          url: safeMediaUrl(await signStorageUrl(attachment.url)) || attachment.url,
        }))
      )
    : undefined;
  return {
    ...item,
    evidenceUrl: evidenceUrl ? safeMediaUrl(evidenceUrl) || evidenceUrl : undefined,
    prototypeUrl: prototypeUrl ? safeMediaUrl(prototypeUrl) || prototypeUrl : undefined,
    attachments,
  };
}

export async function uploadEvidenceFile(roomId: string, file: File): Promise<string> {
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Arquivos de evidência devem ter no máximo 2MB.");
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new Error("Envie PNG, JPEG, WebP ou GIF.");
  }

  const path = `${roomId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    throw new Error(
      error.message.includes("Bucket not found")
        ? "Bucket de evidências não configurado. Execute supabase/migration_access_and_security.sql."
        : `Falha no upload da evidência: ${error.message}`
    );
  }

  const { data } = supabase.storage.from("evidence").getPublicUrl(path);
  return data.publicUrl;
}

/** Re-uploads a storage object into the target room prefix (RLS is per-room). External https links are kept. */
export async function copyEvidenceToRoom(sourceUrl: string, targetRoomId: string): Promise<string> {
  const path = storagePathFromUrl(sourceUrl);
  if (!path) {
    const safe = safeMediaUrl(sourceUrl);
    if (!safe) throw new Error("Anexo inválido para copiar.");
    return safe;
  }
  const signed = await signStorageUrl(sourceUrl);
  const response = await fetch(signed);
  if (!response.ok) throw new Error("Não foi possível copiar o anexo.");
  const blob = await response.blob();
  const ext = (path.split(".").pop() || "png").toLowerCase();
  const mimeByExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
  };
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : mimeByExt[ext] || "image/png";
  const file = new File([blob], `copy.${ext}`, { type });
  return uploadEvidenceFile(targetRoomId, file);
}
