import { supabase } from "./supabase";

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** Returns true when evidence should render as an image (storage, http image, or legacy base64). */
export function isImageEvidence(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  if (url.includes("/storage/v1/object/public/evidence/")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(url);
}

export function isHttpEvidence(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function evidenceLabel(url: string): "image" | "link" {
  if (isImageEvidence(url)) return "image";
  if (isHttpEvidence(url)) return "link";
  return "link";
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
