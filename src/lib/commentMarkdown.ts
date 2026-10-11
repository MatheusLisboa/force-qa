import { safeMediaUrl, storagePathFromUrl } from "./mediaUrl";

/**
 * Markdown mínimo e seguro para comentários. Gera uma árvore (nunca HTML), então não há
 * como injetar script: o React escapa tudo. Suporta **negrito**, *itálico*, `código`,
 * blocos ```, listas "- ", links https, imagens do Storage e destaque de @menções.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "image"; src: string; alt: string }
  | { t: "mention"; v: string };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "code"; v: string };

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentionRegex(names: string[]): RegExp | null {
  const aliases = new Set<string>();
  for (const name of names) {
    const full = name.trim();
    if (full.length < 2) continue;
    aliases.add(full);
    const first = full.split(/\s+/)[0];
    if (first.length >= 2) aliases.add(first);
  }
  if (aliases.size === 0) return null;
  const alt = [...aliases].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  return new RegExp(`@(?:${alt})(?![\\p{L}\\p{N}])`, "giu");
}

/** Imagens só do nosso Storage (evita pixel de rastreio de terceiros); o resto vira link. */
export function commentImageSrc(url: string): string | undefined {
  const safe = safeMediaUrl(url);
  return safe && storagePathFromUrl(safe) ? safe : undefined;
}

const TOKEN =
  /!\[([^\]]*)\]\((\S+?)\)|\[([^\]]+)\]\((\S+?)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])|`([^`\n]+)`|\*\*(.+?)\*\*|(?<![*\w])\*(?![\s*])(.+?)(?<![\s*])\*(?![*\w])/gu;

export function parseInline(text: string, mentionNames: string[] = [], depth = 0): Inline[] {
  const out: Inline[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };

  const withMentions = (chunk: string) => {
    const re = mentionRegex(mentionNames);
    if (!re) return push(chunk);
    let cursor = 0;
    for (const match of chunk.matchAll(re)) {
      push(chunk.slice(cursor, match.index));
      out.push({ t: "mention", v: match[0] });
      cursor = (match.index ?? 0) + match[0].length;
    }
    push(chunk.slice(cursor));
  };

  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    withMentions(text.slice(cursor, start));
    cursor = start + match[0].length;
    const [raw, imgAlt, imgUrl, linkLabel, linkUrl, bareUrl, code, bold, italic] = match;

    if (imgUrl !== undefined) {
      const src = commentImageSrc(imgUrl);
      const href = safeMediaUrl(imgUrl);
      if (src) out.push({ t: "image", src, alt: imgAlt || "imagem" });
      else if (href) out.push({ t: "link", href, c: [{ t: "text", v: imgAlt || href }] });
      else push(raw);
    } else if (linkUrl !== undefined) {
      const href = safeMediaUrl(linkUrl);
      if (href) out.push({ t: "link", href, c: [{ t: "text", v: linkLabel }] });
      else push(raw);
    } else if (bareUrl !== undefined) {
      const href = safeMediaUrl(bareUrl);
      if (href) out.push({ t: "link", href, c: [{ t: "text", v: bareUrl }] });
      else push(raw);
    } else if (code !== undefined) {
      out.push({ t: "code", v: code });
    } else if (bold !== undefined) {
      out.push({ t: "bold", c: depth < 2 ? parseInline(bold, mentionNames, depth + 1) : [{ t: "text", v: bold }] });
    } else if (italic !== undefined) {
      out.push({ t: "italic", c: depth < 2 ? parseInline(italic, mentionNames, depth + 1) : [{ t: "text", v: italic }] });
    }
  }
  withMentions(text.slice(cursor));
  return out;
}

export function parseComment(text: string, mentionNames: string[] = []): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ t: "p", c: parseInline(paragraph.join("\n"), mentionNames) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: "ul", items: list });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      flushParagraph();
      flushList();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      flushParagraph();
      (list ??= []).push(parseInline(item[1], mentionNames));
      continue;
    }
    flushList();
    if (line.trim() === "") flushParagraph();
    else paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
