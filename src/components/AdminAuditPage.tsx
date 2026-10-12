import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, History, RefreshCw, Search } from "lucide-react";
import { AUDIT_PAGE_SIZE, fetchAuditEvents } from "../lib/services";
import {
  AUDIT_CATEGORY_LABEL,
  auditCategory,
  describeAuditEvent,
  filterAuditEvents,
  type AuditCategory,
  type AuditEventRow,
} from "../lib/auditDescribe";
import { friendlyError } from "../lib/networkErrors";
import { EmptyState, ListSkeleton } from "./ui";

interface AdminAuditPageProps {
  onBack: () => void;
}

const CATEGORY_TONE: Record<AuditCategory, string> = {
  users: "bg-sky-400/10 text-sky-400",
  rooms: "bg-teal-400/10 text-teal-400",
  integrations: "bg-violet-400/10 text-violet-400",
  permissions: "bg-amber-400/10 text-amber-400",
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Quem fez o quê: mudanças de papel, acesso a salas, convites, integrações e permissões. */
export const AdminAuditPage: React.FC<AdminAuditPageProps> = ({ onBack }) => {
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<AuditCategory | "all">("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const first = await fetchAuditEvents();
      setEvents(first);
      setHasMore(first.length === AUDIT_PAGE_SIZE);
    } catch (err) {
      setError(friendlyError(err, err instanceof Error ? err.message : "Não foi possível carregar a auditoria."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const next = await fetchAuditEvents({ before: last.createdAt });
      setEvents((current) => [...current, ...next]);
      setHasMore(next.length === AUDIT_PAGE_SIZE);
    } catch (err) {
      setError(friendlyError(err, err instanceof Error ? err.message : "Não foi possível carregar mais."));
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => filterAuditEvents(events, { category, query }), [events, category, query]);

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <button type="button" onClick={onBack} className="fq-btn-ghost text-sm mb-3">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <p className="fq-page-eyebrow flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-teal-400" /> Admin
          </p>
          <h1 className="fq-page-title mt-1">Auditoria</h1>
          <p className="text-neutral-500 text-sm mt-1 max-w-2xl">
            Quem mudou papéis, acessos, convites, integrações e permissões. Só admins veem. Os eventos não podem ser editados nem apagados.
          </p>
        </div>
        <button type="button" className="fq-btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> Atualizar
        </button>
      </div>

      {error && <div className="fq-alert-error text-sm" role="alert">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" aria-hidden />
          <input
            type="search"
            className="fq-input !pl-8 text-sm"
            placeholder="Buscar por pessoa ou ação…"
            aria-label="Buscar na auditoria"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="fq-segmented" role="group" aria-label="Categoria">
          {(["all", "users", "rooms", "integrations", "permissions"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`fq-segment ${category === key ? "fq-segment--active" : ""}`}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {key === "all" ? "Tudo" : AUDIT_CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<History className="h-4 w-4" />}
          title={events.length === 0 ? "Nenhum evento registrado ainda" : "Nada com esses filtros"}
          description={events.length === 0 ? "Mudanças de papel, acesso a salas e integrações vão aparecer aqui." : "Tente outra categoria ou termo."}
        />
      ) : (
        <ol className="max-w-4xl space-y-2" data-testid="audit-list">
          {visible.map((event) => {
            const cat = auditCategory(event.action);
            return (
              <li key={event.id} className="fq-panel flex items-start gap-3 !p-3" data-action={event.action}>
                <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_TONE[cat]}`}>
                  {AUDIT_CATEGORY_LABEL[cat]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-neutral-200">{describeAuditEvent(event)}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    <time dateTime={event.createdAt}>{formatWhen(event.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore && !loading && (
        <button type="button" className="fq-btn-secondary text-sm" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Carregando…" : "Carregar mais"}
        </button>
      )}
    </div>
  );
};
