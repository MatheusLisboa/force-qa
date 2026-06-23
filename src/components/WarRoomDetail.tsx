import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { subscribeWarRoom, subscribeBugsByRoom, subscribeBoardViews, subscribeProjectByWarRoomId } from "../lib/supabase";
import { createBug, updateBugField, fetchAISuggestions, fetchAIDuplicateCheck, updateWarRoom, deleteWarRoom } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { WarRoom, Bug, SeverityLevel, BugStatus, BugPriority, BugType, AISuggestion, AIDuplicateCheck, BoardView, Project } from "../types";
import { BugDetailModal } from "./BugDetailModal";
import { AIReportModal } from "./AIReportModal";
import { BoardViewSwitcher } from "./BoardViewSwitcher";
import {
  filterItemsByView,
  readStoredBoardViewId,
  writeStoredBoardViewId,
} from "../lib/boardViews";
import { aggregateBoardMetrics } from "../lib/aiReport/aggregateMetrics";
import { BugTypeTag } from "./BugTypeTag";
import { evidenceLabel } from "../lib/evidence";
import { getBugTypeLabel, getStatusLabel } from "../lib/bugLabels";
import {
  resolveKanbanColumns,
  groupBugsByColumn,
  createCustomKanbanColumn,
  resolveBugColumnId,
} from "../lib/kanbanColumns";
import { SeverityBadge, RoomTypeBadge } from "./BugBadges";
import { useModalA11y } from "../hooks/useModalA11y";
import { 
  ArrowLeft, 
  Terminal, 
  Plus, 
  Kanban, 
  Activity, 
  TrendingUp, 
  Brain, 
  FileSpreadsheet, 
  Grid, 
  Globe, 
  AlertOctagon, 
  AlertTriangle,
  Upload, 
  User, 
  Sparkles, 
  Sliders,
  CheckCircle,
  FileText,
  Clock,
  Copy,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface WarRoomDetailProps {
  roomId: string;
  onBack: () => void;
}

export const WarRoomDetail: React.FC<WarRoomDetailProps> = ({ roomId, onBack }) => {
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [warRoom, setWarRoom] = useState<WarRoom | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Tab control: "kanban" | "analytics" | "ai_report"
  const [activeTab, setActiveTab] = useState<"kanban" | "analytics" | "ai_report">("kanban");
  
  // Modal toggle states
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const bugCreateDialogRef = useRef<HTMLDivElement>(null);
  const closeBugCreateModal = useCallback(() => setIsBugModalOpen(false), []);
  useModalA11y(isBugModalOpen, closeBugCreateModal, bugCreateDialogRef);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);

  // Filters state
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [isSavingColumns, setIsSavingColumns] = useState(false);

  const [boardViews, setBoardViews] = useState<BoardView[]>([]);
  const [boardViewsLoading, setBoardViewsLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [activeBoardViewId, setActiveBoardViewId] = useState<string | null>(null);

  // Create Bug Form states
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugCrit, setBugCrit] = useState<SeverityLevel>("medium");
  const [bugEnv, setBugEnv] = useState<"production" | "homologation" | "dev">("production");
  const [bugType, setBugType] = useState<BugType>("bug");
  const [bugPriority, setBugPriority] = useState<BugPriority>("medium");
  const [bugUrl, setBugUrl] = useState("");
  const [bugBuild, setBugBuild] = useState("");
  const [bugTagsInput, setBugTagsInput] = useState("");
  const [bugEvidence, setBugEvidence] = useState<string | null>(null);
  const [bugEvidenceLink, setBugEvidenceLink] = useState("");
  const [bugPrototype, setBugPrototype] = useState<string | null>(null);

  // AI Assistant states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<AIDuplicateCheck | null>(null);

  // AI Report modal
  const [isAiReportModalOpen, setIsAiReportModalOpen] = useState(false);
  const [aiReportAutoGenerate, setAiReportAutoGenerate] = useState(false);

  // Form submit state
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Live real-time streams subscription
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
    if (profile.role === "viewer") {
      alert("Acesso negado: Visualizadores não podem movimentar o kanban.");
      return;
    }

    const columns = resolveKanbanColumns(warRoom.kanbanColumns);
    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    const targetBug = bugs.find((b) => b.id === bugId);
    if (!targetBug) return;
    if (resolveBugColumnId(targetBug, columns) === columnId) return;

    const logMessage = `Moveu card para a coluna "${column.label}"`;

    try {
      await updateBugField(
        bugId,
        roomId,
        { status: column.status, kanbanColumnId: column.id },
        profile.id,
        profile.name,
        logMessage
      );
    } catch (err: any) {
      console.error("Failed transition fields update:", err);
    }
  };

  // Drag controls update status fallback
  const handleTransitionStatus = async (bug: Bug, targetStatus: BugStatus) => {
    if (!profile) return;
    if (profile.role === "viewer") return;
    const logMessage = `Alterou status para ${targetStatus}`;
    await updateBugField(bug.id, roomId, { status: targetStatus }, profile.id, profile.name, logMessage);
  };

  // Convert uploaded image file directly into web safety Base64 URL format
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Para preservar quotas operacionais, arquivos de evidências devem ter menos de 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBugEvidence(reader.result as string);
      setBugEvidenceLink("");
    };
    reader.readAsDataURL(file);
  };

  // Convert uploaded prototype image file directly into web safety Base64 URL format
  const handlePrototypeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Para preservar quotas operacionais, arquivos de imagem do protótipo devem ter menos de 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBugPrototype(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // AI suggests attributes using Gemini model
  const triggerAiSuggestions = async () => {
    if (!bugTitle.trim()) {
      alert("Insira pelo menos o título do bug para que o copiloto IA faça a análise.");
      return;
    }

    setIsAiLoading(true);
    setAiSuggestions(null);
    try {
      const suggest = await fetchAISuggestions(bugTitle, bugDesc);
      setAiSuggestions(suggest);
      setBugCrit(suggest.criticism);
      setBugPriority(suggest.priority);
      setBugType(suggest.type);
      setBugTagsInput(suggest.tags.join(", "));
    } catch (err: any) {
      alert("Aviso: Falha ao carregar sugestões IA. Verifique as credenciais de secrets.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // AI Prevention Duplicate Alarm Triage
  const triggerDuplicationTriage = async () => {
    if (!bugTitle.trim()) {
      alert("Insira o título para realizar a auditoria de similaridade.");
      return;
    }

    setIsCheckingDuplicate(true);
    setDuplicateAlert(null);
    try {
      // Send a simplified existing issues payload to stay within tokens limit
      const existingPayload = bugs.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description || ""
      }));

      const triage = await fetchAIDuplicateCheck(bugTitle, bugDesc, existingPayload);
      setDuplicateAlert(triage);
    } catch (err) {
      console.error(err);
      alert("Falha operacional ao checar duplicidade.");
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // Reporting/Creating a bug
  const handleReportBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim()) {
      setFormError("Por favor, declare o título descritivo do incidente.");
      return;
    }

    setFormSubmitting(true);
    setFormError("");
    try {
      const evidenceValue =
        bugEvidence || bugEvidenceLink.trim() || undefined;

      // Parse tags
      const splitTags = bugTagsInput
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      await createBug({
        warRoomId: roomId,
        title: bugTitle.trim(),
        description: bugDesc.trim(),
        criticism: bugCrit,
        status: "new",
        kanbanColumnId: "new",
        evidenceUrl: evidenceValue,
        prototypeUrl: bugPrototype || undefined,
        ownerId: null,
        ownerName: null,
        environment: bugEnv,
        affectedUrl: bugUrl.trim() || undefined,
        buildVersion: bugBuild.trim() || undefined,
        tags: splitTags,
        priority: bugPriority,
        type: bugType,
        createdBy: profile?.id || "unknown",
        createdByName: profile?.name || "Anonymous Ranger"
      }, profile?.id || "unknown", profile?.name || "Anonymous Ranger");

      // Reset form controls & closures
      setBugTitle("");
      setBugDesc("");
      setBugCrit("medium");
      setBugEnv("production");
      setBugType("bug");
      setBugPriority("medium");
      setBugUrl("");
      setBugBuild("");
      setBugTagsInput("");
      setBugEvidence(null);
      setBugEvidenceLink("");
      setBugPrototype(null);
      setAiSuggestions(null);
      setDuplicateAlert(null);
      setIsBugModalOpen(false);
    } catch (err: any) {
      setFormError("Falha ao registrar a ocorrência: " + err.message);
    } finally {
      setFormSubmitting(false);
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

    return matchEnv && matchType && matchSeverity && matchOwner && matchSearch;
  });

  const activeBoardView = useMemo(
    () => (activeBoardViewId ? boardViews.find((v) => v.id === activeBoardViewId) ?? null : null),
    [activeBoardViewId, boardViews]
  );

  const visibleKanbanBugs = useMemo(
    () => (activeBoardView ? filterItemsByView(filteredBugs, activeBoardView) : filteredBugs),
    [filteredBugs, activeBoardView]
  );

  // Calculate stats for current War Room bugs listings
  const totalBugsLength = filteredBugs.length;

  const reportMetrics = useMemo(
    () => (warRoom ? aggregateBoardMetrics(warRoom, bugs) : null),
    [warRoom, bugs]
  );

  if (!warRoom) {
    return (
      <div className="fq-loading min-h-[60vh]">
        <div className="fq-spinner mb-3" />
        <p className="text-neutral-500 font-mono text-sm leading-relaxed">Localizando canal no Supabase...</p>
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
      alert("Não foi possível adicionar a coluna. Verifique se a migração do banco foi aplicada.");
    } finally {
      setIsSavingColumns(false);
    }
  };

  const handleRemoveKanbanColumn = async (columnId: string) => {
    const column = kanbanColumns.find((c) => c.id === columnId);
    if (!column || column.builtin || isSavingColumns) return;
    if (!window.confirm(`Remover a coluna "${column.label}"? Cards nela voltarão para a coluna padrão do status.`)) {
      return;
    }

    const next = kanbanColumns.filter((c) => c.id !== columnId);
    setIsSavingColumns(true);
    try {
      await updateWarRoom(roomId, { kanbanColumns: next });
    } catch (err) {
      console.error("Erro ao remover coluna:", err);
      alert("Não foi possível remover a coluna.");
    } finally {
      setIsSavingColumns(false);
    }
  };

  return (
    <div className="fq-page fq-page--operational space-y-5">
      <div className="fq-page-header shrink-0">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12px] font-mono text-neutral-500 hover:text-neutral-300 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> VOLTAR AO COMANDO CENTRAL
          </button>
          
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="fq-page-title">
              {warRoom.name}
            </h2>
            {warRoom.roomType === "board" ? (
              <RoomTypeBadge type="board" permanent />
            ) : (
              <RoomTypeBadge type="war_room" />
            )}
            {project && (
              <span className="fq-badge text-[10px] bg-indigo-500/10 text-indigo-300 font-mono">
                PROJETO
              </span>
            )}
            <SeverityBadge severity={warRoom.severity} size="md" />
            <div className="flex items-center gap-1.5 fq-filter-chip font-mono">
              <span className="text-neutral-500 uppercase text-[9px] font-bold">ID:</span>
              <span className="text-neutral-300 font-bold select-all">{roomId}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="fq-btn-icon !p-0.5"
                title="Copiar ID da Sala"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
              {copied && <span className="text-[9px] text-emerald-400 font-bold uppercase">Copiado!</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[12px] font-mono text-neutral-500">
            <span>SQUAD: <span className="text-neutral-300 font-medium">{warRoom.squad}</span></span>
            <span>•</span>
            <span>SYSTEM: <span className="text-neutral-300 font-medium">{warRoom.project}</span></span>
            {warRoom.roomType !== "board" && warRoom.date && (
              <>
                <span>•</span>
                <span>
                  PERÍODO:{" "}
                  <span className="text-neutral-300 font-medium">
                    {warRoom.date}
                    {warRoom.periodEnd ? ` → ${warRoom.periodEnd}` : ""}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="fq-tab-group">
            <button
              onClick={() => setActiveTab("kanban")}
              className={`fq-segment flex items-center gap-1.5 !text-xs ${activeTab === "kanban" ? "fq-segment--active" : ""}`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`fq-segment flex items-center gap-1.5 !text-xs ${activeTab === "analytics" ? "fq-segment--active" : ""}`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Relatórios
            </button>
            <button
              onClick={() => setActiveTab("ai_report")}
              className={`fq-segment flex items-center gap-1.5 !text-xs ${activeTab === "ai_report" ? "fq-segment--active" : ""}`}
            >
              <Brain className="w-3.5 h-3.5" />
              IA Report
            </button>
          </div>

          {profile?.role !== "viewer" && (
            <button
              onClick={() => setIsBugModalOpen(true)}
              className="fq-btn-primary text-xs"
            >
              <Plus className="w-4 h-4" />
              Relatar Bug Instante
            </button>
          )}
        </div>
      </div>

      {/* Admin Panel for room creator or admin */}
      {(profile?.role === "admin" || warRoom.createdBy === profile?.id) && (
        <div className="fq-admin-bar shrink-0">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-neutral-400" />
            <div>
              <h4 className="text-xs font-mono font-bold text-neutral-100 uppercase tracking-wider">
                Painel Administrativo {warRoom.roomType === "board" ? "do Board" : "da War Room"}
              </h4>
              <p className="text-[11px] text-neutral-500 font-mono">
                {profile?.role === "admin"
                  ? "Admin: controle total sobre status, acesso e exclusão."
                  : "Gerencie status, acesso de convidados e comandos de controle."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {warRoom.roomType !== "board" && (
              <div className="fq-filter-chip">
                <span className="text-[10px] font-mono text-neutral-500 font-bold">STATUS:</span>
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
                  <option value="active">ATIVO</option>
                  <option value="paused">PAUSADO</option>
                  <option value="ended">ENCERRADO</option>
                </select>
              </div>
            )}

            <label className="fq-filter-chip cursor-pointer select-none font-mono font-semibold text-neutral-300">
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
              Bloquear Acesso Convidado (Guest)
            </label>

            <button
              onClick={async () => {
                if (!window.confirm("ATENÇÃO: Deseja realmente EXCLUIR DEFINITIVAMENTE esta Sala de Guerra? Todos os bugs e logs serão removidos e esta ação é irreversível!")) {
                  return;
                }
                try {
                  await deleteWarRoom(roomId);
                  onBack();
                } catch (err) {
                  console.error("Erro ao excluir sala:", err);
                  alert("Erro ao excluir a sala de guerra. Permissão inválida.");
                }
              }}
              className="fq-btn-danger text-xs py-1.5"
            >
              Excluir {warRoom.roomType === "board" ? "Board" : "War Room"}
            </button>
          </div>

          {profile?.role === "admin" && warRoom.roomType === "board" && (
            <div className="w-full basis-full pt-3 mt-1 border-t border-white/[0.06]">
              <p className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider mb-2">
                Colunas do Kanban
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {kanbanColumns.map((col) => (
                  <span key={col.id} className="fq-filter-chip gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.color}`} />
                    <span className="text-xs font-mono text-neutral-200">{col.label}</span>
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

      {activeTab === "kanban" && project && (
        <div className="fq-panel py-2.5 px-3 shrink-0">
          <BoardViewSwitcher
            views={boardViews}
            activeViewId={activeBoardViewId}
            onSelect={handleBoardViewSelect}
            loading={boardViewsLoading}
          />
        </div>
      )}

      <div className="fq-filter-bar fq-kanban-toolbar">
        <div className="flex-1 w-full relative">
          <input
            type="text"
            className="fq-input text-xs"
            placeholder="Pesquisar por ID, título, tags, responsável..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
          <div className="fq-filter-chip">
            <span className="text-[10px] font-mono text-neutral-500">ENV:</span>
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">TODOS</option>
              <option value="production">PROD</option>
              <option value="homologation">HMG</option>
              <option value="dev">DEV</option>
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[10px] font-mono text-neutral-500">TIPO:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">TODOS</option>
              <option value="bug">BUG</option>
              <option value="improvement">MELHORIA</option>
              <option value="ui_adjustment">UI/VISUAL</option>
              <option value="performance">PERF</option>
              <option value="security">SEC</option>
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[10px] font-mono text-neutral-500">SEV:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">TODAS</option>
              <option value="blocker">BLOCKER</option>
              <option value="critical">CRÍTICO</option>
              <option value="high">ALTO</option>
              <option value="medium">MÉDIO</option>
              <option value="low">BAIXO</option>
            </select>
          </div>

          <div className="fq-filter-chip">
            <span className="text-[10px] font-mono text-neutral-500">CORREÇÃO:</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-transparent text-neutral-200 focus:outline-none border-none text-xs font-medium cursor-pointer"
            >
              <option value="all">TODOS</option>
              <option value="unassigned">SEM RESPONSÁVEL</option>
              {developersAssigned.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE TAP CONTENT */}

      {/* TAB 1: KANBAN BOARD VIEW */}
      {activeTab === "kanban" && (
        <div className="fq-kanban-board">
          {kanbanColumns.map((column) => {
            const list = bugsByColumn[column.id] ?? [];

            return (
            <div
              key={column.id}
              className="fq-kanban-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="fq-kanban-column-header">
                <span className="text-[12px] font-medium text-neutral-400 font-mono flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${column.color}`} />
                  {column.label}
                </span>
                <span className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[11px] font-medium text-neutral-500 tabular-nums font-mono">
                  {list.length}
                </span>
              </div>

              <div
                className={`fq-kanban-column-body${
                  list.length > 5 ? " fq-kanban-column-body--scroll" : ""
                }`}
              >
                {list.length === 0 ? (
                  <div className="text-center py-10 text-neutral-600 text-[11px] font-mono border border-dashed border-white/[0.06] rounded-md">
                    ARRASTAR OU ABRIR TAREFA
                  </div>
                ) : (
                  list.map((bug) => (
                    <div
                      key={bug.id}
                      draggable={profile?.role !== "viewer"}
                      onDragStart={(e) => handleDragStart(e, bug.id)}
                      onClick={() => setSelectedBug(bug)}
                      className="group fq-kanban-card"
                    >
                      {bug.criticism === "blocker" && (
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500" />
                      )}

                      <div>
                        <div className="flex justify-between items-start gap-1.5 mb-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <BugTypeTag type={bug.type} />
                            <SeverityBadge severity={bug.criticism} />
                          </div>
                          <span className="fq-kanban-card-meta max-w-[100px] shrink-0" title={bug.id}>
                            {bug.id}
                          </span>
                        </div>

                        <h4 className="fq-kanban-card-title" title={bug.title}>
                          {bug.title}
                        </h4>

                        <div className="flex gap-1.5 items-center flex-wrap pt-2">
                          {bug.tags?.length > 0 &&
                            bug.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] text-neutral-400 bg-white/[0.04] border border-white/[0.06] py-0.5 px-1.5 rounded"
                              >
                                #{tag}
                              </span>
                            ))}
                          {bug.tags && bug.tags.length > 3 && (
                            <span className="text-[9px] text-neutral-600">+{bug.tags.length - 3}</span>
                          )}

                          {bug.evidenceUrl && (
                            <span className="fq-badge bg-white/[0.04] text-neutral-400 border-white/[0.06] text-[9px] font-mono py-0.5 px-1.5">
                              {evidenceLabel(bug.evidenceUrl) === "image" ? "📸" : "🔗"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center text-[11px] font-mono text-neutral-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-neutral-500" />
                          <span className="fq-kanban-card-meta" title={bug.ownerName || "Unassigned"}>
                            {bug.ownerName || "Sem Dev"}
                          </span>
                        </div>

                        {/* Relative Elapsed Open time since logged */}
                        <span className="flex items-center gap-0.5 text-[9px] text-neutral-500">
                          <Clock className="w-2.5 h-2.5" />
                          {Math.max(1, Math.round((new Date().getTime() - new Date(bug.createdAt).getTime()) / 60000))}m aberto
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: DETAILED ANALYTICAL METRICS AND EXPORTS REPORTS */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="fq-analytics-panel">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-4 mb-6">
              <div>
                <h3 className="fq-section-title !mb-0">
                  <TrendingUp className="w-5 h-5 text-neutral-400" /> Consolidados da Operação War Room
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">Métricas de performance, triagem por ambiente e taxa de reaberturas.</p>
              </div>

              <button
                onClick={triggerCsvDownload}
                className="fq-btn-secondary text-xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exportar Planilha CSV
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="fq-analytics-metric">
                <h4 className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-wider">Erros Por Ambiente</h4>
                <div className="space-y-2 text-xs">
                  {["production", "homologation", "dev"].map(env => {
                    const count = filteredBugs.filter(b => b.environment === env).length;
                    const percent = count > 0 ? (count / (filteredBugs.length || 1)) * 100 : 0;
                    return (
                      <div key={env}>
                        <div className="flex justify-between text-[11px] font-mono text-neutral-500 mb-1">
                          <span className="uppercase font-semibold">
                            {env === "homologation" ? "HMG" : env === "production" ? "PROD" : "DEV"}
                          </span>
                          <span>{count} ocorrências</span>
                        </div>
                        <div className="fq-progress-track">
                          <div className="h-full rounded-full bg-neutral-400" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="fq-analytics-metric">
                <h4 className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-wider">Erros Por Divisão</h4>
                <div className="space-y-1.5 text-xs">
                  {["bug", "improvement", "ui_adjustment", "performance", "security"].map(type => {
                    const count = filteredBugs.filter(b => b.type === type).length;
                    return (
                      <div key={type} className="flex justify-between text-[11px] font-mono py-1 border-b border-white/[0.04]">
                        <span className="text-neutral-400">{getBugTypeLabel(type as BugType)}</span>
                        <span className="font-bold text-neutral-100">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="fq-analytics-metric">
                <h4 className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-wider">Fatores de Qualidade</h4>
                
                <div className="space-y-4 pt-1">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs text-neutral-300 font-bold block">Taxa de Reabertura (Reopens)</span>
                      <span className="text-[10px] text-neutral-500 leading-none">Bugs validados reabertos posteriormente</span>
                    </div>
                    <span className="text-xl font-mono font-black text-red-400">
                      {filteredBugs.reduce((acc, b) => acc + (b.reopenCount || 0), 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs text-neutral-300 font-bold block">Resolução sem Responsável</span>
                      <span className="text-[10px] text-neutral-500 leading-none block">Bugs novos pendentes de desenvolvedores</span>
                    </div>
                    <span className="text-xl font-mono font-black text-yellow-400">
                      {filteredBugs.filter(b => !b.ownerId && b.status !== "validated").length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AI REPORT */}
      {activeTab === "ai_report" && (
        <div className="space-y-5">
          <div className="fq-analytics-panel">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/[0.06] pb-4 mb-6">
              <div>
                <h3 className="fq-section-title !mb-0">
                  <Brain className="w-5 h-5 text-neutral-400" /> AI Report Executivo
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Relatório de QA para gestores com base em métricas agregadas — sem envio da lista completa de bugs.
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAiReport(true)}
                className="fq-btn-primary text-xs"
              >
                <Sparkles className="w-4 h-4" />
                Gerar AI Report
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="fq-metric-card flex-col items-start !gap-1">
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Total</span>
                <span className="text-2xl font-mono font-bold text-neutral-100">{reportMetrics?.totals.bugs ?? 0}</span>
              </div>
              <div className="fq-metric-card flex-col items-start !gap-1">
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Abertos</span>
                <span className="text-2xl font-mono font-bold text-orange-400">{reportMetrics?.totals.open ?? 0}</span>
              </div>
              <div className="fq-metric-card flex-col items-start !gap-1">
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Validados</span>
                <span className="text-2xl font-mono font-bold text-emerald-400">{reportMetrics?.totals.validated ?? 0}</span>
              </div>
              <div className="fq-metric-card flex-col items-start !gap-1">
                <span className="text-[10px] font-mono text-neutral-500 uppercase">Últimos 7 dias</span>
                <span className="text-2xl font-mono font-bold text-blue-400">+{reportMetrics?.last7Days.created ?? 0}</span>
              </div>
            </div>

            <div className="fq-empty-state py-12">
              <Brain className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h4 className="text-neutral-300 font-semibold">Relatório executivo em Markdown</h4>
              <p className="text-neutral-500 text-xs max-w-lg mx-auto mt-1 leading-relaxed">
                O sistema agrega severidade, status, squad, tempo médio de resolução, tendências e
                categorias antes de enviar à IA. O resultado inclui Resumo Executivo, Gargalos,
                Tendências e Próximas Ações.
              </p>
              <button
                type="button"
                onClick={() => openAiReport(true)}
                className="fq-btn-secondary text-xs mt-4"
              >
                Abrir relatório em modal
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

      {/* RAPID CADASTRO BUG MODAL CREATE */}
      <AnimatePresence>
        {isBugModalOpen && (
          <div className="fq-modal-overlay">
            <motion.div 
              ref={bugCreateDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="bug-create-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fq-modal fq-modal--lg fq-modal--tall h-[88vh]"
            >
              {/* Header */}
              <div className="fq-modal-header !mb-0 shrink-0">
                <h3 id="bug-create-modal-title" className="fq-modal-title">
                  <Sparkles className="w-5 h-5 text-neutral-400" /> Relato Rápido e Inteligente de Incidente
                </h3>
                <button 
                  onClick={closeBugCreateModal}
                  className="fq-btn-icon"
                  aria-label="Fechar"
                >
                  X
                </button>
              </div>

              {/* Form body container with internal scrolling */}
              <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 text-xs text-neutral-400">
                {formError && (
                  <div className="fq-alert-error text-xs">
                    {formError}
                  </div>
                )}

                {/* Main information rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="fq-label fq-label--xs">
                        Título do Incidente *
                      </label>
                      <input
                        required
                        type="text"
                        className="fq-input"
                        placeholder="Ex: Erro 500 ao confirmar transação PIX"
                        value={bugTitle}
                        onChange={(e) => setBugTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="fq-label fq-label--xs">
                        DESCRIÇÃO
                      </label>
                      <textarea
                        rows={5}
                        className="fq-textarea font-sans"
                        placeholder="Insira os passos seguidos, logs de erro, comportamento observado de forma direta..."
                        value={bugDesc}
                        onChange={(e) => setBugDesc(e.target.value)}
                      />
                    </div>

                    {/* AI Assistants Trigger panel buttons removed as requested */}

                    {/* AI Prompt suggestions notification feedback boxes */}
                    {aiSuggestions && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-red-950/10 border border-red-500/25 rounded-md text-[11px] leading-relaxed text-neutral-300"
                      >
                        <span className="font-mono font-bold text-red-400 block uppercase mb-1">🎯 Análise Tática IA Inteligente:</span>
                        {aiSuggestions.explanation}
                      </motion.div>
                    )}

                    {duplicateAlert && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 border rounded-md text-[11px] leading-relaxed ${
                          duplicateAlert.isDuplicate 
                            ? "bg-yellow-950/20 border-yellow-500/30 text-yellow-400" 
                            : "bg-green-950/10 border-green-500/20 text-green-400"
                        }`}
                      >
                        <span className="font-mono font-bold block uppercase mb-1">🚨 Auditoria Anti-Duplicação:</span>
                        {duplicateAlert.explanation} (Confiança: {duplicateAlert.confidenceScore}%)
                      </motion.div>
                    )}
                  </div>

                  {/* Form right metadata panel columns */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="fq-label fq-label--xs">
                          Criticidade (Severity)
                        </label>
                        <select
                          value={bugCrit}
                          onChange={(e) => setBugCrit(e.target.value as SeverityLevel)}
                          className="fq-input font-bold"
                        >
                          <option value="blocker">🚨 BLOCKER</option>
                          <option value="critical">🔴 CRÍTICO</option>
                          <option value="high">🟠 ALTO</option>
                          <option value="medium">🟡 MÉDIO</option>
                          <option value="low">🔵 BAIXO</option>
                        </select>
                      </div>

                      <div>
                        <label className="fq-label fq-label--xs">
                          Ambiente Afetado
                        </label>
                        <select
                          value={bugEnv}
                          onChange={(e) => setBugEnv(e.target.value as any)}
                          className="fq-input font-bold"
                        >
                          <option value="production">PROD</option>
                          <option value="homologation">HMG</option>
                          <option value="dev">DEV</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="fq-label fq-label--xs">
                          Tipo de Ocorrência
                        </label>
                        <select
                          value={bugType}
                          onChange={(e) => setBugType(e.target.value as BugType)}
                          className="fq-select"
                        >
                          <option value="bug">🐞 BUG</option>
                          <option value="improvement">⚡ MELHORIA</option>
                          <option value="ui_adjustment">🎨 AJUSTE VISUAL</option>
                          <option value="performance">🚀 PERFORMANCE</option>
                          <option value="security">🔒 SEGURANÇA</option>
                        </select>
                      </div>

                      <div>
                        <label className="fq-label fq-label--xs">
                          Prioridade Operacional
                        </label>
                        <select
                          value={bugPriority}
                          onChange={(e) => setBugPriority(e.target.value as BugPriority)}
                          className="fq-select"
                        >
                          <option value="immediate">IMEDIATA</option>
                          <option value="high">ALTA</option>
                          <option value="medium">MÉDIA</option>
                          <option value="low">BAIXA</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="fq-label fq-label--xs">
                        URL Relacionada
                      </label>
                      <input
                        type="url"
                        className="fq-input font-mono text-[11px]"
                        placeholder="https://example.com/checkout"
                        value={bugUrl}
                        onChange={(e) => setBugUrl(e.target.value)}
                      />
                    </div>

                    {/* Evidência: upload ou link */}
                    <div>
                      <label className="fq-label fq-label--xs">
                        Evidência do Bug (imagem ou link)
                      </label>

                      <input
                        type="url"
                        className="fq-input font-mono text-[11px] mb-2"
                        placeholder="https://drive.google.com/... ou link da imagem"
                        value={bugEvidenceLink}
                        onChange={(e) => {
                          setBugEvidenceLink(e.target.value);
                          if (e.target.value.trim()) setBugEvidence(null);
                        }}
                      />

                      <div className="fq-upload-zone space-y-2">
                        <Upload className="w-6 h-6 text-neutral-500 mx-auto" />
                        <span className="block text-[10px] font-semibold text-neutral-400">Ou envie imagem (PNG/JPG, máx. 2MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {(bugEvidence || bugEvidenceLink.trim()) && (
                        <div className="fq-attachment-chip">
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          <span className="text-[10px] font-mono text-neutral-400 uppercase truncate">
                            {bugEvidence
                              ? "Imagem anexada"
                              : `Link: ${bugEvidenceLink.trim()}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setBugEvidence(null);
                              setBugEvidenceLink("");
                            }}
                            className="ml-auto text-[10px] font-mono text-red-400 hover:underline cursor-pointer shrink-0"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Drag and drop prototype figma uploader file picker block */}
                    <div>
                      <label className="fq-label fq-label--xs fq-label--inline justify-between">
                        <span>Imagem de Protótipo / Como deveria ser (Opcional)</span>
                        <span className="text-[8px] tracking-wide text-neutral-500 uppercase">[Figma Matcher]</span>
                      </label>
                      <div className="fq-upload-zone space-y-2">
                        <Upload className="w-6 h-6 text-neutral-500 mx-auto opacity-70" />
                        <span className="block text-[10px] font-semibold text-neutral-400">Arraste a referência do protótipo Figma correto</span>
                        <span className="block text-[9px] text-neutral-500 font-mono leading-none">Apenas PNG/JPG com menos de 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePrototypeUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {bugPrototype && (
                        <div className="fq-attachment-chip">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-[10px] font-mono text-neutral-400 uppercase">Protótipo anexado</span>
                          <button
                            type="button"
                            onClick={() => setBugPrototype(null)}
                            className="ml-auto text-[10px] font-mono text-red-400 hover:underline cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit footer links controls */}
              <div className="fq-modal-footer">
                <button
                  type="button"
                  onClick={closeBugCreateModal}
                  className="fq-btn-ghost text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleReportBug}
                  disabled={formSubmitting || !bugTitle.trim()}
                  className="fq-btn-primary"
                >
                  {formSubmitting ? "Registrando erro..." : "Reportar Incidente"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TICKET GRANULAR DEEP INSPECTOR MODAL */}
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
