import React, { useEffect, useRef, useState } from "react";
import { joinWarRoom } from "../lib/services";
import { subscribeWarRooms, subscribeAllBugs, subscribeProjects, subscribeAllBoardViews } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { WarRoom, Bug, Project, BoardView } from "../types";
import {
  Clock,
  LayoutGrid,
  Search,
  Share2,
  ExternalLink,
  MoreHorizontal,
  UserPlus,
  Download,
  Key,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { RoomStatusBadge, RoomTypeBadge } from "./BugBadges";
import { canManageSpaces as roleCanManageSpaces } from "../lib/permissions";
import { dashboardPulse } from "../lib/dashboardPulse";
import { CreateWarRoomModal } from "./CreateWarRoomModal";
import { CreateProjectModal } from "./CreateProjectModal";

interface DashboardProps {
  onSelectRoom: (roomId: string) => void;
  onOpenAdminPage?: (path: "/admin/board-views" | "/admin/users", projectId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectRoom, onOpenAdminPage }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allBoardViews, setAllBoardViews] = useState<BoardView[]>([]);
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [myCardsOnly, setMyCardsOnly] = useState(false);
  const [isWarRoomModalOpen, setIsWarRoomModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spaceQuery, setSpaceQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [enterIdOpen, setEnterIdOpen] = useState(false);
  const [enterRoomIdInput, setEnterRoomIdInput] = useState("");
  const [enteringRoomLoading, setEnteringRoomLoading] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeRooms = subscribeWarRooms((rooms) => {
      setWarRooms(rooms);
      setLoading(false);
    });
    const unsubscribeProjects = subscribeProjects(setProjects);
    const unsubscribeBugs = subscribeAllBugs(setAllBugs);
    const unsubscribeViews = subscribeAllBoardViews(null, setAllBoardViews);
    return () => {
      unsubscribeRooms();
      unsubscribeProjects();
      unsubscribeBugs();
      unsubscribeViews();
    };
  }, []);

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

  const spaceQueryNorm = spaceQuery.trim().toLowerCase();
  const matchesSpaceQuery = (...values: Array<string | undefined>) =>
    !spaceQueryNorm ||
    values.some((value) => (value || "").toLowerCase().includes(spaceQueryNorm));

  const displayedWarRooms = warRooms
    .filter((room) => (room.roomType || "war_room") === "war_room")
    .filter((room) => matchesSpaceQuery(room.name, room.project, room.squad, room.id));

  const displayedProjects = projects.filter((project) =>
    matchesSpaceQuery(project.name, project.squad, project.warRoomId)
  );

  const viewCountByProject = allBoardViews.reduce<Record<string, number>>((acc, view) => {
    if (view.projectId && view.isActive) {
      acc[view.projectId] = (acc[view.projectId] || 0) + 1;
    }
    return acc;
  }, {});

  const canManageSpaces = roleCanManageSpaces(profile?.role);
  const hasSpaces = warRooms.length > 0 || projects.length > 0;

  const copyShareLink = (roomId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/?room=${roomId}`);
    toast("Link copiado.", { kind: "success" });
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

  const handleExportCSV = () => {
    const csvRows: string[][] = [
      ["Relatorio de cards"],
      [`Gerado em: ${new Date().toLocaleString()}`],
      [],
      ["ID", "Titulo", "Status", "Severidade", "Tipo", "Ambiente", "Responsavel", "Criado em"],
    ];
    scopedBugs.forEach((bug) => {
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
    setMoreOpen(false);
  };

  const renderSpaceCard = (room: WarRoom) => {
    const roomBugs = allBugs.filter((bug) => bug.warRoomId === room.id);
    const roomPulse = dashboardPulse(roomBugs);
    const isBoard = room.roomType === "board";

    return (
      <div key={room.id} onClick={() => onSelectRoom(room.id)} className="group fq-card-interactive">
        <div className="flex justify-between items-start gap-3">
          <h4 className="text-[15px] font-semibold text-neutral-100 tracking-tight truncate" title={room.name}>
            {room.name}
          </h4>
          {isBoard ? <RoomTypeBadge type="board" /> : <RoomStatusBadge status={room.status} />}
        </div>
        <div className="mt-2 text-[12px] text-neutral-500">
          {room.project}
          <span className="text-neutral-700"> · </span>
          {room.squad}
        </div>
        {!isBoard && room.date && (
          <div className="mt-1 text-[12px] text-neutral-500">
            {room.date}
            {room.periodEnd ? ` → ${room.periodEnd}` : ""}
          </div>
        )}
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <div className="flex gap-5 text-[12px] text-neutral-500">
            <span>
              <span className="tabular-nums text-neutral-100 font-semibold">{roomPulse.open}</span> abertos
            </span>
            {roomPulse.blockers > 0 && (
              <span className="text-red-400">
                <span className="tabular-nums font-semibold">{roomPulse.blockers}</span> blockers
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <button onClick={(e) => copyShareLink(room.id, e)} className="fq-btn-icon !p-1.5" title="Copiar link">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-[12px] text-neutral-500 group-hover:text-teal-300 transition flex items-center gap-1">
              Abrir <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderProjectCard = (proj: Project) => {
    const roomPulse = dashboardPulse(allBugs.filter((bug) => bug.warRoomId === proj.warRoomId));
    const viewCount = viewCountByProject[proj.id] || 0;

    return (
      <div key={proj.id} onClick={() => onSelectRoom(proj.warRoomId)} className="group fq-card-interactive">
        <div className="flex justify-between items-start gap-3">
          <h4 className="text-[15px] font-semibold text-neutral-100 tracking-tight truncate" title={proj.name}>
            {proj.name}
          </h4>
          <RoomTypeBadge type="board" permanent />
        </div>
        <div className="mt-2 text-[13px] text-neutral-500">
          {proj.squad}
          <span className="text-neutral-700"> · </span>
          {viewCount} {viewCount === 1 ? "view" : "views"}
        </div>
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <span className="text-[12px] text-neutral-500">
            <span className="tabular-nums text-neutral-100 font-semibold">{roomPulse.open}</span> abertos
          </span>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={(e) => copyShareLink(proj.warRoomId, e)}
              className="fq-btn-icon !p-1.5"
              title="Copiar link"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-[12px] text-neutral-500 group-hover:text-teal-300 transition flex items-center gap-1">
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
          <div className="relative" ref={moreRef}>
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
              <div
                className="absolute right-0 top-full mt-1.5 w-52 rounded-lg border z-40 py-1"
                style={{ backgroundColor: "var(--color-fq-elevated)", borderColor: "var(--color-fq-border)" }}
              >
                {profile?.role === "admin" && onOpenAdminPage && (
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
                      Views
                    </button>
                  </>
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
                    <Key className="w-3.5 h-3.5 text-neutral-500" />
                    Abrir por ID
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="fq-metric-card !flex-col !items-start !gap-1">
          <span className="text-[12px] text-neutral-500">Abertos</span>
          <h2 className="text-xl font-semibold text-neutral-100 tabular-nums">{pulse.open}</h2>
        </div>
        <div className="fq-metric-card !flex-col !items-start !gap-1">
          <span className="text-[12px] text-neutral-500">Blockers</span>
          <h2 className={`text-xl font-semibold tabular-nums ${pulse.blockers > 0 ? "text-red-400" : "text-neutral-100"}`}>
            {pulse.blockers}
          </h2>
        </div>
        <div className="fq-metric-card !flex-col !items-start !gap-1">
          <span className="text-[12px] text-neutral-500">Atrasados</span>
          <h2 className={`text-xl font-semibold tabular-nums ${pulse.overdue > 0 ? "text-amber-400" : "text-neutral-100"}`}>
            {pulse.overdue}
          </h2>
        </div>
      </div>
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
            placeholder="Buscar por nome, projeto ou squad"
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
            placeholder="ID de uma sala que você já pode ver"
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
              ? "Cole o ID da sala no menu Mais para entrar como convidado."
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
              Abrir por ID
            </button>
          )}
        </div>
      ) : (
        <>
          <div>
            <h3 className="fq-section-title">
              War rooms ({displayedWarRooms.length})
            </h3>
            {displayedWarRooms.length === 0 ? (
              <p className="text-sm text-neutral-500 mb-8">
                {spaceQuery ? "Nenhuma war room corresponde à busca." : "Nenhuma war room neste momento."}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {displayedWarRooms.map(renderSpaceCard)}
              </div>
            )}
          </div>

          <div>
            <h3 className="fq-section-title">Projetos ({displayedProjects.length})</h3>
            {displayedProjects.length === 0 ? (
              <p className="text-sm text-neutral-500">
                {spaceQuery ? "Nenhum projeto corresponde à busca." : "Nenhum projeto permanente ainda."}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedProjects.map(renderProjectCard)}
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {isWarRoomModalOpen && (
          <CreateWarRoomModal
            open={isWarRoomModalOpen}
            createdBy={profile?.id || "unknown"}
            createdByName={profile?.name || "Usuário"}
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
