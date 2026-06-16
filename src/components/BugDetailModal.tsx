import React, { useEffect, useState } from "react";
import { subscribeBug, subscribeBugComments, subscribeActivityLogs } from "../lib/supabase";
import { updateBugField, createComment, fetchUsersList } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { Bug, BugComment, ActivityLog, BugStatus, SeverityLevel } from "../types";
import { isImageEvidence } from "../lib/evidence";
import { truncateForLog } from "../lib/bugLabels";
import { BugTypeTag } from "./BugTypeTag";
import { 
  X, 
  Terminal, 
  Send, 
  Clock, 
  UserPlus, 
  CheckCircle, 
  RefreshCw, 
  Globe, 
  Tag, 
  Grid,
  FileText,
  AlertCircle,
  ExternalLink,
  Pencil,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BugDetailModalProps {
  bug: Bug;
  onClose: () => void;
}

export const BugDetailModal: React.FC<BugDetailModalProps> = ({ bug, onClose }) => {
  const { profile } = useAuth();
  const [activeBug, setActiveBug] = useState<Bug>(bug);
  const [comments, setComments] = useState<BugComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isFullscreenEvidence, setIsFullscreenEvidence] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(bug.title);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState(bug.description);
  const [savingField, setSavingField] = useState<"title" | "description" | null>(null);

  const canEdit = profile?.role !== "viewer";

  // Status mappings with labels & border colors
  const statusLabels: { [key in BugStatus]: { text: string; bg: string; textCol: string } } = {
    new: { text: "Novo", bg: "bg-blue-500/10", textCol: "text-blue-400" },
    under_analysis: { text: "Em Análise", bg: "bg-purple-500/10", textCol: "text-purple-400" },
    in_progress: { text: "Em Correção", bg: "bg-orange-500/10", textCol: "text-orange-400" },
    ready_for_qa: { text: "Pronto para QA", bg: "bg-yellow-500/10", textCol: "text-yellow-400" },
    validated: { text: "Validado", bg: "bg-green-500/10", textCol: "text-green-400" },
    reopened: { text: "Reaberto", bg: "bg-red-500/10", textCol: "text-red-400" },
  };

  const severityLabels: { [key in SeverityLevel]: string } = {
    blocker: "BLOCKER",
    critical: "CRÍTICO",
    high: "ALTO",
    medium: "MÉDIO",
    low: "BAIXO",
  };

  const severityColors: { [key in SeverityLevel]: string } = {
    blocker: "bg-red-650 text-white shadow-[0_0_8px_rgba(220,38,38,0.6)] animate-pulse",
    critical: "bg-red-500 text-white",
    high: "bg-orange-500 text-neutral-900 font-bold",
    medium: "bg-yellow-500 text-neutral-900 font-bold",
    low: "bg-blue-500 text-white",
  };

  // Fetch commenters, logs, and users list
  useEffect(() => {
    const unsubscribeBug = subscribeBug(bug.id, (b) => {
      if (b) setActiveBug(b);
    });
    const unsubscribeComments = subscribeBugComments(bug.id, setComments);
    const unsubscribeLogs = subscribeActivityLogs(bug.id, setActivityLogs);

    fetchUsersList().then(setUsers);

    return () => {
      unsubscribeBug();
      unsubscribeComments();
      unsubscribeLogs();
    };
  }, [bug.id]);

  useEffect(() => {
    setEditTitle(activeBug.title);
    setEditDescription(activeBug.description);
  }, [activeBug.title, activeBug.description]);

  const handleSaveTitle = async () => {
    if (!profile || !canEdit) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      alert("O título não pode ficar vazio.");
      return;
    }
    if (trimmed === activeBug.title) {
      setIsEditingTitle(false);
      return;
    }

    setSavingField("title");
    try {
      const oldTitle = activeBug.title;
      await updateBugField(
        activeBug.id,
        activeBug.warRoomId,
        { title: trimmed },
        profile.id,
        profile.name,
        `Alterou o título de "${truncateForLog(oldTitle, 60)}" para "${truncateForLog(trimmed, 60)}"`,
        "title_edit"
      );
      setIsEditingTitle(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveDescription = async () => {
    if (!profile || !canEdit) return;
    const trimmed = editDescription.trim();
    if (trimmed === (activeBug.description || "").trim()) {
      setIsEditingDescription(false);
      return;
    }

    setSavingField("description");
    try {
      const oldDesc = activeBug.description || "(vazio)";
      const newDesc = trimmed || "(vazio)";
      await updateBugField(
        activeBug.id,
        activeBug.warRoomId,
        { description: trimmed },
        profile.id,
        profile.name,
        `Alterou a descrição de "${truncateForLog(oldDesc, 60)}" para "${truncateForLog(newDesc, 60)}"`,
        "description_edit"
      );
      setIsEditingDescription(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingField(null);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    setSubmittingComment(true);
    try {
      await createComment({
        bugId: activeBug.id,
        warRoomId: activeBug.warRoomId,
        userId: profile.id,
        userName: profile.name,
        avatarUrl: profile.avatarUrl || "",
        text: newComment.trim(),
      }, profile.name);
      setNewComment("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUpdateStatus = async (newStatus: BugStatus) => {
    if (!profile) return;
    if (profile.role === "viewer") {
      alert("Operação não permitida: Observadores não podem modificar o status de tarefas.");
      return;
    }

    const stateDescMap: { [key in BugStatus]: string } = {
      new: "para Novo",
      under_analysis: "para Em Análise",
      in_progress: "para Em Correção",
      ready_for_qa: "para Pronto para QA (Validação)",
      validated: "para Validado / Encerrado",
      reopened: "para Reaberto",
    };

    let logMessage = `Mudou status de "${statusLabels[activeBug.status].text}" ${stateDescMap[newStatus]}`;
    const cleanFields: Partial<Bug> = { status: newStatus };

    if (newStatus === "reopened") {
      cleanFields.reopenCount = (activeBug.reopenCount || 0) + 1;
      logMessage = `Reabriu o bug (Contador: ${cleanFields.reopenCount})`;
    }

    try {
      await updateBugField(activeBug.id, activeBug.warRoomId, cleanFields, profile.id, profile.name, logMessage);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClaimTask = async () => {
    if (!profile) return;
    if (profile.role === "viewer") {
      alert("Apenas desenvolvedores e QAs autorizados podem assumir responsabilidades de tarefas.");
      return;
    }

    try {
      await updateBugField(
        activeBug.id,
        activeBug.warRoomId,
        { ownerId: profile.id, ownerName: profile.name },
        profile.id,
        profile.name,
        `Assumiu ("claimed") a responsabilidade de correção da tarefa`
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignOwner = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!profile) return;
    const selectedUserId = e.target.value;
    if (!selectedUserId) return;

    const chosenUser = users.find(u => u.id === selectedUserId);
    if (!chosenUser) return;

    try {
      await updateBugField(
        activeBug.id,
        activeBug.warRoomId,
        { ownerId: chosenUser.id, ownerName: chosenUser.name },
        profile.id,
        profile.name,
        `Atribuiu a responsabilidade da tarefa para ${chosenUser.name}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080b13]/85 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="w-full max-w-7xl h-[92vh] bg-[#0d1220] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header toolbar */}
        <div className="p-4 lg:p-5 border-b border-slate-800/60 bg-[#0f172a]/40 flex justify-between items-center bg-zinc-900/10">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="p-1 px-2.5 bg-slate-805 text-slate-400 border border-slate-800 rounded font-mono text-[10px] font-bold">
              ID: {activeBug.id}
            </span>
            <BugTypeTag type={activeBug.type} size="md" />
            <span className={`p-1 px-2.5 text-[10px] font-mono tracking-wider font-extrabold rounded ${severityColors[activeBug.criticism]}`}>
              {severityLabels[activeBug.criticism]}
            </span>
            <span className={`p-1 px-2.5 text-[10px] uppercase font-mono font-bold rounded ${statusLabels[activeBug.status].bg} ${statusLabels[activeBug.status].textCol}`}>
              {statusLabels[activeBug.status].text}
            </span>
          </div>

          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 rounded transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace body columns hierarchy scrolling container */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Column 1: Bug details & screenshot evidences */}
          <div className="lg:col-span-5 p-6 border-r border-slate-800/50 space-y-6">
            <div>
              {isEditingTitle ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                    className="w-full fq-input text-lg font-semibold"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTitle}
                      disabled={savingField === "title" || !editTitle.trim()}
                      className="fq-btn-primary text-[12px] py-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditTitle(activeBug.title);
                        setIsEditingTitle(false);
                      }}
                      className="fq-btn-ghost text-[12px] py-1.5"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 group/title">
                  <h2 className="font-display text-2xl font-black text-white leading-tight flex-1">
                    {activeBug.title}
                  </h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1.5 text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] rounded-md opacity-0 group-hover/title:opacity-100 transition"
                      title="Editar título"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-450 mt-3 border-b border-slate-850 pb-4">
                <span>HUNTER: <span className="text-slate-300">{activeBug.createdByName}</span></span>
                <span>•</span>
                <span>ENV: <span className="text-slate-300 uppercase">{activeBug.environment === "homologation" ? "HMG" : activeBug.environment === "production" ? "PROD" : "DEV"}</span></span>
              </div>
            </div>

            {/* Description text block */}
            <div className="bg-[#0f172a]/20 border border-slate-850 p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> DESCRIÇÃO
                </span>
                {canEdit && !isEditingDescription && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDescription(true)}
                    className="p-1 text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] rounded-md transition"
                    title="Editar descrição"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isEditingDescription ? (
                <div className="space-y-2">
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={6}
                    className="w-full fq-input text-sm resize-y min-h-[120px]"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDescription}
                      disabled={savingField === "description"}
                      className="fq-btn-primary text-[12px] py-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditDescription(activeBug.description);
                        setIsEditingDescription(false);
                      }}
                      className="fq-btn-ghost text-[12px] py-1.5"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {activeBug.description || "Nenhuma descrição complementar foi fornecida."}
                </p>
              )}
            </div>

            {/* Structured details meta card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[#0c101b] border border-slate-850 rounded-xl">
                <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5" /> URL / Plataforma Afetada
                </span>
                <span className="text-xs font-mono text-indigo-400 break-all bg-indigo-950/20 px-2 py-1.5 rounded block">
                  {activeBug.affectedUrl || "Nenhuma URL especificada"}
                </span>
              </div>

              <div className="p-4 bg-[#0c101b] border border-slate-850 rounded-xl">
                <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 mb-2">
                  <Grid className="w-3.5 h-3.5" /> Build / Versão do Sistema
                </span>
                <span className="text-xs font-mono text-slate-200 bg-slate-900 px-2 py-1.5 rounded block">
                  {activeBug.buildVersion || "Nenhum ID de build inserido"}
                </span>
              </div>
            </div>

            {/* Tags layout list */}
            {activeBug.tags && activeBug.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-slate-450" />
                <div className="flex gap-2.5">
                  {activeBug.tags.map(tag => (
                    <span key={tag} className="bg-slate-800 text-slate-300 text-[10px] font-mono uppercase font-bold py-1 px-2.5 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot evidence and prototype comparative render panel */}
            {(activeBug.evidenceUrl || activeBug.prototypeUrl) && (
              <div className="pt-4 border-t border-slate-850">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Real production bug evidence image */}
                  {activeBug.evidenceUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 font-bold">
                        {isImageEvidence(activeBug.evidenceUrl)
                          ? "📸 Evidência do Bug Encontrado"
                          : "🔗 Link de Evidência"}
                      </span>
                      {isImageEvidence(activeBug.evidenceUrl) ? (
                        <div 
                          onClick={() => {
                            setFullscreenUrl(activeBug.evidenceUrl!);
                            setIsFullscreenEvidence(true);
                          }}
                          className="rounded-xl border border-slate-800/80 overflow-hidden max-h-[220px] aspect-video bg-black/40 hover:opacity-85 transition cursor-zoom-in relative group"
                        >
                          <img 
                            src={activeBug.evidenceUrl} 
                            alt="Evidência do Bug" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white font-mono transition">
                            Clique para ampliar evidência
                          </div>
                        </div>
                      ) : (
                        <a
                          href={activeBug.evidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/25 bg-indigo-950/20 hover:bg-indigo-950/35 transition group"
                        >
                          <ExternalLink className="w-5 h-5 text-indigo-400 shrink-0" />
                          <span className="text-xs font-mono text-indigo-300 group-hover:text-indigo-200 break-all line-clamp-3">
                            {activeBug.evidenceUrl}
                          </span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Figma Reference Prototype Image */}
                  {activeBug.prototypeUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-[#00b4d8] uppercase flex items-center gap-1.5 font-bold">
                        🎨 Protótipo de Referência (Figma)
                      </span>
                      <div 
                        onClick={() => {
                          setFullscreenUrl(activeBug.prototypeUrl);
                          setIsFullscreenEvidence(true);
                        }}
                        className="rounded-xl border border-[#1e3a5f]/80 overflow-hidden max-h-[220px] aspect-video bg-[#00171f]/60 hover:opacity-85 transition cursor-zoom-in relative group"
                      >
                        <img 
                          src={activeBug.prototypeUrl} 
                          alt="Protótipo Original" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-[#00b4d8] font-mono transition">
                          Clique para ampliar figma
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Status controls, assign and audit logging sidebar */}
          <div className="lg:col-span-3 p-6 bg-[#0f172a]/20 border-r border-slate-800/50 space-y-6 flex flex-col">
            <div>
              <h3 className="font-mono text-xs font-bold text-slate-450 uppercase tracking-widest border-b border-slate-850 pb-2 mb-4">
                Painel Tático Operacional
              </h3>
              
              {/* Responsibility owner section */}
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-mono text-slate-450 mb-1.5">RESPONSABILIDADE:</span>
                  {activeBug.ownerId ? (
                    <div className="flex items-center justify-between p-3 bg-[#111827]/80 border border-slate-800 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-red-400 uppercase">
                          {activeBug.ownerName?.charAt(0)}
                        </div>
                        <div>
                          <span className="block text-sm font-bold text-white leading-none">{activeBug.ownerName}</span>
                          <span className="text-[10px] font-mono text-slate-450">Developer</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-950/5 border border-dashed border-red-500/25 rounded-xl text-center">
                      <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1.5" />
                      <span className="block text-xs text-slate-200 font-bold mb-2">Sem responsável ativo</span>
                      <button
                        onClick={handleClaimTask}
                        className="w-full py-1.5 bg-red-600/10 hover:bg-red-650 hover:text-white border border-red-500/20 hover:border-red-500 text-red-400 font-mono text-[10px] font-bold uppercase rounded transition cursor-pointer"
                      >
                        Assumir Correção (Claim)
                      </button>
                    </div>
                  )}
                </div>

                {/* Squad admin assignment drop selector */}
                {profile?.role === "admin" && (
                  <div>
                    <span className="block text-xs font-mono text-slate-450 mb-1.5 flex items-center gap-1">
                      <UserPlus className="w-3.5 h-3.5" /> ATRIBUIR RESPONSÁVEL:
                    </span>
                    <select
                      onChange={handleAssignOwner}
                      className="w-full bg-[#0f172a] border border-slate-850 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/50 transition cursor-pointer"
                    >
                      <option value="">Selecione um membro do squad...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Action status workflow path */}
            <div>
              <span className="block text-xs font-mono text-slate-450 mb-3 uppercase tracking-widest border-b border-slate-850 pb-2">
                Alterar Status Tático
              </span>
              
              <div className="space-y-2">
                {(["new", "under_analysis", "in_progress", "ready_for_qa", "validated", "reopened"] as BugStatus[]).map((statusValue) => {
                  const isCurrent = activeBug.status === statusValue;
                  const labelDetails = statusLabels[statusValue];

                  return (
                    <button
                      key={statusValue}
                      onClick={() => handleUpdateStatus(statusValue)}
                      className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between transition cursor-pointer ${
                        isCurrent 
                          ? "bg-slate-800/55 border-red-500/30 font-bold" 
                          : "bg-transparent border-slate-850 hover:bg-[#0f172a] hover:border-slate-800"
                      }`}
                    >
                      <span className={`text-xs ${isCurrent ? "text-red-400" : "text-slate-300"}`}>
                        {labelDetails.text}
                      </span>
                      {isCurrent && (
                        <CheckCircle className="w-4 h-4 text-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audit log details preview */}
            <div className="flex-1 flex flex-col min-h-[150px]">
              <span className="block text-xs font-mono text-slate-450 mb-3 uppercase tracking-widest border-b border-slate-850 pb-2">
                Timeline Tático de Auditoria
              </span>

              <div className="space-y-3.5 overflow-y-auto max-h-[220px] pr-1">
                {activityLogs.map((log) => {
                  const isEditLog =
                    log.type === "title_edit" || log.type === "description_edit";
                  return (
                    <div
                      key={log.id}
                      className={`text-xs rounded-lg p-2 ${
                        isEditLog ? "bg-violet-500/5 border border-violet-500/15" : ""
                      }`}
                    >
                      <span className="font-semibold text-slate-200 block">{log.description}</span>
                      <div className="flex gap-2 text-[10px] font-mono text-slate-450 mt-1">
                        <span>{log.userName}</span>
                        <span>•</span>
                        <span>
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString()
                            : ""}
                        </span>
                        {isEditLog && (
                          <>
                            <span>•</span>
                            <span className="text-violet-400">edição</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Column 3: Live real-time comments section */}
          <div className="lg:col-span-4 p-6 bg-[#0c101b] flex flex-col justify-between h-full min-h-[350px] lg:min-h-0">
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="block text-xs font-mono text-slate-450 mb-3 uppercase tracking-widest border-b border-white/[0.04] pb-2 flex items-center justify-between">
                <span>Comentários e Notas ({comments.length})</span>
                <span className="text-[10px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded font-bold uppercase tracking-normal">Anotações do Bug</span>
              </span>

              {/* Chat list bubble cards replaced by professional logs */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-4 max-h-[365px] lg:max-h-[580px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {comments.length === 0 ? (
                  <div className="text-center py-12">
                    <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs font-mono leading-relaxed">
                      Nenhuma anotação registrada ainda neste incidente.
                    </p>
                  </div>
                ) : (
                  comments.map((com) => {
                    const initials = com.userName ? com.userName.slice(0, 2).toUpperCase() : "??";
                    return (
                      <div key={com.id} className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase">
                              {initials}
                            </div>
                            <span className="font-mono text-xs font-bold text-slate-200">
                              {com.userName}
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-slate-500">
                            {com.createdAt ? new Date(com.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed pl-1 whitespace-pre-wrap">
                          {com.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Comment post form inputs wrapper - styled as a clear textarea and submission button */}
            <form onSubmit={handlePostComment} className="pt-4 border-t border-white/[0.04] flex flex-col gap-3">
              <textarea
                required
                rows={5}
                className="w-full bg-[#111827] border border-slate-850 focus:border-red-500/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-650 focus:outline-none resize-none font-sans leading-relaxed focus:ring-1 focus:ring-red-500/25"
                placeholder="Escreva uma nota técnica detalhada, comentários ou atualização de progresso operacional para este incidente..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingComment || !newComment.trim()}
                  className="px-4 py-2 bg-red-650 hover:bg-red-650/85 disabled:bg-slate-850 text-white font-mono text-[11px] font-bold border border-red-500/20 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  SALVAR COMENTÁRIO
                </button>
              </div>
            </form>
          </div>
        </div>
      </motion.div>

      {/* Screen fullscreen visual popup */}
      <AnimatePresence>
        {isFullscreenEvidence && fullscreenUrl && (
          <div 
            onClick={() => {
              setIsFullscreenEvidence(false);
              setFullscreenUrl(null);
            }}
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3"
            >
              <img 
                src={fullscreenUrl} 
                alt="Fullscreen Preview" 
                referrerPolicy="no-referrer"
                className="rounded-xl max-h-[80vh] object-contain shadow-2xl" 
                onClick={(e) => e.stopPropagation()} 
              />
              <span className="text-xs font-mono text-slate-400">Clique em qualquer local fora da imagem para fechar</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
