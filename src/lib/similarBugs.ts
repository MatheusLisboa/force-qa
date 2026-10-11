import { normalizeText } from "./search";

const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "para", "por", "com", "sem", "que", "ao", "se", "ou", "nao", "ser", "esta", "esse", "essa", "ao", "pra",
]);

function tokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

/** Similaridade 0..1 entre dois títulos: o maior entre Jaccard e a cobertura do menor. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size < 2 || tb.size < 2) return 0;
  let common = 0;
  for (const word of ta) if (tb.has(word)) common++;
  if (common === 0) return 0;
  const jaccard = common / (ta.size + tb.size - common);
  const coverage = common / Math.min(ta.size, tb.size);
  return Math.max(jaccard, coverage * 0.9);
}

export function findSimilarBugs<T extends { id: string; title: string }>(
  title: string,
  bugs: T[],
  options: { limit?: number; threshold?: number } = {}
): Array<T & { similarity: number }> {
  const { limit = 3, threshold = 0.6 } = options;
  return bugs
    .map((bug) => ({ ...bug, similarity: titleSimilarity(title, bug.title) }))
    .filter((bug) => bug.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
