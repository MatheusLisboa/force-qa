import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { subscribeWarRoom, subscribeBugsByRoom, subscribeBoardViews, subscribeProjectByWarRoomId } from "../lib/supabase";
import { updateBugField, updateWarRoom, deleteWarRoom } from "../lib/services";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { useAuth } from "../context/AuthContext";
import { WarRoom, Bug, BugType, BoardView, Project, KanbanColumn } from "../types";
import { BugDetailModal } from "./BugDetailModal";
import { AIReportModal } from "./AIReportModal";
import { BoardViewSwitcher } from "./BoardViewSwitcher";
import { KanbanBoard } from "./KanbanBoard";
import { CreateBugModal } from "./CreateBugModal";
import { RoomMembersPanel } from "./RoomMembersPanel";
import { filterItemsByView, readStoredBoardViewId, writeStoredBoardViewId } from "../lib/boardViews";
import { BUG_TYPE_OPTIONS, ENVIRONMENT_LABELS } from "../lib/bugLabels";
import {
  resolveKanbanColumns,
  groupBugsByColumn,
  createCustomKanbanColumn,
  resolveBugColumnId,
  displayColumnLabel,
} from "../lib/kanbanColumns";
import { RoomTypeBadge } from "./BugBadges";
import { canInviteToRoom, canWriteBugs } from "../lib/permissions";
import { bugMatchesPulse, parsePulseKind, PulseKind, roomHeadlineParts } from "../lib/dashboardPulse";
import { roomInviteUrl } from "../lib/routes";
import {
  ArrowLeft,
  Plus,
  Kanban,
  Brain,
  FileSpreadsheet,
  Sliders,
  CheckCircle,
  Copy,
  X,
  Sparkles,
  MoreHorizontal,
  Settings,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface WarRoomDetailProps {
  roomId: string;
  initialPulse?: PulseKind;
  initialBugId?: string | null;
  initialBugAt?: number;
  onBack: () => void;
}

export const WarRoomDetail: React.FC<WarRoomDetailProps> = ({
  roomId,
  initialPulse = "all",
  initialBugId = null,
  initialBugAt = 0,
  onBack,
}) => {
  const { profile } = useAuth();
  const canUseAi = canWriteBugs(profile?.role) && !profile?.isGuest;
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [copied, setCopied] = useState(false);
  const [warRoom, setWarRoom] = useState<WarRoom | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"kanban" | "ai_report">("kanban");
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [createPresetType, setCreatePresetType] = useState<BugType>("bug");
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);

  const openCreateCardModal = useCallback((presetType?: BugType) => {
    setCreatePresetType(presetType ?? "bug");
    setIsBugModalOpen(true);
  }, []);

  const [envFilter, setEnvFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [pulseFilter, setPulseFilter] = useState<PulseKind>(initialPulse);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [isSavingColumns, setIsSavingColumns] = useState(false);

  const [boardViews, setBoardViews] = useState<BoardView[]>([]);
  const [boardViewsLoading, setBoardViewsLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [activeBoardViewId, setActiveBoardViewId] = useState<string | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isAiReportModalOpen, setIsAiReportModalOpen] = useState(false);
  const [aiReportAutoGenerate, setAiReportAutoGenerate] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [roomMoreOpen, setRoomMoreOpen] = useState(false);
  const roomMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setIsCoarsePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!roomMoreOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!roomMoreRef.current?.contains(event.target as Node)) setRoomMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [roomMoreOpen]);
  useEffect(() => {
    setPulseFilter(parsePulseKind(initialPulse));
  }, [initialPulse, roomId]);

  const openedBugRef = useRef<string | null>(null);
  useEffect(() => {
    openedBugRef.current = null;
  }, [roomId]);
  useEffect(() => {
    if (!initialBugId) return;
    const key = `${initialBugId}:${initialBugAt}`;
    if (openedBugRef.current === key) return;
    const found = bugs.find((bug) => bug.id === initialBugId);
    if (found) {
      openedBugRef.current = key;
      setSelectedBug(found);
    }
  }, [initialBugId, initialBugAt, bugs]);

  useEffect(() => {
    const unsubscribeRoom = subscribeWarRoom(roomId, setWarRoom);
    const unsubscribeBugs = subscribeBugsByRoom(roomId, (bList) => {
      setBugs(bList);
      setLoading(false);
    });
    return () => {
      unsubscribeRoom();
      unsubscribeBugs();
    };
  }, [roomId]);

  useEffect(() => {
    const unsub = subscribeProjectByWarRoomId(roomId, (row) => {
      setProject(row);
      setActiveBoardViewId(row ? readStoredBoardViewId(row.id) : null);
    });
    return unsub;
  }, [roomId]);

  useEffect(() => {
    if (!project) {
      setBoardViews([]);
      setBoardViewsLoading(false);
      return;
    }

    setBoardViewsLoading(true);
    const unsub = subscribeBoardViews(project.id, (views) => {
      setBoardViews(views);
      setBoardViewsLoading(false);
    });
    return unsub;
  }, [project?.id]);

  useEffect(() => {
    if (!project || boardViewsLoading) return;
    if (!activeBoardViewId) return;
    if (!boardViews.some((v) => v.id === activeBoardViewId)) {
      setActiveBoardViewId(null);
      writeStoredBoardViewId(project.id, null);
    }
  }, [boardViews, boardViewsLoading, activeBoardViewId, project]);

  const handleBoardViewSelect = useCallback(
    (viewId: string | null) => {
      setActiveBoardViewId(viewId);
      if (project) writeStoredBoardViewId(project.id, viewId);
    },
    [project]
  );

  // Handle Drag & Drop HTML5 mechanics
  const handleDragStart = (e: React.DragEvent, bugId: string) => {
    e.dataTransfer.setData("text/plain", bugId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const bugId = e.dataTransfer.getData("text/plain");
    if (!bugId || !profile || !warRoom) return;
    if (!canWriteBugs(profile.role)) {
      toast("Observadores não podem mover cards no Kanban.", { kind: "error" });
      return;
    }

    const columns = resolveKanbanColumns(warRoom.kanbanColumns);
    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    const targetBug = bugs.find((b) => b.id === bugId);
    if (!targetBug) return;
    if (resolveBugColumnId(targetBug, columns) === columnId) return;

    const previousStatus = targetBug.status;
    const previousColumnId = resolveBugColumnId(targetBug, columns);

    try {
      await updateBugField(
        bugId,
        roomId,
        { status: column.status, kanbanColumnId: column.id },
        profile.id,
        profile.name,
        `Moveu card para a coluna "${displayColumnLabel(column)}"`
      );
      toast(`Movido para ${displayColumnLabel(column)}`, {
        kind: "success",
        action: {
          label: "Desfazer",
          onClick: async () => {
            const previousColumn = columns.find((c) => c.id === previousColumnId);
            await updateBugField(
              bugId,
              roomId,
              { status: previousStatus, kanbanColumnId: previousColumnId },
              profile.id,
              profile.name,
              `Desfez a movimentação para "${previousColumn?.label ?? previousColumnId}"`
            );
          },
        },
      });
    } catch (err: unknown) {
      console.error("Failed transition fields update:", err);
      toast(err instanceof Error ? err.message : "Não foi possível mover o card.", { kind: "error" });
    }
  };

  const handleMoveToColumn = async (bug: Bug, column: KanbanColumn) => {
    if (!profile || !warRoom) return;
    const columns = resolveKanbanColumns(warRoom.kanbanColumns);
    const previousColumnId = resolveBugColumnId(bug, columns);
    if (previousColumnId === column.id) return;
    const previousStatus = bug.status;
    try {
      await updateBugField(bug.id, roomId, { status: column.status, kanbanColumnId: column.id }, profile.id, profile.name, `Moveu card para a coluna "${displayColumnLabel(column)}"`);
      toast(`Movido para ${displayColumnLabel(column)}`, {
        kind: "success",
        action: {
          label: "Desfazer",
          onClick: async () => {
            await updateBugField(bug.id, roomId, { status: previousStatus, kanbanColumnId: previousColumnId }, profile.id, profile.name, "Desfez a movimentação");
          },
        },
      });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Não foi possível mover o card.", { kind: "error" });
    }
  };


  // Export bugs statistics as a custom spreadsheet CSV file Download
  const triggerCsvDownload = () => {
    if (bugs.length === 0) return;
    const headers = ["ID", "Titulo", "Tipo", "Criticidade", "Prioridade", "Status", "Ambiente", "Responsavel", "Criador", "CriadoEm"];
    const rows = bugs.map(b => [
      b.id,
      `"${b.title.replace(/"/g, '""')}"`,
      b.type,
      b.criticism,
      b.priority,
      b.status,
      b.environment,
      b.ownerName || "Nenhum",
      b.createdByName,
      b.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `forceqa_warroom_report_${roomId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering calculations
  const filteredBugs = bugs.filter((bug) => {
    const matchEnv = envFilter === "all" || bug.environment === envFilter;
    const matchType = typeFilter === "all" || bug.type === typeFilter;
    const matchSeverity = severityFilter === "all" || bug.criticism === severityFilter;
    const matchOwner = ownerFilter === "all" 
      ? true 
      : ownerFilter === "unassigned" 
        ? !bug.ownerId 
        : bug.ownerId === ownerFilter;

    const matchSearch = searchQuery.trim() === "" ||
      bug.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bug.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bug.description && bug.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (bug.ownerName && bug.ownerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      bug.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchPulse = bugMatchesPulse(bug, pulseFilter);

    return matchEnv && matchType && matchSeverity && matchOwner && matchSearch && matchPulse;
  });

  const activeBoardView = useMemo(
    () => (activeBoardViewId ? boardViews.find((v) => v.id === activeBoardViewId) ?? null : null),
    [activeBoardViewId, boardViews]
  );

  const visibleKanbanBugs = useMemo(
    () => (activeBoardView ? filterItemsByView(filteredBugs, activeBoardView) : filteredBugs),
    [filteredBugs, activeBoardView]
  );

  if (!warRoom) {
    return (
      <div className="fq-loading min-h-[60vh]">
        <div className="fq-spinner mb-3" />
        <p className="text-neutral-500 font-mono text-sm leading-relaxed">Carregando a sala...</p>
      </div>
    );
  }

  // List of active developers currently assigned inside this room
  const developerIdsAssigned = Array.from(new Set(bugs.map(b => b.ownerId).filter(id => id !== null))) as string[];
  const developersAssigned = developerIdsAssigned.map(id => {
    const matchingBug = bugs.find(b => b.ownerId === id);
    return { id, name: matchingBug?.ownerName || "Unknown Dev" };
  });

  const kanbanColumns = resolveKanbanColumns(warRoom.kanbanColumns);
  const bugsByColumn = groupBugsByColumn(visibleKanbanBugs, kanbanColumns);
  const headlineParts = roomHeadlineParts(bugs);
  const canManageThisRoom =
    profile?.role === "admin" || warRoom.createdBy === profile?.id || canInviteToRoom(profile?.role);

  const openAiReport = (autoGenerate = false) => {
    setAiReportAutoGenerate(autoGenerate);
    setIsAiReportModalOpen(true);
  };

  const handleAddKanbanColumn = async () => {
    const label = newColumnLabel.trim();
    if (!label || isSavingColumns) return;

    const next = [...kanbanColumns, createCustomKanbanColumn(label, kanbanColumns)];
    setIsSavingColumns(true);
    try {
      await updateWarRoom(roomId, { kanbanColumns: next });
      setNewColumnLabel("");
    } catch (err) {
      console.error("Erro ao adicionar coluna:", err);
      toast("Não foi possível adicionar a coluna. Rode a migration de colunas no Supabase.", { kind: "error" });
    } finally {
      setIsSavingColumns(false);
    }
  };

  const handleRemoveKanbanColumn = async (columnId: string) => {
    const column = kanbanColumns.find((c) => c.id === columnId);
    if (!column || column.builtin || isSavingColumns) return;
    const ok = await confirm({
      title: "Remover coluna",
      message: `Cards em "${displayColumnLabel(column)}" voltarão para a coluna padrão do status.`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;

    const next = kanbanColumns.filter((c) => c.id !== columnId);
    setIsSavingColumns(true);
    try {
      await updateWarRoom(roomId, { kanbanColumns: next });
    } catch (err) {
      console.error("Erro ao remover coluna:", err);
      toast("Não foi possível remover a coluna.", { kind: "error" });
    } finally {
      setIsSavingColumns(false);
    }
  };

  return (
    <div className="fq-page fq-page--operational space-y-5">
      <div className="fq-page-header shrink-0 gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="shrink-0 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-200 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="fq-action-label">Voltar</span>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate font-display text-lg sm:text-xl font-semibold tracking-[-0.02em] text-neutral-50">
                {warRoom.name}
              </h2>
              <span className="hidden sm:inline-flex">
                {warRoom.roomType === "board" ? (
                  <RoomTypeBadge type="board" permanent />
                ) : (
                  <RoomTypeBadge type="war_room" />
                )}
              </span>
            </div>
            <p className="text-[12px] sm:text-[13px] text-neutral-500 mt-0.5 truncate">
              {headlineParts.map((part, index) => (
                <span key={part}>
                  {index > 0 ? <span className="text-neutral-700"> · </span> : null}
                  <span className={index === 0 ? "tabular-nums text-neutral-200 font-medium" : "tabular-nums"}>
                    {part}
                  </span>
                </span>
              ))}
              <span className="hidden sm:inline">
                <span className="text-neutral-700"> · </span>
                {warRoom.squad}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {profile && (
            <button
              type="button"
              onClick={() => setOwnerFilter(ownerFilter === profile.id ? "all" : profile.id)}
              className={`fq-btn-ghost text-sm ${
                ownerFilter === profile.id ? "!bg-white/[0.08] !border-white/20 text-neutral-100" : ""
              }`}
            >
              <span className="sm:hidden">Meus</span>
              <span className="fq-action-label">Meus cards</span>
            </button>
          )}
          {canWriteBugs(profile?.role) && (
            <button onClick={() => openCreateCardModal()} className="fq-btn-primary text-sm">
              <Plus className="w-4 h-4" />
              <span className="sm:hidden">Novo</span>
              <span className="fq-action-label">Novo card</span>
            </button>
          )}
          {canManageThisRoom && (
            <button
              type="button"
              onClick={() => setAdminOpen((open) => !open)}
              className={`fq-btn-ghost text-sm ${adminOpen ? "!bg-white/[0.08] text-neutral-100" : ""}`}
            >
              <Settings className="w-4 h-4" />
              <span className="fq-action-label">Administrar</span>
            </button>
          )}
          <div className="relative" ref={roomMoreRef}>
            <button
              type="button"
              onClick={() => setRoomMoreOpen((open) => !open)}
              className="fq-btn-ghost text-sm"
              aria-expanded={roomMoreOpen}
            >
              <MoreHorizontal className="w-4 h-4" />
              <span className="fq-action-label">Mais</span>
            </button>
            {roomMoreOpen && (
              <div className="fq-menu w-52">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={() => {
                    setActiveTab("kanban");
                    setRoomMoreOpen(false);
                  }}
                >
                  <Kanban className="w-3.5 h-3.5 text-neutral-500" />
                  Kanban
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={() => {
                    triggerCsvDownload();
                    setRoomMoreOpen(false);
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-neutral-500" />
                  Exportar CSV
                </button>
                {canUseAi && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={() => {
                    setActiveTab("ai_report");
                    setRoomMoreOpen(false);
                  }}
                >
                  <Brain className="w-3.5 h-3.5 text-neutral-500" />
                  Relatório IA
                </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.05]"
                  onClick={() => {
                    navigator.clipboard.writeText(roomInviteUrl(roomId));
                    setCopied(true);
                    toast("Convite copiado.", { kind: "success" });
                    setTimeout(() => setCopied(false), 2000);
                    setRoomMoreOpen(false);
                  }}
                >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-500" />}
                  Copiar convite
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeTab !== "kanban" && (
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
          <span className="text-sm text-neutral-400">
            Relatório de IA desta sala
          </span>
          <button type="button" className="fq-btn-ghost text-sm" onClick={() => setActiveTab("kanban")}>
            Voltar ao kanban
          </button>
        </div>
      )}

      {adminOpen && canManageThisRoom && (
        <div className="fq-admin-bar shrink-0">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-neutral-400" />
            <div>
              <h4 className="text-sm font-medium text-neutral-100">
                Administração
              </h4>
              <p className="text-[12px] text-neutral-500">
                {profile?.role === "admin"
                  ? "Defina quem vê esta sala, status, convidados e exclusão."
                  : canInviteToRoom(profile?.role) && warRoom.createdBy !== profile?.id
                    ? "Adicione ou remova quem pode ver este board."
                    : "Gerencie status, acesso de convidados e exclusão da sala."}
              </p>
            </div>
          </div>

          {(profile?.role === "admin" || warRoom.createdBy === profile?.id) && (
          <div className="flex flex-wrap items-center gap-3">
            {warRoom.roomType !== "board" && (
              <div className="fq-filter-chip">
                <span className="text-[11px] text-neutral-500">Status</span>
                <select
                  value={warRoom.status}
                  onChange={async (e) => {
                    try {
                      await updateWarRoom(roomId, { status: e.target.value as WarRoom["status"] });
                    } catch (err) {
                      console.error("Erro ao atualizar status da sala:", err);
                    }
                  }}
                  className="bg-transparent text-neutral-100 focus:outline-none border-none text-xs font-semibold cursor-pointer"
                >
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                  <option value="ended">Encerrado</option>
                </select>
              </div>
            )}

            <label className="fq-filter-chip cursor-pointer select-none text-neutral-300">
              <input
                type="checkbox"
                checked={!!warRoom.guestAccessDisabled}
                onChange={async (e) => {
                  try {
                    await updateWarRoom(roomId, { guestAccessDisabled: e.target.checked });
                  } catch (err) {
                    console.error("Erro ao alterar acesso convidado:", err);
                  }
                }}
                className="rounded border-neutral-700 text-neutral-300 bg-transparent focus:ring-0 cursor-pointer"
              />
              Bloquear convidados
            </label>

            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "Excluir sala",
                  message: "Cards e histórico serão removidos. Esta ação não pode ser desfeita.",
                  confirmLabel: "Excluir sala",
                  danger: true,
                });
                if (!ok) return;
                try {
                  await deleteWarRoom(roomId);
                  onBack();
                } catch (err) {
                  console.error("Erro ao excluir sala:", err);
                  toast("Não foi possível excluir a sala. Verifique sua permissão.", { kind: "error" });
                }
              }}
              className="fq-btn-danger text-xs py-1.5"
            >
              Excluir {warRoom.roomType === "board" ? "Board" : "War Room"}
            </button>
          </div>
          )}

          {canInviteToRoom(profile?.role) && <RoomMembersPanel roomId={roomId} />}

          {profile?.role === "admin" && warRoom.roomType === "board" && (
            <div className="w-full basis-full pt-3 mt-1 border-t border-white/[0.06]">
              <p className="text-[12px] font-medium text-neutral-500 mb-2">
                Colunas do kanban
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {kanbanColumns.map((col) => (
                  <span key={col.id} className="fq-filter-chip gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.color}`} />
                    <span className="text-xs text-neutral-200">{displayColumnLabel(col)}</span>
                    {!col.builtin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveKanbanColumn(col.id)}
                        disabled={isSavingColumns}
                        className="fq-btn-icon !p-0 text-neutral-500 hover:text-red-400"
                        title={`Remover coluna ${col.label}`}
                        aria-label={`Remover coluna ${col.label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newColumnLabel}
                    onChange={(e) => setNewColumnLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKanbanColumn();
                      }
                    }}
                    placeholder="Nome da nova coluna"
                    className="fq-input !py-1 !px-2 text-xs w-44"
                    maxLength={40}
                    disabled={isSavingColumns}
                  />
                  <button
                    type="button"
                    onClick={handleAddKanbanColumn}
                    disabled={!newColumnLabel.trim() || isSavingColumns}
                    className="fq-btn-secondary text-xs py-1.5 gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Coluna
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "kanban" && (
      <div className="space-y-2">
        <div className="flex items-center gap-2 md:hidden">
          <input
            type="search"
            className="fq-input text-xs flex-1"
            placeholder="Buscar cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="button"
            className={`fq-btn-ghost text-sm shrink-0 ${filtersOpen ? "!bg-white/[0.08]" : ""}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>
      <div className={`fq-filter-bar fq-kanban-toolbar !flex-col !items-stretch gap-3 ${filtersOpen || (project && (boardViewsLoading || boardViews.length > 0)) ? "" : "max-md:hidden"}`}>
        {project && (boardViewsLoading || boardViews.length > 0) && (
          <>
            <BoardViewSwitcher
              views={boardViews}
              activeViewId={activeBoardViewId}
              onSelect={handleBoardViewSelect}
              loading={boardViewsLoading}
            />
            <div className={`h-px bg-white/[0.06] ${filtersOpen ? "" : "max-md:hidden"}`} />
          </>
        )}
        <div className={`flex flex-col items-stretch gap-3 md:flex-row md:items-center ${filtersOpen ? "" : "max-md:hidden"}`}>
        <div className="flex-1 w-full relative hidden md:block">
          <input
            type="text"
            className="fq-input text-xs"
            placeholder="Pesquisar por título, tags, responsável..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
          {pulseFilter !== "all" && (
            <button
              type="button"
              onClick={() => setPulseFilter("all")}
              className="fq-filter-chip !bg-white/[0.08] !border-white/20 text-neutral-100"
            >
              {pulseFilter === "blockers" ? "Blockers" : pulseFilter === "overdue" ? "Atrasados" : "Abertos"}
              <X className="w-3 h-3" />
            </button>
          )}
          <div className="fq-filter-chip">
            <span className="text-[11px] text-neutral-500">Ambiente</span>
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">Todos</option>
              <option value="production">{ENVIRONMENT_LABELS.production}</option>
              <option value="homologation">{ENVIRONMENT_LABELS.homologation}</option>
              <option value="dev">{ENVIRONMENT_LABELS.dev}</option>
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[11px] text-neutral-500">Tipo</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">Todos</option>
              {BUG_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[11px] text-neutral-500">Severidade</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">Todas</option>
              <option value="blocker">Blocker</option>
              <option value="critical">Crítico</option>
              <option value="high">Alto</option>
              <option value="medium">Médio</option>
              <option value="low">Baixo</option>
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[11px] text-neutral-500">Responsável</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">Todos</option>
              <option value="unassigned">Sem responsável</option>
              {developersAssigned.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        </div>
      </div>
      </div>
      )}

      {/* RENDER ACTIVE TAP CONTENT */}

      {activeTab === "kanban" && (
        <div className="fq-room-board">
          <KanbanBoard
            columns={kanbanColumns}
            bugsByColumn={bugsByColumn}
            role={profile?.role}
            isCoarsePointer={isCoarsePointer}
            selectedBugId={selectedBug?.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onOpenBug={setSelectedBug}
            onMoveToColumn={handleMoveToColumn}
          />
        </div>
      )}

      {activeTab === "ai_report" && canUseAi && (
        <div className="space-y-5">
          <div className="fq-analytics-panel">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/[0.06] pb-4 mb-6">
              <div>
                <h3 className="fq-section-title !mb-0">
                  <Brain className="w-5 h-5 text-neutral-400" /> Relatório de IA
                </h3>
                <p className="text-sm text-neutral-500 mt-0.5">
                  Um resumo da sala para quem não está no kanban.
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAiReport(true)}
                className="fq-btn-primary text-xs"
              >
                <Sparkles className="w-4 h-4" />
                Gerar relatório
              </button>
            </div>

            <p className="text-sm text-neutral-400 mb-6">
              {headlineParts.join(" · ")}
            </p>

            <div className="fq-empty-state py-12">
              <Brain className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h4 className="text-neutral-300 font-semibold">Gerar um resumo</h4>
              <p className="text-neutral-500 text-sm max-w-lg mx-auto mt-1 leading-relaxed">
                A IA lê os números da sala e devolve um texto curto: o que está travado e o que fazer agora.
              </p>
              <button
                type="button"
                onClick={() => openAiReport(true)}
                className="fq-btn-secondary text-sm mt-4"
              >
                Abrir relatório
              </button>
            </div>
          </div>
        </div>
      )}

      {warRoom && (
        <AIReportModal
          isOpen={isAiReportModalOpen}
          onClose={() => setIsAiReportModalOpen(false)}
          warRoom={warRoom}
          bugs={bugs}
          autoGenerate={aiReportAutoGenerate}
        />
      )}

      <AnimatePresence>
        {isBugModalOpen && (
          <CreateBugModal
            open={isBugModalOpen}
            roomId={roomId}
            existingBugs={bugs}
            presetType={createPresetType}
            onClose={() => setIsBugModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBug && (
          <BugDetailModal
            bug={selectedBug}
            onClose={() => setSelectedBug(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
