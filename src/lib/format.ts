export function shortId(id: string, chars = 8): string {
  if (!id) return "";
  return id.length <= chars ? id : id.slice(0, chars);
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
