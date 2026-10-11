import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ImagePlus, Send } from "lucide-react";
import { uploadEvidenceFile } from "../lib/evidence";
import { applyMention, filterMentionCandidates, getMentionQuery } from "../lib/mentionAutocomplete";
import { useToast } from "../context/ToastContext";
import { logger } from "../lib/logger";

interface CommentComposerProps {
  roomId: string;
  users: Array<{ id: string; name: string }>;
  onSubmit: (text: string) => Promise<void>;
}

const imageFrom = (items: DataTransferItemList | FileList | null | undefined): File | null => {
  if (!items) return null;
  for (const item of Array.from(items as ArrayLike<DataTransferItem | File>)) {
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (file && file.type.startsWith("image/")) return file;
  }
  return null;
};

/** Caixa de comentário: cola/arrasta print, autocompleta @menções, Ctrl+Enter envia. */
export const CommentComposer: React.FC<CommentComposerProps> = ({ roomId, users, onSubmit }) => {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const mention = useMemo(() => getMentionQuery(text, cursor), [text, cursor]);
  const candidates = useMemo(
    () => (mention && mention.start !== dismissedAt ? filterMentionCandidates(users, mention.query) : []),
    [mention, users, dismissedAt]
  );
  const open = candidates.length > 0;

  useEffect(() => setActive(0), [mention?.query]);

  const insertAtCursor = (snippet: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    setText(next);
    const pos = start + snippet.length;
    setCursor(pos);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const attachImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadEvidenceFile(roomId, file);
      insertAtCursor(`\n![print](${url})\n`);
    } catch (error) {
      logger.error(error);
      toast(error instanceof Error ? error.message : "Falha ao enviar a imagem.", { kind: "error" });
    } finally {
      setUploading(false);
    }
  };

  const pick = (index: number) => {
    const user = candidates[index];
    if (!mention || !user) return;
    const result = applyMention(text, mention, cursor, user.name);
    setText(result.text);
    setCursor(result.cursor);
    // "@Nome " ainda parece uma menção em andamento (nomes compostos aceitam um espaço).
    setDismissedAt(mention.start);
    requestAnimationFrame(() => ref.current?.setSelectionRange(result.cursor, result.cursor));
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending || uploading) return;
    setSending(true);
    try {
      await onSubmit(body);
      setText("");
      setCursor(0);
    } catch {
      // O erro já foi mostrado por quem enviou; o texto fica para tentar de novo.
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(active);
        return;
      }
      if (event.key === "Escape") {
        // Fecha só a lista, sem fechar o modal.
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(mention?.start ?? null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="fq-bug-modal-comment relative"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mencionar pessoa"
          className="fq-mention-list"
        >
          {candidates.map((user, index) => (
            <li
              key={user.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer px-3 py-1.5 text-[13px] ${index === active ? "bg-teal-400/10 text-neutral-100" : "text-neutral-300"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(index);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {user.name}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={2}
        className="fq-textarea text-sm leading-relaxed"
        placeholder="Comente... @ menciona, cole um print (Ctrl+V), **negrito**, `código`"
        aria-label="Novo comentário"
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setCursor(event.target.selectionStart);
          setDismissedAt(null);
        }}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          const file = imageFrom(event.clipboardData?.items);
          if (!file) return;
          event.preventDefault();
          void attachImage(file);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = imageFrom(event.dataTransfer?.files);
          if (!file) return;
          event.preventDefault();
          void attachImage(file);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void attachImage(file);
        }}
      />
      <div className="flex shrink-0 flex-col gap-1.5">
        <button type="button" className="fq-btn-ghost !min-h-0 !px-2 !py-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Anexar imagem" title="Anexar imagem (ou cole com Ctrl+V)">
          <ImagePlus className="h-3.5 w-3.5" />
        </button>
        <button type="submit" disabled={sending || uploading || !text.trim()} className="fq-btn-primary text-xs" title="Enviar (Ctrl+Enter)">
          <Send className="h-3 w-3" />
          {uploading ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </form>
  );
};
