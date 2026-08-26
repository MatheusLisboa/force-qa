import React, { useEffect, useState } from "react";
import { joinWarRoom } from "../lib/services";
import { subscribeWarRooms, subscribeAllBugs, subscribeProjects, subscribeAllBoardViews, DASHBOARD_BUGS_LIMIT } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { WarRoom, Bug, Project, BoardView } from "../types";
import { 
  Radio, 
  Activity, 
  AlertOctagon, 
  Clock, 
  ShieldAlert, 
  Layers, 
  ExternalLink, 
  CheckCircle,
  TrendingUp,
  User,
  Share2,
  UserPlus,
  Key,
  Download,
  LayoutGrid,
  Search
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { RoomStatusBadge, RoomTypeBadge } from "./BugBadges";
import { canManageSpaces as roleCanManageSpaces } from "../lib/permissions";
import { shortId } from "../lib/format";
import { CreateWarRoomModal } from "./CreateWarRoomModal";
import { CreateProjectModal } from "./CreateProjectModal";
import { AdminUsersModal } from "./AdminUsersModal";

interface DashboardProps {
  onSelectRoom: (roomId: string) => void;
  onOpenAdminPage?: (path: "/admin/board-views", projectId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectRoom, onOpenAdminPage }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allBoardViews, setAllBoardViews] = useState<BoardView[]>([]);
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [selectedDashboardRoomId, setSelectedDashboardRoomId] = useState<string>("all");
  const [myCardsOnly, setMyCardsOnly] = useState(false);
  const [isWarRoomModalOpen, setIsWarRoomModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAdminUsersModalOpen, setIsAdminUsersModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [enterRoomIdInput, setEnterRoomIdInput] = useState("");
  const [enteringRoomLoading, setEnteringRoomLoading] = useState(false);
  const [enterRoomError, setEnterRoomError] = useState("");
  const [enterRoomSuccess, setEnterRoomSuccess] = useState("");
  const [spaceQuery, setSpaceQuery] = useState("");

  const handleEnterRoomById = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = enterRoomIdInput.trim();
    if (!inputVal) return;

    setEnteringRoomLoading(true);
    setEnterRoomError("");
    setEnterRoomSuccess("");

    try {
      const roomId = await joinWarRoom(inputVal);
      setEnterRoomSuccess("Sala desbloqueada. Abrindo o Kanban...");
      setEnterRoomIdInput("");
      onSelectRoom(roomId);
    } catch (err: any) {
      console.error(err);
      setEnterRoomError(err.message || "Erro de localização.");
    } finally {
      setEnteringRoomLoading(false);
    }
  };

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

  // Compute stats metrics dynamically
  const filteredBugs = (
    selectedDashboardRoomId === "all"
      ? allBugs
      : allBugs.filter(b => b.warRoomId === selectedDashboardRoomId)
  ).filter((b) => !myCardsOnly || b.ownerId === profile?.id);

  const bugsCrit = {
    blocker: filteredBugs.filter(b => b.criticism === "blocker" && b.status !== "validated").length,
    critical: filteredBugs.filter(b => b.criticism === "critical" && b.status !== "validated").length,
    high: filteredBugs.filter(b => b.criticism === "high" && b.status !== "validated").length,
    medium: filteredBugs.filter(b => b.criticism === "medium" && b.status !== "validated").length,
    low: filteredBugs.filter(b => b.criticism === "low" && b.status !== "validated").length,
  };

  const bugsStatus = {
    open: filteredBugs.filter(b => b.status !== "validated").length,
    resolved: filteredBugs.filter(b => b.status === "validated").length,
    validating: filteredBugs.filter(b => b.status === "ready_for_qa").length,
  };

  // Calculate average resolution duration in minutes
  const validatedBugs = filteredBugs.filter(b => b.status === "validated" && b.resolvedAt && b.createdAt);
  let averageResolutionTimeStr = "--";
  if (validatedBugs.length > 0) {
    const totalDurationMs = validatedBugs.reduce((acc, b) => {
      const start = new Date(b.createdAt).getTime();
      const end = new Date(b.resolvedAt).getTime();
      return acc + (end - start);
    }, 0);
    const avgMinutes = Math.round(totalDurationMs / validatedBugs.length / 60000);
    averageResolutionTimeStr = avgMinutes > 60 
      ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`
      : `${avgMinutes} min`;
  }

  // Developer with most active tasks
  const devTaskCount: { [name: string]: number } = {};
  filteredBugs.forEach((b) => {
    if (b.status !== "validated" && b.ownerName) {
      devTaskCount[b.ownerName] = (devTaskCount[b.ownerName] || 0) + 1;
    }
  });
  let topDevName = "Nenhum";
  let topDevCount = 0;
  Object.entries(devTaskCount).forEach(([name, count]) => {
    if (count > topDevCount) {
      topDevCount = count;
      topDevName = name;
    }
  });

  // Filter displayed War Rooms: RLS already scopes to membership (admins see all)
  const displayedRooms = warRooms;

  const spaceQueryNorm = spaceQuery.trim().toLowerCase();
  const matchesSpaceQuery = (...values: Array<string | undefined>) =>
    !spaceQueryNorm ||
    values.some((value) => (value || "").toLowerCase().includes(spaceQueryNorm));

  const displayedWarRooms = displayedRooms
    .filter((r) => (r.roomType || "war_room") === "war_room")
    .filter((r) => matchesSpaceQuery(r.name, r.project, r.squad, r.id));

  const displayedProjects = projects.filter((p) =>
    matchesSpaceQuery(p.name, p.squad, p.warRoomId)
  );

  const viewCountByProject = allBoardViews.reduce<Record<string, number>>((acc, view) => {
    if (view.projectId && view.isActive) {
      acc[view.projectId] = (acc[view.projectId] || 0) + 1;
    }
    return acc;
  }, {});

  const canManageSpaces = roleCanManageSpaces(profile?.role);

  const copyShareLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const relativeUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(relativeUrl);
    toast("Link copiado.", { kind: "success" });
  };

  const renderSpaceCard = (room: WarRoom) => {
    const activeRoomBugs = allBugs.filter((b) => b.warRoomId === room.id);
    const roomBlocker = activeRoomBugs.filter(
      (b) => b.criticism === "blocker" && b.status !== "validated"
    ).length;
    const roomTotalOpen = activeRoomBugs.filter((b) => b.status !== "validated").length;
    const isBoard = room.roomType === "board";

    return (
      <div
        key={room.id}
        onClick={() => onSelectRoom(room.id)}
        className="group fq-card-interactive"
      >
        <div>
          <div className="flex justify-between items-start gap-3">
            <h4
              className="text-[15px] font-semibold text-neutral-100 tracking-tight truncate max-w-[200px]"
              title={room.name}
            >
              {room.name}
            </h4>
            {isBoard ? (
              <RoomTypeBadge type="board" />
            ) : (
              <RoomStatusBadge status={room.status} />
            )}
          </div>

          <div className="mt-2 text-[12px] text-neutral-500 flex items-center gap-1.5">
            <span className="text-neutral-400 select-all bg-white/[0.04] px-1.5 py-0.5 rounded-md border border-white/[0.06]" title={room.id}>
              {shortId(room.id)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2.5 text-[13px] text-neutral-500">
            <span>
              {room.project}
            </span>
            <span className="text-neutral-700">·</span>
            <span>
              {room.squad}
            </span>
          </div>

          {!isBoard && room.date && (
            <div className="mt-1.5 text-[12px] text-neutral-500">
              {room.date}
              {room.periodEnd ? ` → ${room.periodEnd}` : ""}
            </div>
          )}

          <p className="text-[13px] text-neutral-500 mt-3 line-clamp-2 leading-relaxed" title={room.description}>
            {room.description ||
              (isBoard
                ? "Board permanente de acompanhamento de qualidade."
                : "Sem descrição.")}
          </p>
        </div>

        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <div className="flex gap-5">
            <div>
              <span className="block text-[11px] text-neutral-500">Abertos</span>
              <span className={`text-[15px] font-semibold tabular-nums ${roomTotalOpen > 0 ? "text-neutral-100" : "text-neutral-600"}`}>
                {roomTotalOpen}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-500">Falta QA</span>
              <span
                className={`text-[15px] font-semibold tabular-nums ${
                  activeRoomBugs.filter((b) => b.status === "ready_for_qa").length > 0
                    ? "text-amber-400"
                    : "text-neutral-600"
                }`}
              >
                {activeRoomBugs.filter((b) => b.status === "ready_for_qa").length}
              </span>
            </div>
            {roomBlocker > 0 && (
              <div>
                <span className="block text-[11px] text-red-400/80">Blocker</span>
                <span className="text-[15px] font-semibold text-red-400 tabular-nums">{roomBlocker}</span>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 items-center">
            <button
              onClick={(e) => copyShareLink(room.id, e)}
              className="fq-btn-icon !p-1.5"
              title="Compartilhar Link"
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

  const renderProjectCard = (proj: Project) => {
    const activeRoomBugs = allBugs.filter((b) => b.warRoomId === proj.warRoomId);
    const roomBlocker = activeRoomBugs.filter(
      (b) => b.criticism === "blocker" && b.status !== "validated"
    ).length;
    const roomTotalOpen = activeRoomBugs.filter((b) => b.status !== "validated").length;
    const viewCount = viewCountByProject[proj.id] || 0;

    return (
      <div
        key={proj.id}
        onClick={() => onSelectRoom(proj.warRoomId)}
        className="group fq-card-interactive"
      >
        <div>
          <div className="flex justify-between items-start gap-3">
            <h4
              className="text-[15px] font-semibold text-neutral-100 tracking-tight truncate max-w-[200px]"
              title={proj.name}
            >
              {proj.name}
            </h4>
            <RoomTypeBadge type="board" permanent />
          </div>

          <div className="mt-2 text-[12px] text-neutral-500 flex items-center gap-1.5">
            <span className="text-neutral-400 select-all bg-white/[0.04] px-1.5 py-0.5 rounded-md border border-white/[0.06]" title={proj.warRoomId}>
              {shortId(proj.warRoomId)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2.5 text-[13px] text-neutral-500">
            <span>{proj.squad}</span>
            <span className="text-neutral-700">·</span>
            <span>{viewCount} {viewCount === 1 ? "view" : "views"}</span>
          </div>

          <p className="text-[13px] text-neutral-500 mt-3 line-clamp-2 leading-relaxed" title={proj.description}>
            {proj.description || "Projeto com Kanban e visualizações configuráveis."}
          </p>
        </div>

        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <div className="flex gap-5">
            <div>
              <span className="block text-[11px] text-neutral-500">Abertos</span>
              <span className={`text-[15px] font-semibold tabular-nums ${roomTotalOpen > 0 ? "text-neutral-100" : "text-neutral-600"}`}>
                {roomTotalOpen}
              </span>
            </div>
            {roomBlocker > 0 && (
              <div>
                <span className="block text-[11px] text-red-400/80">Blocker</span>
                <span className="text-[15px] font-semibold text-red-400 tabular-nums">{roomBlocker}</span>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 items-center">
            {profile?.role === "admin" && onOpenAdminPage && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAdminPage("/admin/board-views", proj.id);
                }}
                className="fq-btn-secondary !text-[10px] !py-1 !px-2 font-mono"
                title="Gerenciar views do projeto"
              >
                VIEWS
              </button>
            )}
            <button
              onClick={(e) => copyShareLink(proj.warRoomId, e)}
              className="fq-btn-icon !p-1.5"
              title="Compartilhar Link"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-neutral-500 group-hover:text-neutral-300 transition flex items-center gap-1">
              ABRIR <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleExportCSV = () => {
    // Determine the name of the file
    let filename = "relatorio_geral_warrooms.csv";
    let reportTitle = "Relatorio Consolidado de Incidentes - Todas as WarRooms";
    
    let scopeRoom: WarRoom | undefined = undefined;
    if (selectedDashboardRoomId !== "all") {
      scopeRoom = warRooms.find(r => r.id === selectedDashboardRoomId);
      if (scopeRoom) {
        filename = `relatorio_warroom_${scopeRoom.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`;
        reportTitle = `Relatorio Operacional - WarRoom: ${scopeRoom.name}`;
      }
    }

    // Build the csv rows
    const csvRows: string[][] = [];

    // Header Metadata
    csvRows.push([reportTitle]);
    csvRows.push([`Gerado em: ${new Date().toLocaleString()}`]);
    if (scopeRoom) {
      csvRows.push([`ID da War Room: ${scopeRoom.id}`]);
      csvRows.push([`Projeto: ${scopeRoom.project}`]);
      csvRows.push([`Squad Responsavel: ${scopeRoom.squad}`]);
      csvRows.push([`Status: ${scopeRoom.status === "active" ? "ATIVA" : "ARQUIVADA"}`]);
      csvRows.push([`Data de Criacao: ${scopeRoom.createdAt ? new Date(scopeRoom.createdAt).toLocaleString() : "N/A"}`]);
    }
    csvRows.push([]); // Empty row separator

    // Metric Summary section
    csvRows.push(["--- SUMARIO DE METRICAS ---"]);
    csvRows.push(["Metrica", "Valor"]);
    csvRows.push(["Blockers Ativos", bugsCrit.blocker.toString()]);
    csvRows.push(["Criticos Ativos", bugsCrit.critical.toString()]);
    csvRows.push(["Altos Ativos", bugsCrit.high.toString()]);
    csvRows.push(["Medios Ativos", bugsCrit.medium.toString()]);
    csvRows.push(["Baixos Ativos", bugsCrit.low.toString()]);
    csvRows.push(["Total Bugs Abertos", bugsStatus.open.toString()]);
    csvRows.push(["Total Bugs Validados/Resolvidos", bugsStatus.resolved.toString()]);
    csvRows.push(["Bugs Prontos p/ Validar (Ready For QA)", bugsStatus.validating.toString()]);
    csvRows.push(["Tempo Medio de Resolucao", averageResolutionTimeStr]);
    csvRows.push(["Dev Mais Sobrecarregado", topDevName === "Nenhum" ? "--" : `${topDevName} (${topDevCount} bugs)`]);
    csvRows.push([]); // Empty row separator

    // Bugs Detail list
    csvRows.push(["--- DETALHAMENTO DE CARDS ---"]);
    csvRows.push([
      "ID do Bug",
      "Titulo",
      "Status",
      "Criticidade / Severidade",
      "Tipo",
      "Ambiente",
      "Responsavel (Owner)",
      "Criado por",
      "Total de Reaberturas",
      "Link de Evidencia",
      "Link de Prototipo (Figma)",
      "Criado em",
      "Resolvido em",
      "Fracao da URL Afetada",
      "Versao do Build"
    ]);

    filteredBugs.forEach((bug) => {
      csvRows.push([
        bug.id,
        bug.title,
        bug.status,
        bug.criticism,
        bug.type || "N/A",
        bug.environment || "N/A",
        bug.ownerName || "Nao Atribuido",
        bug.createdByName || "Sistema",
        (bug.reopenCount || 0).toString(),
        bug.evidenceUrl || "N/A",
        bug.prototypeUrl || "N/A",
        bug.createdAt ? new Date(bug.createdAt).toLocaleString() : "N/A",
        bug.resolvedAt ? new Date(bug.resolvedAt).toLocaleString() : "Operando",
        bug.affectedUrl || "N/A",
        bug.buildVersion || "N/A"
      ]);
    });

    // Convert CSV rows into formatted string, escaping double quotes
    const csvContent = csvRows
      .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    // Standard DOM chemical injection to force triggers
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <p className="fq-page-eyebrow flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-teal-400" /> Painel
          </p>
          <h1 className="fq-page-title mt-1">
            Suas salas e projetos
          </h1>
          <p className="text-neutral-500 text-sm mt-1">
            Abra uma war room por período ou um board permanente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {profile?.role === "admin" && (
            <>
              <button
                onClick={() => setIsAdminUsersModalOpen(true)}
                className="fq-btn-secondary text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Usuários
              </button>
              {onOpenAdminPage && (
                <button
                  onClick={() => onOpenAdminPage("/admin/board-views")}
                  className="fq-btn-secondary text-sm"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Views
                </button>
              )}
            </>
          )}

          {canManageSpaces && (
            <>
              <button
                onClick={() => setIsWarRoomModalOpen(true)}
                className="fq-btn-primary text-sm"
              >
                <Clock className="w-4 h-4" />
                Nova war room
              </button>
              <button
                onClick={() => setIsProjectModalOpen(true)}
                className="fq-btn-secondary text-sm"
              >
                <LayoutGrid className="w-4 h-4" />
                Novo projeto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Selection for Admin Panel */}
      {profile?.role === "admin" && (
        <div className="fq-panel flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="fq-section-title !mb-1">
              <Activity className="w-4 h-4 text-neutral-500" />
              Filtro do painel
            </h3>
            <p className="text-neutral-500 text-xs">
              Indicadores consolidados ou filtrados por uma sala/projeto.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-[320px] md:min-w-[440px]">
            <select
              value={selectedDashboardRoomId}
              onChange={(e) => setSelectedDashboardRoomId(e.target.value)}
              className="fq-select flex-1 text-xs font-mono"
            >
              <option value="all">Todos os cards (consolidado)</option>
              {warRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomType === "board" ? "📋" : "🛡️"} {room.name} ({room.project})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMyCardsOnly((v) => !v)}
              className={`fq-btn-ghost justify-center whitespace-nowrap text-sm ${
                myCardsOnly ? "!bg-white/[0.08] !border-white/20 text-neutral-100" : ""
              }`}
              title="Filtrar métricas pelos cards atribuídos a você"
            >
              {myCardsOnly ? "Meus cards ✓" : "Meus cards"}
            </button>
            <button
              onClick={handleExportCSV}
              className="fq-btn-ghost justify-center whitespace-nowrap text-sm"
              title="Exportar dados selecionados para formato CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
            </button>
          </div>
        </div>
      )}

      {allBugs.length >= DASHBOARD_BUGS_LIMIT && (
        <p className="text-amber-400/90 text-xs font-mono">
          Métricas do painel usam os {DASHBOARD_BUGS_LIMIT} cards mais recentes.
        </p>
      )}

      {/* Grid counters */}
      {profile?.role === "admin" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="fq-metric-card">
            <div className="fq-metric-icon bg-red-500/10 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[12px] text-neutral-500 font-mono">Blockers & Críticos</span>
              <h2 className="text-xl font-semibold text-neutral-100 tabular-nums mt-0.5">
                {bugsCrit.blocker + bugsCrit.critical}
              </h2>
            </div>
            {bugsCrit.blocker > 0 && (
              <div className="absolute top-2 right-2 bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium">
                ALERTA
              </div>
            )}
          </div>

          <div className="fq-metric-card">
            <div className="fq-metric-icon bg-blue-500/10 text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[12px] text-neutral-500 font-mono">Total Bugs Abertos</span>
              <h2 className="text-xl font-semibold text-neutral-100 tabular-nums mt-0.5">{bugsStatus.open}</h2>
            </div>
          </div>

          <div className="fq-metric-card">
            <div className="fq-metric-icon bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[12px] text-neutral-500 font-mono">Tempo Médio Resolução</span>
              <h2 className="text-xl font-semibold text-neutral-100 mt-0.5">{averageResolutionTimeStr}</h2>
            </div>
          </div>

          <div className="fq-metric-card">
            <div className="fq-metric-icon bg-violet-500/10 text-violet-400">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[12px] text-neutral-500 font-mono">Dev Mais Sobrecarregado</span>
              <h2 className="text-[15px] font-semibold text-neutral-100 mt-0.5 truncate" title={topDevName}>
                {topDevName === "Nenhum" ? "--" : `${topDevName} (${topDevCount})`}
              </h2>
            </div>
          </div>
        </div>
      )}

      {/* Mid Visual Graph Analytics Panel (Custom high-end SVG bars) */}
      {profile?.role === "admin" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 fq-panel p-5">
            <h3 className="fq-section-title">
              <Activity className="w-4 h-4 text-neutral-500" />
              Vulnerabilidades por severidade (não validados)
            </h3>
            
            <div className="space-y-4">
              {/* Blocker bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-500 font-mono mb-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" /> BLOCKERS</span>
                  <span className="font-bold text-neutral-500">{bugsCrit.blocker} bugs</span>
                </div>
                <div className="fq-progress-track">
                  <div className="h-full bg-red-600 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.blocker / (bugsStatus.open || 1)) * 100))}%` }} />
                </div>
              </div>

              {/* Critical bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-500 font-mono mb-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> CRÍTICOS</span>
                  <span className="font-bold text-neutral-500">{bugsCrit.critical} bugs</span>
                </div>
                <div className="fq-progress-track">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.critical / (bugsStatus.open || 1)) * 100))}%` }} />
                </div>
              </div>

              {/* High bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-500 font-mono mb-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> ALTOS</span>
                  <span className="font-bold text-neutral-500">{bugsCrit.high} bugs</span>
                </div>
                <div className="fq-progress-track">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.high / (bugsStatus.open || 1)) * 100))}%` }} />
                </div>
              </div>

              {/* Medium bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-500 font-mono mb-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> MÉDIOS</span>
                  <span className="font-bold text-neutral-500">{bugsCrit.medium} bugs</span>
                </div>
                <div className="fq-progress-track">
                  <div className="h-full bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.medium / (bugsStatus.open || 1)) * 100))}%` }} />
                </div>
              </div>

              {/* Low bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-500 font-mono mb-1.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> BAIXOS</span>
                  <span className="font-bold text-neutral-500">{bugsCrit.low} bugs</span>
                </div>
                <div className="fq-progress-track">
                  <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, (bugsCrit.low / (bugsStatus.open || 1)) * 100))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Status ring or breakdown */}
          <div className="fq-panel p-5 flex flex-col justify-between">
            <div>
              <h3 className="fq-section-title !mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                {selectedDashboardRoomId === "all" ? "Taxa de Resolução Global" : "Taxa de Resolução da Sala"}
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed mb-6">
                Razão de eficácia de bugs validados e finalizados em relação ao total de relatos nesta seleção.
              </p>
            </div>

            <div className="flex items-center justify-center p-4">
              <div className="relative flex items-center justify-center w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="50" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="10" />
                  <circle cx="64" cy="64" r="50" fill="transparent" stroke="#22c55e" strokeWidth="10" 
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - (bugsStatus.resolved / (filteredBugs.length || 1)))}`}
                    className="transition-all duration-1000 ease-out" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-black text-white">
                    {Math.round((bugsStatus.resolved / (filteredBugs.length || 1)) * 100)}%
                  </span>
                  <span className="text-[10px] uppercase font-mono text-neutral-500">Resolvidos</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-neutral-500 mt-4 border-t border-white/[0.04] pt-4">
              <div>
                <span className="text-[#22c55e] font-bold">{bugsStatus.resolved}</span> validados
              </div>
              <div>
                <span className="text-red-400 font-bold">{bugsStatus.open}</span> abertos
              </div>
              <div>
                total: <span className="text-white font-bold">{filteredBugs.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active War Rooms Grid List */}
      <div>
        {/* Code to enter a War Room by ID */}
        <div className="fq-panel mb-5 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="text-[13px] font-medium text-neutral-300 mb-2.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-teal-400" /> Buscar
            </h4>
            <input
              type="search"
              placeholder="Nome, projeto, squad ou ID"
              className="fq-input"
              value={spaceQuery}
              onChange={(e) => setSpaceQuery(e.target.value)}
            />
          </div>
          <div>
            <h4 className="text-[13px] font-medium text-neutral-300 mb-2.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-neutral-500" /> Abrir sala com acesso
            </h4>
            <form onSubmit={handleEnterRoomById} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Cole o ID de uma sala que você já pode ver"
                className="fq-input flex-1"
                value={enterRoomIdInput}
                onChange={(e) => setEnterRoomIdInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={enteringRoomLoading}
                className="fq-btn-primary"
              >
                {enteringRoomLoading ? "..." : "Entrar"}
              </button>
            </form>
            {enterRoomError && (
              <p className="text-red-400 text-[12px] mt-2">{enterRoomError}</p>
            )}
            {enterRoomSuccess && (
              <p className="text-emerald-400 text-[12px] mt-2">{enterRoomSuccess}</p>
            )}
          </div>
        </div>

        <h3 className="fq-section-title">
          <Clock className="w-4 h-4 text-neutral-500" /> War rooms ({displayedWarRooms.length})
        </h3>

        {loading ? (
          <div className="fq-empty-state mb-8">
            <div className="fq-spinner mx-auto mb-2" />
            <p className="text-neutral-500 text-[13px] font-mono">Carregando salas...</p>
          </div>
        ) : displayedWarRooms.length === 0 ? (
          <div className="fq-empty-state mb-8">
            <AlertOctagon className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <h4 className="text-neutral-200 font-medium text-[15px]">
              {spaceQuery ? "Nenhuma war room encontrada" : "Nenhuma war room ainda"}
            </h4>
            <p className="text-neutral-500 text-sm mt-1 max-w-sm mx-auto">
              {spaceQuery
                ? "Tente outro termo ou entre com o ID da sala."
                : "Crie uma war room ou cole um ID compartilhado acima."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {displayedWarRooms.map(renderSpaceCard)}
          </div>
        )}

        <h3 className="fq-section-title">
          <LayoutGrid className="w-4 h-4 text-neutral-500" /> Projetos ({displayedProjects.length})
        </h3>

        {loading ? null : displayedProjects.length === 0 ? (
          <div className="fq-empty-state">
            <LayoutGrid className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <h4 className="text-neutral-200 font-medium text-[15px]">Nenhum projeto cadastrado</h4>
            <p className="text-neutral-500 text-xs mt-1 max-w-sm mx-auto">
              {spaceQuery ? "Nenhum projeto corresponde à busca." : "Crie um projeto para ter um Kanban permanente."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedProjects.map(renderProjectCard)}
          </div>
        )}
      </div>

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

      <AnimatePresence>
        {isAdminUsersModalOpen && profile?.role === "admin" && (
          <AdminUsersModal
            open={isAdminUsersModalOpen}
            onClose={() => setIsAdminUsersModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
