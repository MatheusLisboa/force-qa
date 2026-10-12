import React, { useEffect, useMemo, useState } from "react";
import { parseComment, type Inline } from "../lib/commentMarkdown";
import { signStorageUrl } from "../lib/evidence";

/** Imagem do Storage com URL assinada na hora (o bucket é privado). */
const SignedImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signStorageUrl(src).then((signed) => alive && setUrl(signed));
    return () => {
      alive = false;
    };
  }, [src]);
  if (!url) return <span className="fq-skeleton block h-24 w-40" aria-label="Carregando imagem" role="img" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="max-h-56 max-w-full rounded-md border border-white/[0.08] object-contain"
      />
    </a>
  );
};

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.t) {
      case "text":
        return <React.Fragment key={i}>{node.v}</React.Fragment>;
      case "bold":
        return <strong key={i} className="font-semibold text-neutral-100">{renderInline(node.c)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(node.c)}</em>;
      case "code":
        return <code key={i} className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[11px] text-neutral-200">{node.v}</code>;
      case "mention":
        return <span key={i} className="rounded bg-teal-400/10 px-1 font-medium text-teal-400">{node.v}</span>;
      case "link":
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-400 underline underline-offset-2 break-all">
            {renderInline(node.c)}
          </a>
        );
      case "image":
        return <SignedImage key={i} src={node.src} alt={node.alt} />;
    }
  });
}

export const CommentBody: React.FC<{ text: string; mentionNames?: string[] }> = ({ text, mentionNames = [] }) => {
  const blocks = useMemo(() => parseComment(text, mentionNames), [text, mentionNames]);
  return (
    <div className="space-y-1.5 pl-1 text-xs leading-relaxed text-neutral-400">
      {blocks.map((block, i) => {
        if (block.t === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-md border border-white/[0.06] bg-[color:var(--color-fq-elevated)] p-2 font-mono text-[11px] text-neutral-300">
              {block.v}
            </pre>
          );
        }
        if (block.t === "ul") {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(block.c)}
          </p>
        );
      })}
    </div>
  );
};
