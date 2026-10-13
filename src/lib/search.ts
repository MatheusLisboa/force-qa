/** Remove acentos e caixa para comparar texto em português. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Pontua um texto contra a consulta. 0 = sem match.
 * Prefixo da frase > prefixo de palavra > substring > letras em sequência.
 */
export function matchScore(text: string, query: string): number {
  const q = normalizeText(query);
  if (!q) return 1;
  const t = normalizeText(text);
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s\-_/·.]+/).some((word) => word.startsWith(q))) return 60;
  if (t.includes(q)) return 40;

  let pos = 0;
  for (const ch of q) {
    pos = t.indexOf(ch, pos);
    if (pos === -1) return 0;
    pos += 1;
  }
  return 10;
}

/**
 * Pontua um item com nome principal e palavras-chave extras (área, projeto…). A busca aproximada
 * (letras em sequência) vale só para o nome: nas palavras-chave exige ao menos um trecho contínuo,
 * senão textos longos casariam com qualquer consulta curta.
 */
export function matchScoreWithKeywords(label: string, keywords: string, query: string): number {
  const fromLabel = matchScore(label, query);
  const fromKeywords = matchScore(keywords, query);
  return Math.max(fromLabel, fromKeywords >= 40 ? fromKeywords - 10 : 0);
}

/** Filtra e ordena por relevância; mantém a ordem original em empates. */
export function rankBy<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (!normalizeText(query)) return items;
  return items
    .map((item, index) => ({ item, index, score: matchScore(getText(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
