import { normalizeText } from "./search";

export interface MentionQuery {
  /** Posição do "@" no texto. */
  start: number;
  query: string;
}

/** Detecta se o cursor está dentro de uma menção em andamento ("@mar|"). */
export function getMentionQuery(text: string, cursor: number): MentionQuery | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  // "@" precisa abrir a palavra (início ou depois de espaço/quebra), senão é e-mail.
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /[\n@]/.test(query)) return null;
  // Nomes compostos permitem um espaço; dois espaços seguidos encerram a menção.
  if (/\s{2,}/.test(query) || /^\s/.test(query)) return null;
  return { start: at, query };
}

export function filterMentionCandidates<T extends { name: string }>(users: T[], query: string, limit = 6): T[] {
  const q = normalizeText(query);
  const scored = users
    .map((user) => {
      const name = normalizeText(user.name);
      const words = name.split(/\s+/);
      const score = !q ? 1 : name.startsWith(q) ? 3 : words.some((w) => w.startsWith(q)) ? 2 : name.includes(q) ? 1 : 0;
      return { user, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name, "pt-BR"));
  return scored.slice(0, limit).map((entry) => entry.user);
}

/** Troca "@mar" pelo nome completo e devolve o novo texto e a posição do cursor. */
export function applyMention(text: string, mention: MentionQuery, cursor: number, name: string) {
  const insert = `@${name} `;
  const next = text.slice(0, mention.start) + insert + text.slice(cursor);
  return { text: next, cursor: mention.start + insert.length };
}
