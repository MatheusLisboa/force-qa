import React, { useEffect, useState, useRef, useCallback } from "react";
import { createWarRoom, createBoard, updateUserProfile, deleteUserProfile } from "../lib/services";
import { subscribeWarRooms, subscribeAllBugs, subscribeUsers, findWarRoomByIdOrName } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { WarRoom, Bug, SeverityLevel } from "../types";
import { 
  Radio, 
  Activity, 
  Plus, 
  AlertOctagon, 
  Server, 
  Clock, 
  ShieldAlert, 
  Layers, 
  ExternalLink, 
  CheckCircle,
  HelpCircle,
  TrendingUp,
  User,
  Share2,
  UserPlus,
  Key,
  Trash2,
  Edit2,
  Check,
  X,
  Download,
  LayoutGrid
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoleBadge, RoomStatusBadge, RoomTypeBadge } from "./BugBadges";
import { SeverityPicker } from "./SeverityPicker";
import { useModalA11y } from "../hooks/useModalA11y";

interface DashboardProps {
  onSelectRoom: (roomId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectRoom }) => {
  const { profile, adminCreateUser } = useAuth();
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [allBugs, setAllBugs] = useState<Bug[]>([]);
  const [selectedDashboardRoomId, setSelectedDashboardRoomId] = useState<string>("all");
  const [isWarRoomModalOpen, setIsWarRoomModalOpen] = useState(false);
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search by ID State
  const [enterRoomIdInput, setEnterRoomIdInput] = useState("");
  const [enteringRoomLoading, setEnteringRoomLoading] = useState(false);
  const [enterRoomError, setEnterRoomError] = useState("");
  const [enterRoomSuccess, setEnterRoomSuccess] = useState("");

  // User Management State
  const [isAdminUsersModalOpen, setIsAdminUsersModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "qa" | "developer" | "dba" | "viewer" | "devops" | "scrum_master">("developer");
  const [newUserSquad, setNewUserSquad] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreationError, setUserCreationError] = useState("");
  const [userCreationSuccess, setUserCreationSuccess] = useState("");
  const [usersList, setUsersList] = useState<any[]>([]);

  // User inline editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingRole, setEditingRole] = useState<any>("developer");
  const [editingSquad, setEditingSquad] = useState("");

  const warRoomDialogRef = useRef<HTMLDivElement>(null);
  const boardDialogRef = useRef<HTMLDivElement>(null);
  const adminDialogRef = useRef<HTMLDivElement>(null);

  const closeWarRoomModal = useCallback(() => setIsWarRoomModalOpen(false), []);
  const closeBoardModal = useCallback(() => setIsBoardModalOpen(false), []);
  const closeAdminUsersModal = useCallback(() => {
    setIsAdminUsersModalOpen(false);
    setUserCreationError("");
    setUserCreationSuccess("");
  }, []);

  useModalA11y(isWarRoomModalOpen, closeWarRoomModal, warRoomDialogRef);
  useModalA11y(isBoardModalOpen, closeBoardModal, boardDialogRef);
  useModalA11y(isAdminUsersModalOpen, closeAdminUsersModal, adminDialogRef);

  // Live real-time stream subscription for System Users
  useEffect(() => {
    if (profile?.role === "admin") {
      return subscribeUsers((list) => setUsersList(list));
    }
  }, [profile]);

  const handleAdminCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim() || !newUserSquad.trim()) {
      setUserCreationError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    
    if (newUserPassword.length < 6) {
      setUserCreationError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setIsCreatingUser(true);
    setUserCreationError("");
    setUserCreationSuccess("");

    try {
      await adminCreateUser(
        newUserName.trim(),
        newUserEmail.trim(),
        newUserPassword,
        newUserRole,
        newUserSquad.trim()
      );
      setUserCreationSuccess(`Usuário ${newUserName.trim()} cadastrado com sucesso!`);
      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserSquad("");
    } catch (err: any) {
      console.error("Error creating user:", err);
      setUserCreationError(err.message || "Erro desconhecido ao cadastrar usuário.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleEnterRoomById = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = enterRoomIdInput.trim();
    if (!inputVal) return;

    setEnteringRoomLoading(true);
    setEnterRoomError("");
    setEnterRoomSuccess("");

    try {
      const room = await findWarRoomByIdOrName(inputVal);
      const roomId = room?.id;

      if (!roomId || !room) {
        throw new Error("Sala de Guerra não encontrada. Certifique-se de que o ID ou Nome está correto.");
      }

      const accessedStr = localStorage.getItem("accessed_rooms") || "[]";
      let accessedList: string[] = JSON.parse(accessedStr);
      if (!accessedList.includes(roomId)) {
        accessedList.push(roomId);
        localStorage.setItem("accessed_rooms", JSON.stringify(accessedList));
      }

      setEnterRoomSuccess("Canal destrancado operacionalmente!");
      setEnterRoomIdInput("");

      onSelectRoom(roomId);
    } catch (err: any) {
      console.error(err);
      setEnterRoomError(err.message || "Erro de localização.");
    } finally {
      setEnteringRoomLoading(false);
    }
  };

  const handleStartEdit = (usr: any) => {
    setEditingUserId(usr.id);
    setEditingName(usr.name || "");
    setEditingRole(usr.role || "developer");
    setEditingSquad(usr.squad || "");
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
  };

  const handleSaveEdit = async (userId: string) => {
    if (!editingName.trim() || !editingSquad.trim()) {
      setUserCreationError("Todos os campos de edição são obrigatórios.");
      return;
    }
    try {
      await updateUserProfile(userId, {
        name: editingName.trim(),
        role: editingRole,
        squad: editingSquad.trim(),
      });
      setEditingUserId(null);
    } catch (err: any) {
      console.error(err);
      setUserCreationError(err.message || "Erro ao atualizar usuário.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("ATENÇÃO: Deseja realmente remover este usuário do sistema? Esta ação removerá o perfil no banco de dados.")) {
      return;
    }
    try {
      await deleteUserProfile(userId);
    } catch (err: any) {
      console.error(err);
      setUserCreationError(err.message || "Erro ao deletar usuário.");
    }
  };

  // Form states for creating a new room
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [squad, setSquad] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SeverityLevel>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Live real-time stream subscription for War Rooms
  useEffect(() => {
    const unsubscribeRooms = subscribeWarRooms((rooms) => {
      setWarRooms(rooms);
      setLoading(false);
    });
    const unsubscribeBugs = subscribeAllBugs(setAllBugs);
    return () => {
      unsubscribeRooms();
      unsubscribeBugs();
    };
  }, []);

  // Compute stats metrics dynamically
  const activeRooms = warRooms.filter(r => r.status === "active").length;

  const filteredBugs = selectedDashboardRoomId === "all"
    ? allBugs
    : allBugs.filter(b => b.warRoomId === selectedDashboardRoomId);

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

  // Filter displayed War Rooms based on authenticated user access
  const accessedRoomsStr = localStorage.getItem("accessed_rooms") || "[]";
  let accessedRoomIds: string[] = [];
  try {
    accessedRoomIds = JSON.parse(accessedRoomsStr);
  } catch (err) {
    accessedRoomIds = [];
  }

  const displayedRooms = warRooms.filter((room) => {
    if (profile?.role === "admin") return true;
    if (room.createdBy === profile?.id) return true;
    if (accessedRoomIds.includes(room.id)) return true;
    return false;
  });

  const displayedWarRooms = displayedRooms.filter(
    (r) => (r.roomType || "war_room") === "war_room"
  );
  const displayedBoards = displayedRooms.filter((r) => r.roomType === "board");

  const canManageSpaces =
    profile?.role === "admin" ||
    profile?.role === "qa" ||
    profile?.role === "scrum_master";

  const copyShareLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const relativeUrl = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(relativeUrl);
    alert("Link de compartilhamento rápido copiado para a área de transferência!");
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

          <div className="mt-2 text-[11px] text-neutral-500 flex items-center gap-1.5 font-mono">
            <span>CHAVE:</span>
            <span className="text-neutral-400 select-all bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] text-[10px]">
              {room.id}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-2.5 text-[12px] text-neutral-500 font-mono">
            <span>
              PROJECT: <span className="text-neutral-300 font-medium">{room.project}</span>
            </span>
            <span>•</span>
            <span>
              SQUAD: <span className="text-neutral-300 font-medium">{room.squad}</span>
            </span>
          </div>

          {!isBoard && room.date && (
            <div className="mt-1.5 text-[11px] font-mono text-neutral-500">
              PERÍODO:{" "}
              <span className="text-neutral-400">
                {room.date}
                {room.periodEnd ? ` → ${room.periodEnd}` : ""}
              </span>
            </div>
          )}

          <p className="text-[13px] text-neutral-500 mt-3 line-clamp-2 leading-relaxed" title={room.description}>
            {room.description ||
              (isBoard
                ? "Board permanente de acompanhamento de qualidade."
                : "Nenhuma descrição operacional adicional foi especificada preliminarmente.")}
          </p>
        </div>

        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex justify-between items-center">
          <div className="flex gap-5">
            <div>
              <span className="block text-[11px] font-mono uppercase text-neutral-500">Abertos</span>
              <span className={`text-[15px] font-semibold tabular-nums ${roomTotalOpen > 0 ? "text-neutral-100" : "text-neutral-600"}`}>
                {roomTotalOpen}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-mono uppercase text-neutral-500">Falta QA</span>
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
                <span className="block text-[11px] font-mono uppercase text-red-400/80">BLOCKER</span>
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
            <span className="text-[11px] font-mono text-neutral-500 group-hover:text-neutral-300 transition flex items-center gap-1">
              ENTRAR <ExternalLink className="w-3 h-3" />
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
    csvRows.push(["--- DETALHAMENTO DE BUGS E INCIDENTES ---"]);
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

  const handleCreateWarRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManageSpaces) {
      setFormError("Permissão negada. Apenas administradores, QAs e Scrum Masters podem criar War Rooms.");
      return;
    }

    if (!name.trim() || !project.trim() || !squad.trim()) {
      setFormError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const roomId = await createWarRoom({
        name: name.trim(),
        project: project.trim(),
        squad: squad.trim(),
        date,
        periodEnd: periodEnd || undefined,
        description: description.trim(),
        severity,
        status: "active",
        roomType: "war_room",
        createdBy: profile?.id || "unknown",
        createdByName: profile?.name || "Anonymous Hunter",
      });

      setName("");
      setProject("");
      setSquad("");
      setDescription("");
      setPeriodEnd("");
      setSeverity("medium");
      setIsWarRoomModalOpen(false);
      onSelectRoom(roomId);
    } catch (err: any) {
      setFormError("Erro ao criar War Room: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManageSpaces) {
      setFormError("Permissão negada. Apenas administradores, QAs e Scrum Masters podem criar Boards.");
      return;
    }

    if (!name.trim() || !project.trim() || !squad.trim()) {
      setFormError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const boardId = await createBoard({
        name: name.trim(),
        project: project.trim(),
        squad: squad.trim(),
        description: description.trim(),
        severity: "medium",
        createdBy: profile?.id || "unknown",
        createdByName: profile?.name || "Anonymous Hunter",
      });

      setName("");
      setProject("");
      setSquad("");
      setDescription("");
      setIsBoardModalOpen(false);
      onSelectRoom(boardId);
    } catch (err: any) {
      setFormError("Erro ao criar Board: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <p className="fq-page-eyebrow font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-neutral-500" /> OPERATIONAL COMMAND STATUS
          </p>
          <h1 className="fq-page-title mt-1">
            Painel Central de QA
          </h1>
          <p className="text-neutral-500 text-[13px] mt-1">
            War Rooms por período e Boards permanentes de projetos e sistemas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {profile?.role === "admin" && (
            <button
              onClick={() => setIsAdminUsersModalOpen(true)}
              className="fq-btn-secondary text-xs font-mono"
            >
              <UserPlus className="w-4 h-4" />
              GERENCIAR USUÁRIOS
            </button>
          )}

          {canManageSpaces && (
            <>
              <button
                onClick={() => {
                  setFormError("");
                  setIsWarRoomModalOpen(true);
                }}
                className="fq-btn-primary text-xs font-mono"
              >
                <Clock className="w-4 h-4" />
                NOVA WAR ROOM
              </button>
              <button
                onClick={() => {
                  setFormError("");
                  setIsBoardModalOpen(true);
                }}
                className="fq-btn-secondary text-xs font-mono"
              >
                <LayoutGrid className="w-4 h-4" />
                NOVO BOARD
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
              CONTROLE DE FILTRO CENTRALIZADO
            </h3>
            <p className="text-neutral-500 text-xs">
              Visualize indicadores estratégicos de maneira consolidada (Geral) ou selecione um escopo individual por Sala de Guerra.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-[320px] md:min-w-[440px]">
            <select
              value={selectedDashboardRoomId}
              onChange={(e) => setSelectedDashboardRoomId(e.target.value)}
              className="fq-select flex-1 text-xs font-mono"
            >
              <option value="all">📊 TODOS OS INCIDENTES (Consolidado Geral)</option>
              {warRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomType === "board" ? "📋" : "🛡️"} {room.name} ({room.project})
                </option>
              ))}
            </select>
            <button
              onClick={handleExportCSV}
              className="fq-btn-ghost justify-center whitespace-nowrap text-[11px] font-mono font-bold"
              title="Exportar dados selecionados para formato CSV"
            >
              <Download className="w-3.5 h-3.5" />
              EXPORTAR RELATÓRIO
            </button>
          </div>
        </div>
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
              Vulnerabilidades por Severidade Geral (Sem Validar)
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
        <div className="fq-panel mb-5">
          <h4 className="text-[13px] font-medium text-neutral-400 mb-2.5 flex items-center gap-1.5 font-mono uppercase tracking-wider">
            <Key className="w-3.5 h-3.5 text-neutral-500" /> Acessar War Room ou Board via ID
          </h4>
          <form onSubmit={handleEnterRoomById} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Digite o ID (Ex: room-XXXXXX ou board-XXXXXX)"
              className="fq-input flex-1 font-mono text-[13px]"
              value={enterRoomIdInput}
              onChange={(e) => setEnterRoomIdInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={enteringRoomLoading}
              className="fq-btn-primary font-mono"
            >
              {enteringRoomLoading ? (
                <span className="fq-spinner !h-4 !w-4 !border-neutral-900 !border-t-transparent" />
              ) : (
                "LIBERAR ACESSO"
              )}
            </button>
          </form>
          {enterRoomError && (
            <p className="text-red-400 text-[12px] mt-2 font-mono">{enterRoomError}</p>
          )}
          {enterRoomSuccess && (
            <p className="text-emerald-400 text-[12px] mt-2 font-mono">{enterRoomSuccess}</p>
          )}
        </div>

        <h3 className="fq-section-title uppercase tracking-wide font-mono">
          <Clock className="w-4 h-4 text-neutral-500" /> War Rooms por Período ({displayedWarRooms.length})
        </h3>

        {loading ? (
          <div className="fq-empty-state mb-8">
            <div className="fq-spinner mx-auto mb-2" />
            <p className="text-neutral-500 text-[13px] font-mono">Sincronizando Banco de Dados...</p>
          </div>
        ) : displayedWarRooms.length === 0 ? (
          <div className="fq-empty-state mb-8">
            <AlertOctagon className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <h4 className="text-neutral-200 font-medium text-[15px]">Nenhuma War Room ativa</h4>
            <p className="text-neutral-500 text-xs mt-1 max-w-sm mx-auto">
              War Rooms concentram operações de QA por período específico. Crie uma nova ou entre via ID acima.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {displayedWarRooms.map(renderSpaceCard)}
          </div>
        )}

        <h3 className="fq-section-title uppercase tracking-wide font-mono">
          <LayoutGrid className="w-4 h-4 text-neutral-500" /> Boards Permanentes ({displayedBoards.length})
        </h3>

        {loading ? null : displayedBoards.length === 0 ? (
          <div className="fq-empty-state">
            <LayoutGrid className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
            <h4 className="text-neutral-200 font-medium text-[15px]">Nenhum board permanente</h4>
            <p className="text-neutral-500 text-xs mt-1 max-w-sm mx-auto">
              Boards são quadros permanentes para projetos e sistemas específicos. Use o botão &quot;NOVO BOARD&quot; para criar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedBoards.map(renderSpaceCard)}
          </div>
        )}
      </div>

      {/* Modal: Nova War Room */}
      <AnimatePresence>
        {isWarRoomModalOpen && (
          <div className="fq-modal-overlay">
            <motion.div 
              ref={warRoomDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="war-room-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fq-modal fq-modal--md"
            >
              <div className="fq-modal-header">
                <h3 id="war-room-modal-title" className="fq-modal-title">
                  <Clock className="w-5 h-5 text-neutral-400" /> Nova War Room
                </h3>
                <button 
                  onClick={closeWarRoomModal}
                  className="fq-btn-icon"
                  aria-label="Fechar"
                >
                  X
                </button>
              </div>

              <p className="text-xs text-neutral-500 font-mono mb-4">
                Operação concentrada por período específico (release, hotfix, incidente).
              </p>

              {formError && (
                <div className="fq-alert-error mb-4">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateWarRoom} className="space-y-4 text-sm text-neutral-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="fq-label">
                      Nome da War Room *
                    </label>
                    <input
                      required
                      type="text"
                      className="fq-input"
                      placeholder="Ex: WarRoom Release v2.4"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="fq-label">
                      Projeto / Sistema *
                    </label>
                    <input
                      required
                      type="text"
                      className="fq-input"
                      placeholder="Ex: App Android Checkout"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="fq-label">
                      Squad Principal *
                    </label>
                    <input
                      required
                      type="text"
                      className="fq-input"
                      placeholder="Ex: Squad Core-Payments"
                      value={squad}
                      onChange={(e) => setSquad(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="fq-label">
                      Data de Início *
                    </label>
                    <input
                      required
                      type="date"
                      className="fq-input"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="fq-label">
                    Data de Término (opcional)
                  </label>
                  <input
                    type="date"
                    className="fq-input"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>

                <div>
                  <label className="fq-label">
                    Descrição do Escopo
                  </label>
                  <textarea
                    rows={3}
                    className="fq-textarea"
                    placeholder="Contexto do incidente e escopo dos testes..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label className="fq-label">
                    Severidade Geral Prevista
                  </label>
                  <SeverityPicker value={severity} onChange={setSeverity} />
                </div>

                <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsWarRoomModalOpen(false)}
                    className="fq-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="fq-btn-primary"
                  >
                    {submitting ? "Criando..." : "Criar War Room"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Board */}
      <AnimatePresence>
        {isBoardModalOpen && (
          <div className="fq-modal-overlay">
            <motion.div 
              ref={boardDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="board-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fq-modal fq-modal--md"
            >
              <div className="fq-modal-header">
                <h3 id="board-modal-title" className="fq-modal-title">
                  <LayoutGrid className="w-5 h-5 text-neutral-400" /> Novo Board
                </h3>
                <button 
                  onClick={closeBoardModal}
                  className="fq-btn-icon"
                  aria-label="Fechar"
                >
                  X
                </button>
              </div>

              <p className="text-xs text-neutral-500 font-mono mb-4">
                Board permanente para acompanhamento contínuo de um projeto ou sistema.
              </p>

              {formError && (
                <div className="fq-alert-error mb-4">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateBoardSubmit} className="space-y-4 text-sm text-neutral-300">
                <div>
                  <label className="fq-label">
                    Nome do Board *
                  </label>
                  <input
                    required
                    type="text"
                    className="fq-input"
                    placeholder="Ex: Board Checkout Web"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="fq-label">
                      Projeto / Sistema *
                    </label>
                    <input
                      required
                      type="text"
                      className="fq-input"
                      placeholder="Ex: Portal Admin"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="fq-label">
                      Squad Responsável *
                    </label>
                    <input
                      required
                      type="text"
                      className="fq-input"
                      placeholder="Ex: Squad Core"
                      value={squad}
                      onChange={(e) => setSquad(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="fq-label">
                    Descrição
                  </label>
                  <textarea
                    rows={3}
                    className="fq-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setIsBoardModalOpen(false)}
                    className="fq-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="fq-btn-primary"
                  >
                    {submitting ? "Criando..." : "Criar Board"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin User Management Modal Overview */}
      <AnimatePresence>
        {isAdminUsersModalOpen && profile?.role === "admin" && (
          <div className="fq-modal-overlay">
            <motion.div 
              ref={adminDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-users-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fq-modal fq-modal--lg max-w-4xl max-h-[90vh] overflow-y-auto"
            >
              <div className="fq-modal-header">
                <h3 id="admin-users-modal-title" className="fq-modal-title">
                  <UserPlus className="w-5 h-5 text-neutral-400" /> Painel de Registro & Controle de Usuários
                </h3>
                <button 
                  onClick={closeAdminUsersModal}
                  className="fq-btn-ghost text-xs font-mono font-bold"
                  aria-label="Fechar"
                >
                  FECHAR (ESC)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-neutral-500">
                {/* Panel 1: Creation form */}
                <div className="space-y-4">
                  <div className="border-b border-white/[0.03] pb-2">
                    <h4 className="font-mono text-xs font-bold uppercase text-indigo-400 tracking-wider">
                      ➕ ADICIONAR NOVO INTEGRANTE AO OPERATIVO
                    </h4>
                    <p className="text-neutral-500 text-[11px] mt-0.5 leading-relaxed">
                      Registre credenciais de acesso locais para agentes da mesa de comando da ForceQA.
                    </p>
                  </div>

                  {userCreationError && (
                    <div className="fq-alert-error text-xs font-mono">
                      ❌ {userCreationError}
                    </div>
                  )}

                  {userCreationSuccess && (
                    <div className="fq-alert-success text-xs font-mono">
                      ✅ {userCreationSuccess}
                    </div>
                  )}

                  <form onSubmit={handleAdminCreateUserSubmit} className="space-y-4">
                    <div>
                      <label className="fq-label fq-label--xs">
                        Nome Completo
                      </label>
                      <input
                        required
                        type="text"
                        className="fq-input text-xs font-mono"
                        placeholder="Ex: Matheus Lisboa"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="fq-label fq-label--xs">
                        Endereço de E-mail (Acesso)
                      </label>
                      <input
                        required
                        type="email"
                        className="fq-input text-xs font-mono"
                        placeholder="Ex: matheus@forceqa.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="fq-label fq-label--xs">
                        Senha Inicial (Mínimo de 6 caracteres)
                      </label>
                      <input
                        required
                        type="password"
                        className="fq-input text-xs font-mono"
                        placeholder="Ex: senhatemporaria"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="fq-label fq-label--xs">
                          Função Operacional
                        </label>
                        <select
                          className="fq-select text-xs font-mono"
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as any)}
                        >
                          <option value="developer">Developer (DEV)</option>
                          <option value="qa">QA Analyst (QA)</option>
                          <option value="dba">Database Admin (DBA)</option>
                          <option value="admin">Administrator (ADMIN)</option>
                          <option value="viewer">Viewer (OBS/VIEWER)</option>
                        </select>
                      </div>

                      <div>
                        <label className="fq-label fq-label--xs">
                          Squad de Atuação
                        </label>
                        <input
                          required
                          type="text"
                          className="fq-input text-xs font-mono"
                          placeholder="Ex: Squad Pix"
                          value={newUserSquad}
                          onChange={(e) => setNewUserSquad(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isCreatingUser}
                        className="fq-btn-primary w-full text-xs font-bold uppercase font-mono tracking-wider"
                      >
                        {isCreatingUser ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            CADASTRANDO INTEGRANTE...
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            CADASTRAR E VALIDAR CONTA
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Panel 2: Live Registered Members List */}
                <div className="space-y-4 flex flex-col justify-start">
                  <div className="border-b border-white/[0.03] pb-2">
                    <h4 className="font-mono text-xs font-bold uppercase text-neutral-500 tracking-wider flex items-center justify-between">
                      <span>👥 AGENTES OPERATIVOS ATIVOS ({usersList.length})</span>
                      <span className="text-[9px] text-green-500 uppercase font-black tracking-widest">[SINCRONIZADO]</span>
                    </h4>
                    <p className="text-neutral-500 text-[11px] mt-0.5 leading-relaxed">
                      Todos os usuários cadastrados e habilitados na mesa tática da ForceQA.
                    </p>
                  </div>

                  <div className="overflow-y-auto pr-1 max-h-[350px]">
                    {usersList.length === 0 ? (
                      <div className="fq-empty-state py-10">
                        <span className="text-xs text-neutral-500 font-mono">Buscando lista de agentes...</span>
                      </div>
                    ) : (
                      <>
                        <div className="fq-table-header mb-2">
                          <span>Agente</span>
                          <span>Squad</span>
                          <span className="text-right">Ações</span>
                        </div>
                        <div className="space-y-2">
                      {usersList.map((usr: any) => {
                        const isEditing = editingUserId === usr.id;

                        if (isEditing) {
                          return (
                            <div key={usr.id} className="fq-table-row--editing font-mono">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="fq-label fq-label--xs !text-[9px] !mb-1">Nome</label>
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="fq-input text-xs py-1.5"
                                    placeholder="Nome"
                                  />
                                </div>
                                <div>
                                  <label className="fq-label fq-label--xs !text-[9px] !mb-1">Squad</label>
                                  <input
                                    type="text"
                                    value={editingSquad}
                                    onChange={(e) => setEditingSquad(e.target.value)}
                                    className="fq-input text-xs py-1.5"
                                    placeholder="Squad"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between items-end gap-2">
                                <div className="flex-1">
                                  <label className="fq-label fq-label--xs !text-[9px] !mb-1">Função</label>
                                  <select
                                    value={editingRole}
                                    onChange={(e) => setEditingRole(e.target.value as any)}
                                    className="fq-select text-xs py-1.5"
                                  >
                                    <option value="developer">DEV</option>
                                    <option value="qa">QA</option>
                                    <option value="dba">DBA</option>
                                    <option value="devops">DEVOPS</option>
                                    <option value="scrum_master">SCRUM MASTER</option>
                                    <option value="admin">ADMIN</option>
                                    <option value="viewer">VIEWER</option>
                                  </select>
                                </div>
                                <div className="flex gap-1.5 pb-[2px]">
                                  <button
                                    onClick={() => handleSaveEdit(usr.id)}
                                    className="fq-btn-primary text-xs py-1.5 px-2"
                                    title="Confirmar Alteração"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="fq-btn-ghost text-xs py-1.5 px-2"
                                    title="Cancelar"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={usr.id} className="fq-table-row group">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-neutral-100 text-xs truncate">{usr.name}</span>
                                <RoleBadge role={usr.role} />
                              </div>
                              <div className="text-[10px] font-mono text-neutral-500 leading-none truncate">
                                {usr.email}
                              </div>
                            </div>
                            <div className="text-right font-mono text-[9px] uppercase text-neutral-400 fq-badge bg-white/[0.03] border-white/[0.06] py-0.5 px-2">
                              {usr.squad || "Sem Squad"}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleStartEdit(usr)}
                                className="fq-btn-icon !p-1"
                                title="Editar membro"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(usr.id)}
                                className="fq-btn-icon !p-1 hover:text-red-400 hover:bg-red-500/10"
                                title="Excluir membro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
