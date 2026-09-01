import React, { useEffect, useRef, useState } from "react";
import { joinWarRoom } from "../lib/services";
import { fetchDashboardExportBugs } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  Clock,
  LayoutGrid,
  Search,
  Share2,
  ExternalLink,
  MoreHorizontal,
  UserPlus,
  Download,
  Link2,
  Inbox,
  Webhook,
  Building2,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { RoomStatusBadge, RoomTypeBadge } from "./BugBadges";
import { canManageIntegrations, canManageOrganizations, canManageSpaces as roleCanManageSpaces, canManageUsers } from "../lib/permissions";
import {
  dashboardPulse,
  PulseBug,
  PulseKind,
} from "../lib/dashboardPulse";
import { roomInviteUrl } from "../lib/routes";
import { decorateSpaces, groupSpacesByProject, SpaceRow, UNGROUPED_PROJECT_LABEL } from "../lib/spaces";
import { CreateWarRoomModal } from "./CreateWarRoomModal";
import { CreateProjectModal } from "./CreateProjectModal";

interface DashboardProps {
  spaces: SpaceRow[];
  allBugs: PulseBug[];
  loading: boolean;
  onSelectRoom: (roomId: string, pulse?: PulseKind) => void;
  onOpenAdminPage?: (path: "/admin/board-views" | "/admin/users" | "/admin/integrations" | "/admin/organizations", projectId?: string) => void;
  onOpenInbox?: () => void;
}

const PULSE_HINT: Record<Exclude<PulseKind, "all">, string> = {
  open: "Salas com cards abertos, as mais quentes primeiro.",
  blockers: "Salas com blocker. Clique de novo para ver todas.",
  overdue: "Salas com card atrasado. Clique de novo para ver todas.",
};

export const Dashboard: React.FC<DashboardProps> = ({
  spaces,
  allBugs,
  loading,
  onSelectRoom,
  onOpenAdminPage,
  onOpenInbox,
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [myCardsOnly, setMyCardsOnly] = useState(false);
  const [pulseFilter, setPulseFilter] = useState<PulseKind>("all");
  const [isWarRoomModalOpen, setIsWarRoomModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [spaceQuery, setSpaceQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [enterIdOpen, setEnterIdOpen] = useState(false);
  const [enterRoomIdInput, setEnterRoomIdInput] = useState("");
  const [enteringRoomLoading, setEnteringRoomLoading] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  const scopedBugs = allBugs.filter((bug) => !myCardsOnly || bug.ownerId === profile?.id);
  const pulse = dashboardPulse(scopedBugs);

  const displayedSpaces = decorateSpaces(spaces, scopedBugs, {
    query: spaceQuery,
    pulseFilter,
  });
  const spaceGroups = groupSpacesByProject(displayedSpaces);

  const canManageSpaces = roleCanManageSpaces(profile?.role);
  const hasSpaces = spaces.length > 0;

  const copyInvite = (roomId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(roomInviteUrl(roomId));
    toast("Convite copiado.", { kind: "success" });
  };

  const selectPulse = (kind: Exclude<PulseKind, "all">) => {
    const next: PulseKind = pulseFilter === kind ? "all" : kind;
    setPulseFilter(next);
    if (next === "all") return;

    const matching = decorateSpaces(spaces, scopedBugs, { pulseFilter: next });

    if (matching.length === 1 && (next === "blockers" || next === "overdue")) {
      onSelectRoom(matching[0].space.roomId, next);
    }
  };

  const handleEnterRoomById = async (event: React.FormEvent) => {
    event.preventDefault();
    const inputVal = enterRoomIdInput.trim();
    if (!inputVal) return;
    setEnteringRoomLoading(true);
    try {
      const roomId = await joinWarRoom(inputVal);
      setEnterRoomIdInput("");
      onSelectRoom(roomId);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Não foi possível abrir a sala.", { kind: "error" });
    } finally {
      setEnteringRoomLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const rows = await fetchDashboardExportBugs();
      const scoped = rows.filter((bug) => !myCardsOnly || bug.ownerId === profile?.id);
      const csvRows: string[][] = [
        ["Relatorio de cards"],
        [`Gerado em: ${new Date().toLocaleString()}`],
        [],
        ["ID", "Titulo", "Status", "Severidade", "Tipo", "Ambiente", "Responsavel", "Criado em"],
      ];
      scoped.forEach((bug) => {
        csvRows.push([
          bug.id,
          bug.title,
          bug.status,
          bug.criticism,
          bug.type || "",
          bug.environment || "",
          bug.ownerName || "Sem responsavel",
          bug.createdAt ? new Date(bug.createdAt).toLocaleString() : "",
        ]);
      });
      const csvContent = csvRows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "forceqa_cards.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não foi possível exportar o CSV.", { kind: "error" });
    } finally {
      setMoreOpen(false);
    }
  };

  const renderSpaceCard = (space: SpaceRow, roomPulse: ReturnType<typeof dashboardPulse>) => {
    return (
      <div
        key={space.key}
        onClick={() => onSelectRoom(space.roomId, pulseFilter === "all" ? undefined : pulseFilter)}
        className="group fq-card-interactive"
      >
        <div className="flex justify-between items-start gap-3">
          <h4 className="truncate font-display text-[15px] font-semibold tracking-tight text-neutral-50" title={space.name}>
            {space.name}
          </h4>
          {space.kind === "board" ? (
            <RoomTypeBadge type="board" permanent />
          ) : (
            <RoomStatusBadge status={space.status || "active"} />
          )}
        </div>
        <div className="mt-2 text-[12px] text-neutral-500">
          {space.projectLabel ? (
            <>
              {space.projectLabel}
              <span className="text-neutral-700"> · </span>
            </>
          ) : null}
          {space.squad}
          {space.kind === "board" && (space.viewCount ?? 0) > 0 ? (
            <>
              <span className="text-neutral-700"> · </span>
              {space.viewCount} {space.viewCount === 1 ? "visão" : "visões"}
            </>
          ) : null}
        </div>
        {space.dateLine && (
          <div className="mt-1 text-[12px] text-neutral-500">{space.dateLine}</div>
        )}
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <div className="flex gap-4 text-[12px] text-neutral-500">
            <span>
              <span className="tabular-nums text-neutral-100 font-semibold">{roomPulse.open}</span> abertos
            </span>
            {roomPulse.blockers > 0 && (
              <span className="text-red-400">
                <span className="tabular-nums font-semibold">{roomPulse.blockers}</span> blockers
              </span>
            )}
            {roomPulse.overdue > 0 && (
              <span className="text-amber-400">
                <span className="tabular-nums font-semibold">{roomPulse.overdue}</span> atrasados
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <button onClick={(e) => copyInvite(space.roomId, e)} className="fq-btn-icon !p-1.5" title="Copiar convite">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <span className="flex items-center gap-1 text-[12px] text-neutral-500 transition group-hover:text-neutral-200">
              Abrir <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <p className="fq-page-eyebrow">Operação</p>
          <h1 className="fq-page-title">Suas salas</h1>
          <p className="text-neutral-500 text-sm mt-1">Abra um board para continuar o trabalho.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageSpaces && (
            <>
              <button onClick={() => setIsWarRoomModalOpen(true)} className="fq-btn-primary text-sm">
                <Clock className="w-4 h-4" />
                Nova war room
              </button>
              <button onClick={() => setIsProjectModalOpen(true)} className="fq-btn-secondary text-sm">
                <LayoutGrid className="w-4 h-4" />
                Novo projeto
              </button>
            </>
          )}
          {onOpenAdminPage && canManageIntegrations(profile?.role, profile?.isSuperadmin, profile?.isGuest) && (
            <button
              type="button"
              onClick={() => onOpenAdminPage("/admin/integrations")}
              className="fq-btn-ghost text-sm"
            >
              <Webhook className="w-4 h-4" />
              Integrações
            </button>
          )}
          <div className="relative z-30" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="fq-btn-ghost text-sm"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-4 h-4" />
              Mais
            </button>
            {moreOpen && (
              <div className="fq-menu w-52">
                {onOpenInbox && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                    onClick={() => {
                      onOpenInbox();
                      setMoreOpen(false);
                    }}
                  >
                    <Inbox className="w-3.5 h-3.5 text-neutral-500" />
                    Meus cards
                  </button>
                )}
                {onOpenAdminPage && canManageUsers(profile?.role, profile?.isSuperadmin) && (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                      onClick={() => {
                        onOpenAdminPage("/admin/users");
                        setMoreOpen(false);
                      }}
                    >
                      <UserPlus className="w-3.5 h-3.5 text-neutral-500" />
                      Usuários
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                      onClick={() => {
                        onOpenAdminPage("/admin/board-views");
                        setMoreOpen(false);
                      }}
                    >
                      <LayoutGrid className="w-3.5 h-3.5 text-neutral-500" />
                      Visões
                    </button>
                  </>
                )}
                {onOpenAdminPage && canManageOrganizations(profile?.isSuperadmin) && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                    onClick={() => {
                      onOpenAdminPage("/admin/organizations");
                      setMoreOpen(false);
                    }}
                  >
                    <Building2 className="w-3.5 h-3.5 text-neutral-500" />
                    Organizações
                  </button>
                )}
                {onOpenAdminPage && canManageIntegrations(profile?.role, profile?.isSuperadmin, profile?.isGuest) && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                    onClick={() => {
                      onOpenAdminPage("/admin/integrations");
                      setMoreOpen(false);
                    }}
                  >
                    <Webhook className="w-3.5 h-3.5 text-neutral-500" />
                    Integrações
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={handleExportCSV}
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  Exportar CSV
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={() => {
                    setMyCardsOnly((value) => !value);
                    setMoreOpen(false);
                  }}
                >
                  {myCardsOnly ? "Ver todos os cards" : "Só meus cards"}
                </button>
                {profile?.isGuest && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                    onClick={() => {
                      setEnterIdOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 text-neutral-500" />
                    Entrar com o link
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => selectPulse("open")}
          className={`fq-metric-card fq-metric-card--button !flex-col !items-start !gap-1 ${
            pulseFilter === "open" ? "fq-metric-card--active" : ""
          }`}
        >
          <span className="text-[12px] text-neutral-500">Abertos</span>
          <h2 className="text-xl font-semibold text-neutral-100 tabular-nums">{pulse.open}</h2>
        </button>
        <button
          type="button"
          onClick={() => selectPulse("blockers")}
          className={`fq-metric-card fq-metric-card--button !flex-col !items-start !gap-1 ${
            pulseFilter === "blockers" ? "fq-metric-card--active" : ""
          }`}
        >
          <span className="text-[12px] text-neutral-500">Blockers</span>
          <h2 className={`text-xl font-semibold tabular-nums ${pulse.blockers > 0 ? "text-red-400" : "text-neutral-100"}`}>
            {pulse.blockers}
          </h2>
        </button>
        <button
          type="button"
          onClick={() => selectPulse("overdue")}
          className={`fq-metric-card fq-metric-card--button !flex-col !items-start !gap-1 ${
            pulseFilter === "overdue" ? "fq-metric-card--active" : ""
          }`}
        >
          <span className="text-[12px] text-neutral-500">Atrasados</span>
          <h2 className={`text-xl font-semibold tabular-nums ${pulse.overdue > 0 ? "text-amber-400" : "text-neutral-100"}`}>
            {pulse.overdue}
          </h2>
        </button>
      </div>
      {pulseFilter !== "all" && (
        <p className="text-[12px] text-neutral-500 -mt-3">{PULSE_HINT[pulseFilter]}</p>
      )}
      {myCardsOnly && (
        <p className="text-[12px] text-neutral-500 -mt-3">Números filtrados pelos cards atribuídos a você.</p>
      )}

      <div className="max-w-xl">
        <label className="sr-only" htmlFor="space-search">Buscar salas</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            id="space-search"
            type="search"
            placeholder="Buscar por nome, projeto ou área"
            className="fq-input pl-9"
            value={spaceQuery}
            onChange={(e) => setSpaceQuery(e.target.value)}
          />
        </div>
      </div>

      {enterIdOpen && profile?.isGuest && (
        <form onSubmit={handleEnterRoomById} className="flex max-w-xl gap-2">
          <input
            type="text"
            required
            autoFocus
            placeholder="Cole o link da sala"
            className="fq-input flex-1"
            value={enterRoomIdInput}
            onChange={(e) => setEnterRoomIdInput(e.target.value)}
          />
          <button type="submit" disabled={enteringRoomLoading} className="fq-btn-primary">
            {enteringRoomLoading ? "..." : "Abrir"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="fq-empty-state">
          <div className="fq-spinner mx-auto mb-2" />
          <p className="text-neutral-500 text-sm">Carregando salas...</p>
        </div>
      ) : !hasSpaces ? (
        <div className="fq-empty-state">
          <h4 className="text-neutral-200 font-medium text-[15px]">Você não tem boards</h4>
          <p className="text-neutral-500 text-sm mt-1 max-w-sm mx-auto">
            {profile?.isGuest
              ? "Cole o link da sala para entrar como convidado."
              : canManageSpaces
                ? "Crie uma war room ou um projeto para começar."
                : "Peça a um admin para marcar o acesso em Usuários."}
          </p>
          {profile?.isGuest && (
            <button
              type="button"
              className="fq-btn-primary text-sm mt-4"
              onClick={() => setEnterIdOpen(true)}
            >
              Entrar com o link
            </button>
          )}
        </div>
      ) : displayedSpaces.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {spaceQuery || pulseFilter !== "all"
            ? "Nenhuma sala corresponde a esse filtro."
            : "Nenhuma sala neste momento."}
        </p>
      ) : (
        <div className="space-y-8">
          {spaceGroups.map((group) => (
            <div key={group.key}>
              <h3 className="fq-section-title">
                {spaceGroups.length === 1 && group.title === UNGROUPED_PROJECT_LABEL
                  ? `Salas (${group.items.length})`
                  : group.title}
                {!(spaceGroups.length === 1 && group.title === UNGROUPED_PROJECT_LABEL) && (
                  <span className="font-normal text-neutral-500"> ({group.items.length})</span>
                )}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map(({ space, roomPulse }) => renderSpaceCard(space, roomPulse))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {isWarRoomModalOpen && (
          <CreateWarRoomModal
            open={isWarRoomModalOpen}
            createdBy={profile?.id || "unknown"}
            createdByName={profile?.name || "Usuário"}
            organizationId={profile?.organizationId}
            onClose={() => setIsWarRoomModalOpen(false)}
            onCreated={(roomId) => {
              setIsWarRoomModalOpen(false);
              onSelectRoom(roomId);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProjectModalOpen && (
          <CreateProjectModal
            open={isProjectModalOpen}
            createdBy={profile?.id || "unknown"}
            createdByName={profile?.name || "Usuário"}
            organizationId={profile?.organizationId}
            onClose={() => setIsProjectModalOpen(false)}
            onCreated={(warRoomId) => {
              setIsProjectModalOpen(false);
              onSelectRoom(warRoomId);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
