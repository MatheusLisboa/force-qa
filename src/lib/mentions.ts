export type MentionUser = { id: string; name: string };

function aliasesFor(name: string): string[] {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return [];
  const first = trimmed.split(/\s+/)[0] || "";
  return first && first !== trimmed ? [trimmed, first] : [trimmed];
}

/** Longest @nome first so "@Maria Silva" wins over "@Maria". */
export function findMentionedUsers(text: string, users: MentionUser[]): MentionUser[] {
  const body = text.toLowerCase();
  const ranked = [...users]
    .map((user) => ({ user, aliases: aliasesFor(user.name) }))
    .sort((a, b) => Math.max(0, ...(b.aliases.map((n) => n.length))) - Math.max(0, ...(a.aliases.map((n) => n.length))));

  const found: MentionUser[] = [];
  const used = new Set<string>();
  for (const { user, aliases } of ranked) {
    if (used.has(user.id)) continue;
    const hit = aliases.some((alias) => alias.length >= 2 && body.includes(`@${alias}`));
    if (!hit) continue;
    used.add(user.id);
    found.push(user);
  }
  return found;
}
