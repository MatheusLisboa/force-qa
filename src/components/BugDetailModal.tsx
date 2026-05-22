import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { updateBugField, createComment, fetchUsersList } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { Bug, BugComment, ActivityLog, BugStatus, SeverityLevel } from "../types";
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
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BugDetailModalProps {
  bug: Bug;
  onClose: () => void;
}

export const BugDetailModal: React.FC<BugDetailModalProps> = ({ bug, onClose }) => {
  const { profile } = useAuth();
  const [comments, setComments] = useState<BugComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isFullscreenEvidence, setIsFullscreenEvidence] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

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
    // 1. Listen for real-time Comments
    const commentsQuery = query(
      collection(db, "bugs", bug.id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      const coms: BugComment[] = [];
      snapshot.forEach((doc) => {
        coms.push(doc.data() as BugComment);
      });
      setComments(coms);
    });

    // 2. Listen for real-time Activity Logs
    const logsQuery = query(
      collection(db, "bugs", bug.id, "activityLogs"),
      orderBy("createdAt", "desc")
    );
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs: ActivityLog[] = [];
      snapshot.forEach((doc) => {
        logs.push(doc.data() as ActivityLog);
      });
      setActivityLogs(logs);
    });

    // 3. Get team members to enable assignment
    fetchUsersList().then((res) => {
      setUsers(res);
    });

    return () => {
      unsubscribeComments();
      unsubscribeLogs();
    };
  }, [bug.id]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    setSubmittingComment(true);
    try {
      await createComment({
        bugId: bug.id,
        warRoomId: bug.warRoomId,
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

    let logMessage = `Mudou status de "${statusLabels[bug.status].text}" ${stateDescMap[newStatus]}`;
    const cleanFields: Partial<Bug> = { status: newStatus };

    if (newStatus === "reopened") {
      cleanFields.reopenCount = (bug.reopenCount || 0) + 1;
      logMessage = `Reabriu o bug (Contador: ${cleanFields.reopenCount})`;
    }

    try {
      await updateBugField(bug.id, bug.warRoomId, cleanFields, profile.id, profile.name, logMessage);
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
        bug.id,
        bug.warRoomId,
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
        bug.id,
        bug.warRoomId,
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
        className="w-full max-w-5xl h-[92vh] bg-[#0d1220] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header toolbar */}
        <div className="p-4 lg:p-5 border-b border-slate-800/60 bg-[#0f172a]/40 flex justify-between items-center bg-zinc-900/10">
          <div className="flex items-center gap-3">
            <span className="p-1 px-2.5 bg-slate-805 text-slate-400 border border-slate-800 rounded font-mono text-[10px] font-bold">
              ID: {bug.id}
            </span>
            <span className={`p-1 px-2.5 text-[10px] font-mono tracking-wider font-extrabold rounded ${severityColors[bug.criticism]}`}>
              {severityLabels[bug.criticism]}
            </span>
            <span className={`p-1 px-2.5 text-[10px] uppercase font-mono font-bold rounded ${statusLabels[bug.status].bg} ${statusLabels[bug.status].textCol}`}>
              {statusLabels[bug.status].text}
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
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3">
          {/* Column 1: Bug details & screenshot evidences */}
          <div className="lg:col-span-2 p-6 border-r border-slate-800/50 space-y-6">
            <div>
              <h2 className="font-display text-2xl font-black text-white hover:text-red-400 transition duration-150 leading-tight">
                {bug.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-450 mt-3 border-b border-slate-850 pb-4">
                <span>HUNTER: <span className="text-slate-300">{bug.createdByName}</span></span>
                <span>•</span>
                <span>MODAL: <span className="text-slate-300 uppercase">{bug.type}</span></span>
                <span>•</span>
                <span>ENV: <span className="text-slate-300 uppercase">{bug.environment === "homologation" ? "HMG" : bug.environment === "production" ? "PROD" : "DEV"}</span></span>
              </div>
            </div>

            {/* Description text block */}
            <div className="bg-[#0f172a]/20 border border-slate-850 p-4 rounded-xl">
              <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5" /> DESCRIÇÃO
              </span>
              <p className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                {bug.description || "Nenhuma descrição operacional complementar foi fornecida originalmente por este analista."}
              </p>
            </div>

            {/* Structured details meta card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[#0c101b] border border-slate-850 rounded-xl">
                <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5" /> URL / Plataforma Afetada
                </span>
                <span className="text-xs font-mono text-indigo-400 break-all bg-indigo-950/20 px-2 py-1.5 rounded block">
                  {bug.affectedUrl || "Nenhuma URL especificada"}
                </span>
              </div>

              <div className="p-4 bg-[#0c101b] border border-slate-850 rounded-xl">
                <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 mb-2">
                  <Grid className="w-3.5 h-3.5" /> Build / Versão do Sistema
                </span>
                <span className="text-xs font-mono text-slate-200 bg-slate-900 px-2 py-1.5 rounded block">
                  {bug.buildVersion || "Nenhum ID de build inserido"}
                </span>
              </div>
            </div>

            {/* Tags layout list */}
            {bug.tags && bug.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-slate-450" />
                <div className="flex gap-2.5">
                  {bug.tags.map(tag => (
                    <span key={tag} className="bg-slate-800 text-slate-300 text-[10px] font-mono uppercase font-bold py-1 px-2.5 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot evidence and prototype comparative render panel */}
            {(bug.evidenceUrl || bug.prototypeUrl) && (
              <div className="pt-4 border-t border-slate-850">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Real production bug evidence image */}
                  {bug.evidenceUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-450 uppercase flex items-center gap-1.5 font-bold">
                        📸 Evidência do Bug Encontrado
                      </span>
                      <div 
                        onClick={() => {
                          setFullscreenUrl(bug.evidenceUrl);
                          setIsFullscreenEvidence(true);
                        }}
                        className="rounded-xl border border-slate-800/80 overflow-hidden max-h-[220px] aspect-video bg-black/40 hover:opacity-85 transition cursor-zoom-in relative group"
                      >
                        <img 
                          src={bug.evidenceUrl} 
                          alt="Evidência do Bug" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white font-mono transition">
                          Clique para ampliar evidência
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Figma Reference Prototype Image */}
                  {bug.prototypeUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-[#00b4d8] uppercase flex items-center gap-1.5 font-bold">
                        🎨 Protótipo de Referência (Figma)
                      </span>
                      <div 
                        onClick={() => {
                          setFullscreenUrl(bug.prototypeUrl);
                          setIsFullscreenEvidence(true);
                        }}
                        className="rounded-xl border border-[#1e3a5f]/80 overflow-hidden max-h-[220px] aspect-video bg-[#00171f]/60 hover:opacity-85 transition cursor-zoom-in relative group"
                      >
                        <img 
                          src={bug.prototypeUrl} 
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
          <div className="p-6 bg-[#0f172a]/20 border-r border-slate-800/50 space-y-6">
            <div>
              <h3 className="font-mono text-xs font-bold text-slate-450 uppercase tracking-widest border-b border-slate-850 pb-2 mb-4">
                Painel Tático Operacional
              </h3>
              
              {/* Responsibility owner section */}
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-mono text-slate-450 mb-1.5">RESPONSABILIDADE:</span>
                  {bug.ownerId ? (
                    <div className="flex items-center justify-between p-3 bg-[#111827]/80 border border-slate-800 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-red-400 uppercase">
                          {bug.ownerName?.charAt(0)}
                        </div>
                        <div>
                          <span className="block text-sm font-bold text-white leading-none">{bug.ownerName}</span>
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
                  const isCurrent = bug.status === statusValue;
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

              <div className="space-y-3.5 overflow-y-auto max-h-[200px] pr-1">
                {activityLogs.map((log) => (
                  <div key={log.id} className="text-xs">
                    <span className="font-semibold text-slate-200 block">{log.description}</span>
                    <div className="flex gap-2 text-[10px] font-mono text-slate-450 mt-1">
                      <span>{log.userName}</span>
                      <span>•</span>
                      <span>{log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 3: Live real-time comments section */}
          <div className="p-6 bg-[#0c101b] flex flex-col justify-between h-full min-h-[300px]">
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="block text-xs font-mono text-slate-450 mb-3 uppercase tracking-widest border-b border-white/[0.04] pb-2">
                Comentários da Tropa ({comments.length})
              </span>

              {/* Chat list bubble cards */}
              <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-4 max-h-[365px]">
                {comments.length === 0 ? (
                  <div className="text-center py-12">
                    <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs font-mono leading-relaxed">
                      Nenhuma conversa operacional ativa. Poste uma coordenada tática abaixo.
                    </p>
                  </div>
                ) : (
                  comments.map((com) => {
                    const isSelf = profile?.id === com.userId;

                    return (
                      <div key={com.id} className="space-y-1">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-450">
                          <span className={isSelf ? "text-red-400 font-bold" : "text-slate-350"}>
                            {com.userName}
                          </span>
                          <span>•</span>
                          <span>{com.createdAt ? new Date(com.createdAt).toLocaleTimeString() : ""}</span>
                        </div>
                        <div className={`p-3 rounded-xl text-xs max-w-[85%] leading-relaxed ${
                          isSelf 
                            ? "bg-red-500/10 border border-red-500/20 text-slate-200 ml-auto rounded-tr-none" 
                            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                        }`}>
                          {com.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Comment post form inputs wrapper */}
            <form onSubmit={handlePostComment} className="pt-4 border-t border-white/[0.04] flex gap-2">
              <input
                type="text"
                required
                className="flex-1 bg-[#111827] border border-slate-800 focus:border-red-500/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-650 focus:outline-none"
                placeholder="Digitar coordenada ou debug..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim()}
                className="p-2.5 bg-red-650 hover:bg-red-600 disabled:bg-slate-850 text-white border border-red-500/20 rounded-lg transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
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
