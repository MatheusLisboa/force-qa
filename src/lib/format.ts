export function shortId(id: string, chars = 8): string {
  if (!id) return "";
  return id.length <= chars ? id : id.slice(0, chars);
}

export function formatRelativeTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now - date.getTime();
  if (diffMs < 0) return "agora";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return date.toLocaleDateString("pt-BR");
}

export function formatRoleLabel(role?: string | null): string {
  const map: Record<string, string> = {
    admin: "Admin",
    qa: "QA",
    developer: "Dev",
    dba: "DBA",
    devops: "DevOps",
    scrum_master: "Scrum",
    viewer: "Viewer",
  };
  return map[role || ""] || role || "";
}
