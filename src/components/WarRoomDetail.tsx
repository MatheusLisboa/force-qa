import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { createBug, updateBugField, fetchAISuggestions, fetchAIDuplicateCheck, fetchAIWarRoomSummary } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { WarRoom, Bug, SeverityLevel, BugStatus, BugPriority, BugType, AISuggestion, AIDuplicateCheck, AIWarRoomSummary } from "../types";
import { BugDetailModal } from "./BugDetailModal";
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
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const severityLabels: { [key in SeverityLevel]: string } = {
  blocker: "BLOCKER",
  critical: "CRÍTICO",
  high: "ALTO",
  medium: "MÉDIO",
  low: "BAIXO",
};

interface WarRoomDetailProps {
  roomId: string;
  onBack: () => void;
}

export const WarRoomDetail: React.FC<WarRoomDetailProps> = ({ roomId, onBack }) => {
  const { profile } = useAuth();
  const [warRoom, setWarRoom] = useState<WarRoom | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Tab control: "kanban" | "analytics" | "ai_report"
  const [activeTab, setActiveTab] = useState<"kanban" | "analytics" | "ai_report">("kanban");
  
  // Modal toggle states
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);

  // Filters state
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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
  const [bugEvidence, setBugEvidence] = useState<string | null>(null); // base64 URL
  const [bugPrototype, setBugPrototype] = useState<string | null>(null); // base64 URL for figma prototype screenshot

  // AI Assistant states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<AIDuplicateCheck | null>(null);

  // AI executive reports
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [compiledReport, setCompiledReport] = useState<AIWarRoomSummary | null>(null);

  // Form submit state
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Live real-time streams subscription
  useEffect(() => {
    // 1. Fetch War Room details
    const unsubscribeRoom = onSnapshot(doc(db, "warRooms", roomId), (docSnap) => {
      if (docSnap.exists()) {
        setWarRoom(docSnap.data() as WarRoom);
      } else {
        console.error("Room document not found in db.");
      }
    });

    // 2. Fetch real-time bugs nested inside this War Room
    const bugsQuery = query(
      collection(db, "bugs"),
      where("warRoomId", "==", roomId),
      orderBy("createdAt", "desc")
    );
    const unsubscribeBugs = onSnapshot(bugsQuery, (snapshot) => {
      const bList: Bug[] = [];
      snapshot.forEach((doc) => {
        bList.push(doc.data() as Bug);
      });
      setBugs(bList);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to war room bugs:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeBugs();
    };
  }, [roomId]);

  // Handle Drag & Drop HTML5 mechanics
  const handleDragStart = (e: React.DragEvent, bugId: string) => {
    e.dataTransfer.setData("text/plain", bugId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: BugStatus) => {
    e.preventDefault();
    const bugId = e.dataTransfer.getData("text/plain");
    if (!bugId || !profile) return;
    if (profile.role === "viewer") {
      alert("Acesso negado: Visualizadores não podem movimentar o kanban.");
      return;
    }

    const targetBug = bugs.find(b => b.id === bugId);
    if (!targetBug) return;
    if (targetBug.status === targetStatus) return; // Unchanged state

    const statusLabels: any = {
      new: "Novo",
      under_analysis: "Em Análise",
      in_progress: "Em Correção",
      ready_for_qa: "Pronto para QA",
      validated: "Validado",
      reopened: "Reaberto"
    };

    const logMessage = `Alterou status via Drag & Drop de "${statusLabels[targetBug.status]}" para "${statusLabels[targetStatus]}"`;
    
    try {
      await updateBugField(
        bugId,
        roomId,
        { status: targetStatus },
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

  // AI compile report of the whole War Room Operation
  const triggerAiSummaryCompile = async () => {
    if (!warRoom) return;

    setIsSummaryLoading(true);
    setCompiledReport(null);
    try {
      const summary = await fetchAIWarRoomSummary(warRoom, bugs);
      setCompiledReport(summary);
    } catch (err: any) {
      alert("Falha operacional ao consolidar relatório estratégico: " + err.message);
    } finally {
      setIsSummaryLoading(false);
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
        evidenceUrl: bugEvidence || undefined,
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

  // Calculate stats for current War Room bugs listings
  const totalBugsLength = filteredBugs.length;
  const statusCounts = {
    new: filteredBugs.filter(b => b.status === "new"),
    under_analysis: filteredBugs.filter(b => b.status === "under_analysis"),
    in_progress: filteredBugs.filter(b => b.status === "in_progress"),
    ready_for_qa: filteredBugs.filter(b => b.status === "ready_for_qa"),
    validated: filteredBugs.filter(b => b.status === "validated"),
  };

  const getSeverityBadgeColors = (sev: SeverityLevel) => {
    switch(sev) {
      case "blocker": return "bg-red-950/40 text-red-500 border border-red-550/30 animate-pulse";
      case "critical": return "bg-red-950/20 text-red-400 border border-red-500/20";
      case "high": return "bg-orange-950/20 text-orange-400 border border-orange-500/20";
      case "medium": return "bg-yellow-950/20 text-yellow-400 border border-yellow-500/20";
      case "low": return "bg-blue-950/10 text-blue-400 border border-blue-500/20";
    }
  };

  const getTypeBadgeLabels = (type: BugType) => {
    switch(type) {
      case "bug": return "🐞 Bug";
      case "improvement": return "⚡ Melhoria";
      case "ui_adjustment": return "🎨 Ajuste Visual";
      case "performance": return "🚀 Performance";
      case "security": return "🔒 Segurança";
    }
  };

  if (!warRoom) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 font-mono text-sm leading-relaxed">Localizando Canal Operacional no Firestore...</p>
      </div>
    );
  }

  // List of active developers currently assigned inside this room
  const developerIdsAssigned = Array.from(new Set(bugs.map(b => b.ownerId).filter(id => id !== null))) as string[];
  const developersAssigned = developerIdsAssigned.map(id => {
    const matchingBug = bugs.find(b => b.ownerId === id);
    return { id, name: matchingBug?.ownerName || "Unknown Dev" };
  });

  return (
    <div className="space-y-6 p-6 lg:p-8 max-w-7xl mx-auto room-banner-glow">
      {/* Top context header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/[0.04] pb-6">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-450 hover:text-red-400 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> VOLTAR AO COMANDO CENTRAL
          </button>
          
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-black text-white tracking-tight">
              {warRoom.name}
            </h2>
            <span className="p-1 px-2.5 bg-red-500/10 text-red-500 border border-red-500/25 rounded font-mono text-[10px] font-extrabold uppercase">
              SEVERITY: {warRoom.severity}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-450">
            <span>SQUAD: <span className="text-slate-300 font-bold">{warRoom.squad}</span></span>
            <span>•</span>
            <span>SYSTEM: <span className="text-slate-300 font-bold">{warRoom.project}</span></span>
            <span>•</span>
            <span>DATE: <span className="text-slate-300 font-bold">{warRoom.date}</span></span>
          </div>
        </div>

        {/* Tab switcher action rails */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="bg-[#111827] border border-slate-800 p-0.5 rounded-lg flex">
            <button
              onClick={() => setActiveTab("kanban")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                activeTab === "kanban" 
                  ? "bg-slate-800 text-white shadow" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                activeTab === "analytics" 
                  ? "bg-slate-800 text-white shadow" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Relatórios
            </button>
            <button
              onClick={() => setActiveTab("ai_report")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                activeTab === "ai_report" 
                  ? "bg-slate-850 text-red-400 border border-red-550/15 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              IA Report
            </button>
          </div>

          {profile?.role !== "viewer" && (
            <button
              onClick={() => setIsBugModalOpen(true)}
              className="flex items-center gap-1.5 bg-red-650 hover:bg-red-600 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Relatar Bug Instante
            </button>
          )}
        </div>
      </div>

      {/* FILTER SEARCH PANEL BAR */}
      <div className="bg-[#0f172a]/20 border border-white/[0.03] p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full relative">
          <input
            type="text"
            className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/30 rounded-lg pl-3 pr-4 py-2 text-xs text-white placeholder-slate-650 focus:outline-none"
            placeholder="Pesquisar por ID, título, tags, responsável..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Granular drop toggles */}
        <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
          {/* Env */}
          <div className="flex items-center gap-1.5 bg-[#111827] border border-slate-850 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-[10px] font-mono text-slate-500">ENV:</span>
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none border-none text-xs font-semibold cursor-pointer"
            >
              <option value="all">TODOS</option>
              <option value="production">PROD</option>
              <option value="homologation">HOMOLOG</option>
              <option value="dev">DEV</option>
            </select>
          </div>

          {/* Type */}
          <div className="flex items-center gap-1.5 bg-[#111827] border border-slate-850 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-[10px] font-mono text-slate-500">TIPO:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none border-none text-xs font-semibold cursor-pointer"
            >
              <option value="all">TODOS</option>
              <option value="bug">BUG</option>
              <option value="improvement">MELHORIA</option>
              <option value="ui_adjustment">UI/VISUAL</option>
              <option value="performance">PERF</option>
              <option value="security">SEC</option>
            </select>
          </div>

          {/* Severity */}
          <div className="flex items-center gap-1.5 bg-[#111827] border border-slate-850 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-[10px] font-mono text-slate-500">SEV:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none border-none text-xs font-semibold cursor-pointer"
            >
              <option value="all">TODAS</option>
              <option value="blocker">BLOCKER</option>
              <option value="critical">CRÍTICO</option>
              <option value="high">ALTO</option>
              <option value="medium">MÉDIO</option>
              <option value="low">BAIXO</option>
            </select>
          </div>

          {/* Owner */}
          <div className="flex items-center gap-1.5 bg-[#111827] border border-slate-850 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-[10px] font-mono text-slate-500">CORREÇÃO:</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none border-none text-xs font-semibold cursor-pointer"
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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5 items-start overflow-x-auto min-h-[60vh] pb-8">
          {/* Columns iteration */}
          {([
            { id: "new", label: "NOVO INCIDENTE", color: "bg-blue-500", list: statusCounts.new },
            { id: "under_analysis", label: "EM ANÁLISE", color: "bg-purple-500", list: statusCounts.under_analysis },
            { id: "in_progress", label: "EM CORREÇÃO", color: "bg-orange-500", list: statusCounts.in_progress },
            { id: "ready_for_qa", label: "PRONTO PARA QA", color: "bg-yellow-500", list: statusCounts.ready_for_qa },
            { id: "validated", label: "VALIDADO", color: "bg-green-500", list: statusCounts.validated }
          ] as { id: BugStatus; label: string; color: string; list: Bug[] }[]).map((column) => (
            <div 
              key={column.id}
              className="flex-1 min-w-[220px]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column title header */}
              <div className="flex justify-between items-center bg-[#0d1220]/45 p-3.5 border border-slate-800 rounded-t-xl">
                <span className="font-mono text-xs font-bold text-slate-350 tracking-wide flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${column.color}`} />
                  {column.label}
                </span>
                <span className="bg-slate-850 px-2 py-0.5 rounded font-mono text-[10px] font-bold text-slate-400">
                  {column.list.length}
                </span>
              </div>

              {/* Column list workspace container */}
              <div className="bg-[#0f172a]/10 border-x border-b border-white/[0.02] rounded-b-xl min-h-[460px] p-3 space-y-3">
                {column.list.length === 0 ? (
                  <div className="text-center py-12 text-slate-600 text-[10px] font-mono border border-dashed border-slate-850 rounded-lg">
                    ARRASTAR OU ABRIR TAREFA
                  </div>
                ) : (
                  column.list.map((bug) => (
                    <div
                      key={bug.id}
                      draggable={profile?.role !== "viewer"}
                      onDragStart={(e) => handleDragStart(e, bug.id)}
                      onClick={() => setSelectedBug(bug)}
                      className="group bg-[#0d1220] border border-slate-800/80 p-4 rounded-xl shadow cursor-grab active:cursor-grabbing hover:border-red-500/20 hover:bg-[#111827] transition flex flex-col justify-between space-y-3 relative overflow-hidden"
                    >
                      {/* Animated blocker bar decoration */}
                      {bug.criticism === "blocker" && (
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-red-650 animate-pulse" />
                      )}

                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <span className={`text-[9px] font-mono font-black py-0.5 px-2 rounded ${getSeverityBadgeColors(bug.criticism)}`}>
                            {severityLabels[bug.criticism]}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500 font-bold uppercase truncate max-w-[80px]" title={bug.id}>
                            {bug.id}
                          </span>
                        </div>

                        <h4 className="font-semibold text-white group-hover:text-red-400 text-xs transition duration-150 leading-relaxed mt-2" title={bug.title}>
                          {bug.title}
                        </h4>

                        {/* Evidence icon indicator */}
                        <div className="flex gap-2 items-center flex-wrap pt-2">
                          <span className="text-[9px] text-slate-450 font-mono inline-block bg-[#0f172a]/80 py-0.5 px-1.5 rounded">
                            {getTypeBadgeLabels(bug.type)}
                          </span>
                          
                          {bug.evidenceUrl && (
                            <span className="text-[9px] bg-indigo-950/20 border border-indigo-500/10 text-indigo-400 font-mono py-0.5 px-1.5 rounded">
                              📸 ATTACHED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card meta footer */}
                      <div className="pt-2 border-t border-slate-850 flex justify-between items-center text-[10px] font-mono text-slate-450">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-500" />
                          <span className="truncate max-w-[90px]" title={bug.ownerName || "Unassigned"}>
                            {bug.ownerName || "Sem Dev"}
                          </span>
                        </div>

                        {/* Relative Elapsed Open time since logged */}
                        <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
                          <Clock className="w-2.5 h-2.5" />
                          {Math.max(1, Math.round((new Date().getTime() - new Date(bug.createdAt).getTime()) / 60000))}m aberto
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: DETAILED ANALYTICAL METRICS AND EXPORTS REPORTS */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="bg-[#0f172a]/65 border border-slate-800 p-6 rounded-2xl">
            <div className="flex justify-between items-center border-b border-slate-850 pb-4 mb-6">
              <div>
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-red-500" /> Consolidados da Operação War Room
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">Métricas de performance, triagem por ambiente e taxa de reaberturas.</p>
              </div>

              <button
                onClick={triggerCsvDownload}
                className="flex items-center gap-2 bg-[#111827] border border-slate-750 hover:bg-slate-805 text-white font-mono text-xs px-4 py-2.5 rounded-lg cursor-pointer transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-555" /> Exportar Planilha CSV
              </button>
            </div>

            {/* Metric charts breakdown row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Counter 1: Environ */}
              <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-xl space-y-3.5">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Erros Por Ambiente</h4>
                <div className="space-y-2 text-xs">
                  {["production", "homologation", "dev"].map(env => {
                    const count = filteredBugs.filter(b => b.environment === env).length;
                    const percent = count > 0 ? (count / (filteredBugs.length || 1)) * 100 : 0;
                    return (
                      <div key={env}>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                          <span className="uppercase font-semibold">{env === "homologation" ? "HOMOLOG" : env}</span>
                          <span>{count} ocorrências</span>
                        </div>
                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Counter 2: Categories Types */}
              <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-xl space-y-3.5">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Erros Por Divisão</h4>
                <div className="space-y-1.5 text-xs">
                  {["bug", "improvement", "ui_adjustment", "performance", "security"].map(type => {
                    const count = filteredBugs.filter(b => b.type === type).length;
                    return (
                      <div key={type} className="flex justify-between text-[11px] font-mono py-1 border-b border-white/[0.02]">
                        <span className="text-slate-350">{getTypeBadgeLabels(type as BugType)}</span>
                        <span className="font-bold text-white">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Counter 3: Performance metrics */}
              <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-xl space-y-3">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Fatores de Qualidade</h4>
                
                <div className="space-y-4 pt-1">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs text-slate-350 font-bold block">Taxa de Reabertura (Reopens)</span>
                      <span className="text-[10px] text-slate-450 leading-none">Bugs validados reabertos posteriormente</span>
                    </div>
                    <span className="text-xl font-mono font-black text-red-400">
                      {filteredBugs.reduce((acc, b) => acc + (b.reopenCount || 0), 0)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs text-slate-350 font-bold block">Resolução sem Responsável</span>
                      <span className="text-[10px] text-slate-450 leading-none block">Bugs novos pendentes de desenvolvedores</span>
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

      {/* TAB 3: EXECUTIVE WAR ROOM REPORT GENERATED AUTOMATICALLY BY AI */}
      {activeTab === "ai_report" && (
        <div className="space-y-5">
          <div className="bg-[#0f172a]/65 border border-slate-800 p-6 rounded-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-850 pb-4 mb-6">
              <div>
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-red-500 animate-pulse" /> Compilador Tático de IA ForceQA
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">Analisa os dados deste incidente consolidando conclusões executivas com IA.</p>
              </div>

              <button
                maxLength={40}
                onClick={triggerAiSummaryCompile}
                disabled={isSummaryLoading}
                className="flex items-center gap-2 bg-red-650 hover:bg-red-600 disabled:bg-slate-850 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-md cursor-pointer transition border border-red-550/20"
              >
                <Sparkles className="w-4 h-4" />
                {isSummaryLoading ? "Gerando Relatório estratégico..." : "Compilar Relatório Executivo com IA"}
              </button>
            </div>

            {isSummaryLoading && (
              <div className="text-center py-16">
                <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400 text-xs font-mono">Consolidando e-mails, timelines, tags e logs no Gemini AI...</p>
                <p className="text-[10px] text-slate-550 font-mono mt-1">Este processo de IA leva cerca de 5-10 segundos.</p>
              </div>
            )}

            {!isSummaryLoading && !compiledReport && (
              <div className="text-center py-20 border border-dashed border-slate-850 rounded-xl bg-slate-950/20">
                <Brain className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <h4 className="text-slate-350 font-bold text-base">Relatório não gerado</h4>
                <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 leading-relaxed">
                  Clique no botão acima para submeter a relação de incidentes operacionais a nossa rede neural de QA e automatizar conclusões estratégicas.
                </p>
              </div>
            )}

            {compiledReport && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 prose prose-invert font-sans max-w-none text-slate-250"
              >
                {/* Visual header compiled info box */}
                <div className="p-5 bg-red-950/10 border border-red-500/25 rounded-xl">
                  <h4 className="text-red-400 font-extrabold text-base font-display flex items-center gap-1.5 uppercase m-0 leading-none">
                    <FileText className="w-4 h-4" /> CONSOLIDAÇÃO EXECUTIVA DE INCIDENTE: {compiledReport.title}
                  </h4>
                  <p className="text-xs text-slate-300 mt-2 m-0 bg-transparent py-0 px-0 rounded-none leading-relaxed italic">
                    "{compiledReport.executiveSummary}"
                  </p>
                </div>

                {/* Markdown core output render */}
                <div className="bg-[#0b0f19]/75 border border-slate-850 p-6 rounded-xl overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap font-mono text-emerald-400">
                  {compiledReport.markdownReport}
                </div>

                <div className="border-t border-slate-850 pt-4 flex justify-end gap-3 font-semibold text-xs">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg cursor-pointer text-center"
                  >
                    Imprimir Relatório (Export PDF)
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* RAPID CADASTRO BUG MODAL CREATE */}
      <AnimatePresence>
        {isBugModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080b13]/85 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl h-[88vh] bg-[#0d1220] border border-[#1e293b] rounded-2xl shadow-2xl p-6 relative flex flex-col justify-between overflow-hidden"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-850 pb-4">
                <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-red-500" /> Relato Rápido e Inteligente de Incidente
                </h3>
                <button 
                  onClick={() => setIsBugModalOpen(false)}
                  className="p-1 bg-slate-850 text-slate-350 hover:bg-slate-800 hover:text-white rounded cursor-pointer"
                >
                  X
                </button>
              </div>

              {/* Form body container with internal scrolling */}
              <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 text-xs text-slate-305">
                {formError && (
                  <div className="p-3 bg-red-900/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                    {formError}
                  </div>
                )}

                {/* Main information rows */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.5">
                        Título do Incidente *
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/40 rounded-lg px-3 py-2 text-white placeholder-slate-650 focus:outline-none"
                        placeholder="Ex: Erro 500 ao confirmar transação PIX"
                        value={bugTitle}
                        onChange={(e) => setBugTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.5">
                        Descrição e Passos de Reprodução
                      </label>
                      <textarea
                        rows={5}
                        className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/40 rounded-lg px-3 py-2 text-white placeholder-slate-650 focus:outline-none font-sans"
                        placeholder="Insira os passos seguidos, logs de erro, comportamento observado de forma direta..."
                        value={bugDesc}
                        onChange={(e) => setBugDesc(e.target.value)}
                      />
                    </div>

                    {/* AI Assistants Trigger panel buttons row */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={triggerAiSuggestions}
                        disabled={isAiLoading || !bugTitle.trim()}
                        className="flex items-center gap-1.5 bg-red-504/10 hover:bg-red-500/15 border border-red-505/20 text-red-400 font-mono text-[10px] py-2 px-3 rounded hover:border-red-500/50 cursor-pointer transition disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        {isAiLoading ? "Analisando..." : "Sugerir Campos IA"}
                      </button>

                      <button
                        type="button"
                        onClick={triggerDuplicationTriage}
                        disabled={isCheckingDuplicate || !bugTitle.trim()}
                        className="flex items-center gap-1.5 bg-slate-805 hover:bg-slate-800 border border-slate-750 text-slate-300 font-mono text-[10px] py-2 px-3 rounded cursor-pointer transition disabled:opacity-50"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {isCheckingDuplicate ? "Buscando..." : "Checar Duplicados com IA"}
                      </button>
                    </div>

                    {/* AI Prompt suggestions notification feedback boxes */}
                    {aiSuggestions && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-red-950/10 border border-red-500/25 rounded-md text-[11px] leading-relaxed text-slate-300"
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
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2 font-semibold">
                          Criticidade (Severity)
                        </label>
                        <select
                          value={bugCrit}
                          onChange={(e) => setBugCrit(e.target.value as SeverityLevel)}
                          className="w-full bg-[#111827] border border-slate-850 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500/30 font-bold"
                        >
                          <option value="blocker">🚨 BLOCKER</option>
                          <option value="critical">🔴 CRÍTICO</option>
                          <option value="high">🟠 ALTO</option>
                          <option value="medium">🟡 MÉDIO</option>
                          <option value="low">🔵 BAIXO</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2 font-semibold">
                          Ambiente Afetado
                        </label>
                        <select
                          value={bugEnv}
                          onChange={(e) => setBugEnv(e.target.value as any)}
                          className="w-full bg-[#111827] border border-slate-850 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500/30 font-bold"
                        >
                          <option value="production">PRODUCTION</option>
                          <option value="homologation">HOMOLOGATION</option>
                          <option value="dev">DEV ENVIRONMENT</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2">
                          Tipo de Ocorrência
                        </label>
                        <select
                          value={bugType}
                          onChange={(e) => setBugType(e.target.value as BugType)}
                          className="w-full bg-[#111827] border border-slate-850 rounded-lg px-3 py-2 text-white focus:outline-none"
                        >
                          <option value="bug">🐞 BUG</option>
                          <option value="improvement">⚡ MELHORIA</option>
                          <option value="ui_adjustment">🎨 AJUSTE VISUAL</option>
                          <option value="performance">🚀 PERFORMANCE</option>
                          <option value="security">🔒 SEGURANÇA</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2 font-semibold">
                          Prioridade Operacional
                        </label>
                        <select
                          value={bugPriority}
                          onChange={(e) => setBugPriority(e.target.value as BugPriority)}
                          className="w-full bg-[#111827] border border-slate-850 rounded-lg px-3 py-2 text-white focus:outline-none"
                        >
                          <option value="immediate">IMEDIATA</option>
                          <option value="high">ALTA</option>
                          <option value="medium">MÉDIA</option>
                          <option value="low">BAIXA</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2">
                          URL Relacionada
                        </label>
                        <input
                          type="url"
                          className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/30 rounded-lg px-3 py-2 text-white placeholder-slate-650 focus:outline-none font-mono text-[11px]"
                          placeholder="https://example.com/checkout"
                          value={bugUrl}
                          onChange={(e) => setBugUrl(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2">
                          Build / Versão da Aplicação
                        </label>
                        <input
                          type="text"
                          className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/30 rounded-lg px-3 py-2 text-white placeholder-slate-650 focus:outline-none font-mono text-[11px]"
                          placeholder="Ex: v1.4.2-build390"
                          value={bugBuild}
                          onChange={(e) => setBugBuild(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.2">
                        Tags Classificatórias (separados por vírgula)
                      </label>
                      <input
                        type="text"
                        className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/30 rounded-lg px-3 py-2 text-white placeholder-slate-650 focus:outline-none font-mono text-[11px]"
                        placeholder="Ex: frontend, pix, auth, login"
                        value={bugTagsInput}
                        onChange={(e) => setBugTagsInput(e.target.value)}
                      />
                    </div>

                    {/* Drag and drop evidence uploader file picker block */}
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-450 uppercase mb-1.5">
                        Importar Imagem de Defeito / Evidência
                      </label>
                      <div className="border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 p-4 rounded-xl text-center space-y-2 relative transition">
                        <Upload className="w-6 h-6 text-slate-500 mx-auto" />
                        <span className="block text-[10px] font-semibold text-slate-350">Selecione arquivos ou faça drag & drop aqui</span>
                        <span className="block text-[9px] text-slate-500 font-mono leading-none">Apenas PNG/JPG com menos de 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {bugEvidence && (
                        <div className="flex items-center gap-2 mt-2 bg-[#111827] p-2 border border-slate-850 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-[10px] font-mono text-slate-400 uppercase">Screenshot anexada</span>
                          <button
                            type="button"
                            onClick={() => setBugEvidence(null)}
                            className="ml-auto text-[10px] font-mono text-red-400 hover:underline cursor-pointer"
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Drag and drop prototype figma uploader file picker block */}
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-[#4ea8de] uppercase mb-1.5 flex items-center justify-between">
                        <span>Imagem de Protótipo / Como deveria ser (Opcional)</span>
                        <span className="text-[8px] tracking-wide text-cyan-400 uppercase">[Figma Matcher]</span>
                      </label>
                      <div className="border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 p-4 rounded-xl text-center space-y-2 relative transition">
                        <Upload className="w-6 h-6 text-[#4ea8de] mx-auto opacity-70" />
                        <span className="block text-[10px] font-semibold text-slate-350">Arraste a referência do protótipo Figma correto</span>
                        <span className="block text-[9px] text-slate-500 font-mono leading-none">Apenas PNG/JPG com menos de 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePrototypeUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {bugPrototype && (
                        <div className="flex items-center gap-2 mt-2 bg-[#111827] p-2 border border-slate-850 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-[10px] font-mono text-slate-400 uppercase">Protótipo anexado</span>
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
              <div className="pt-4 border-t border-slate-850 flex justify-end gap-3 font-semibold text-xs">
                <button
                  type="button"
                  onClick={() => setIsBugModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleReportBug}
                  disabled={formSubmitting || !bugTitle.trim()}
                  className="px-5 py-2 bg-red-650 hover:bg-red-600 disabled:bg-slate-850 text-white rounded-lg shadow-md cursor-pointer transition text-center"
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
