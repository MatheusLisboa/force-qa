import React, { useEffect, useState, useRef, useCallback } from "react";
import { subscribeBug, subscribeBugComments, subscribeActivityLogs } from "../lib/supabase";
import { updateBugField, createComment, fetchUsersList } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { Bug, BugComment, ActivityLog, BugStatus } from "../types";
import { isImageEvidence } from "../lib/evidence";
import { truncateForLog, getStatusLabel } from "../lib/bugLabels";
import { BugTypeTag } from "./BugTypeTag";
import { SeverityBadge, StatusBadge } from "./BugBadges";
import { useModalA11y } from "../hooks/useModalA11y";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const evidenceDialogRef = useRef<HTMLDivElement>(null);

  const closeEvidenceFullscreen = useCallback(() => {
    setIsFullscreenEvidence(false);
    setFullscreenUrl(null);
  }, []);

  useModalA11y(true, onClose, dialogRef);
  useModalA11y(isFullscreenEvidence && !!fullscreenUrl, closeEvidenceFullscreen, evidenceDialogRef);

  const canEdit = profile?.role !== "viewer";

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

    let logMessage = `Mudou status de "${getStatusLabel(activeBug.status)}" ${stateDescMap[newStatus]}`;
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
    <div className="fq-modal-overlay">
      <motion.div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-detail-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="fq-modal fq-modal--xl fq-modal--tall h-[92vh] overflow-hidden flex flex-col !p-0"
      >
        <h2 id="bug-detail-modal-title" className="sr-only">
          Detalhe do incidente: {activeBug.title}
        </h2>
        {/* Header toolbar */}
        <div className="flex justify-between items-center border-b px-4 py-4 lg:px-5"
          style={{ borderColor: "var(--color-fq-border-subtle)", backgroundColor: "var(--color-fq-surface)" }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="p-1 px-2.5 fq-badge bg-white/[0.04] text-neutral-500 border-white/[0.06] font-mono text-[10px] font-bold">
              ID: {activeBug.id}
            </span>
            <BugTypeTag type={activeBug.type} size="md" />
            <SeverityBadge severity={activeBug.criticism} size="md" />
            <StatusBadge status={activeBug.status} size="md" />
          </div>

          <button 
            onClick={onClose}
            className="fq-btn-icon"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace body columns hierarchy scrolling container */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Column 1: Bug details & screenshot evidences */}
          <div className="lg:col-span-5 fq-detail-panel fq-detail-panel-bordered">
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
                  <h2 className="text-xl font-semibold text-neutral-100 leading-tight flex-1">
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
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-500 mt-3 border-b border-white/[0.06] pb-4">
                <span>HUNTER: <span className="text-neutral-300">{activeBug.createdByName}</span></span>
                <span>•</span>
                <span>ENV: <span className="text-neutral-300 uppercase">{activeBug.environment === "homologation" ? "HMG" : activeBug.environment === "production" ? "PROD" : "DEV"}</span></span>
              </div>
            </div>

            {/* Description text block */}
            <div className="fq-panel">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-neutral-500 uppercase flex items-center gap-1.5">
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
                    className="w-full fq-textarea text-sm min-h-[120px]"
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
                <p className="text-neutral-300 text-sm whitespace-pre-wrap leading-relaxed">
                  {activeBug.description || "Nenhuma descrição complementar foi fornecida."}
                </p>
              )}
            </div>

            {/* Structured details meta card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="fq-panel">
                <span className="text-[10px] font-mono text-neutral-500 uppercase flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5" /> URL / Plataforma Afetada
                </span>
                <span className="text-xs font-mono text-violet-400 break-all bg-violet-500/10 px-2 py-1.5 rounded block border border-violet-500/15">
                  {activeBug.affectedUrl || "Nenhuma URL especificada"}
                </span>
              </div>

              <div className="fq-panel">
                <span className="text-[10px] font-mono text-neutral-500 uppercase flex items-center gap-1.5 mb-2">
                  <Grid className="w-3.5 h-3.5" /> Build / Versão do Sistema
                </span>
                <span className="text-xs font-mono text-neutral-300 bg-white/[0.04] px-2 py-1.5 rounded block border border-white/[0.06]">
                  {activeBug.buildVersion || "Nenhum ID de build inserido"}
                </span>
              </div>
            </div>

            {/* Tags layout list */}
            {activeBug.tags && activeBug.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-neutral-500" />
                <div className="flex gap-2.5">
                  {activeBug.tags.map(tag => (
                    <span key={tag} className="fq-badge bg-white/[0.04] text-neutral-400 border-white/[0.06] font-mono uppercase">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot evidence and prototype comparative render panel */}
            {(activeBug.evidenceUrl || activeBug.prototypeUrl) && (
              <div className="pt-4 border-t border-white/[0.06]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeBug.evidenceUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase flex items-center gap-1.5 font-bold">
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
                          className="fq-evidence-thumb group"
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
                          className="fq-evidence-link group"
                        >
                          <ExternalLink className="w-5 h-5 text-neutral-400 shrink-0 group-hover:text-neutral-200" />
                          <span className="text-xs font-mono break-all line-clamp-3">
                            {activeBug.evidenceUrl}
                          </span>
                        </a>
                      )}
                    </div>
                  )}

                  {activeBug.prototypeUrl && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase flex items-center gap-1.5 font-bold">
                        🎨 Protótipo de Referência (Figma)
                      </span>
                      <div 
                        onClick={() => {
                          setFullscreenUrl(activeBug.prototypeUrl);
                          setIsFullscreenEvidence(true);
                        }}
                        className="fq-evidence-thumb group"
                      >
                        <img 
                          src={activeBug.prototypeUrl} 
                          alt="Protótipo Original" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-neutral-200 font-mono transition">
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
          <div className="lg:col-span-3 fq-detail-panel fq-detail-panel-bordered flex flex-col">
            <div>
              <h3 className="fq-panel-title">
                Painel Tático Operacional
              </h3>
              
              {/* Responsibility owner section */}
              <div className="space-y-4">
                <div>
                  <span className="fq-label fq-label--inline !mb-1.5">RESPONSABILIDADE:</span>
                  {activeBug.ownerId ? (
                    <div className="flex items-center justify-between p-3 fq-panel">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-white/[0.08] border border-white/[0.06] flex items-center justify-center font-bold text-sm text-neutral-300 uppercase">
                          {activeBug.ownerName?.charAt(0)}
                        </div>
                        <div>
                          <span className="block text-sm font-semibold text-neutral-100 leading-none">{activeBug.ownerName}</span>
                          <span className="text-[10px] font-mono text-neutral-500">Developer</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 fq-panel border-dashed text-center">
                      <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1.5" />
                      <span className="block text-xs text-neutral-200 font-medium mb-2">Sem responsável ativo</span>
                      <button
                        onClick={handleClaimTask}
                        className="fq-btn-secondary w-full text-[10px] font-mono font-bold uppercase"
                      >
                        Assumir Correção (Claim)
                      </button>
                    </div>
                  )}
                </div>

                {/* Squad admin assignment drop selector */}
                {profile?.role === "admin" && (
                  <div>
                    <span className="fq-label fq-label--inline !mb-1.5 gap-1">
                      <UserPlus className="w-3.5 h-3.5" /> ATRIBUIR RESPONSÁVEL:
                    </span>
                    <select
                      onChange={handleAssignOwner}
                      className="fq-select text-xs"
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
              <span className="fq-panel-title">
                Alterar Status Tático
              </span>
              
              <div className="space-y-2">
                {(["new", "under_analysis", "in_progress", "ready_for_qa", "validated", "reopened"] as BugStatus[]).map((statusValue) => {
                  const isCurrent = activeBug.status === statusValue;

                  return (
                    <button
                      key={statusValue}
                      onClick={() => handleUpdateStatus(statusValue)}
                      className={`fq-status-option ${isCurrent ? "fq-status-option--active" : ""}`}
                    >
                      <span>{getStatusLabel(statusValue)}</span>
                      {isCurrent && (
                        <CheckCircle className="w-4 h-4 text-neutral-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-[150px]">
              <span className="fq-panel-title">
                Timeline Tático de Auditoria
              </span>

              <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                {activityLogs.map((log) => {
                  const isEditLog =
                    log.type === "title_edit" || log.type === "description_edit";
                  return (
                    <div
                      key={log.id}
                      className={`fq-timeline-item ${isEditLog ? "fq-timeline-item--edit" : ""}`}
                    >
                      <span className="font-medium text-neutral-200 block">{log.description}</span>
                      <div className="flex gap-2 text-[10px] font-mono text-neutral-500 mt-1">
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
          <div className="lg:col-span-4 fq-detail-panel flex flex-col justify-between h-full min-h-[350px] lg:min-h-0"
            style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
          >
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="fq-panel-title flex items-center justify-between">
                <span>Comentários e Notas ({comments.length})</span>
                <span className="fq-badge bg-white/[0.06] text-neutral-400 border-white/[0.08] normal-case tracking-normal">Anotações do Bug</span>
              </span>

              {/* Chat list bubble cards replaced by professional logs */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-4 max-h-[365px] lg:max-h-[580px] scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
                {comments.length === 0 ? (
                  <div className="text-center py-12">
                    <Terminal className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
                    <p className="text-neutral-500 text-xs font-mono leading-relaxed">
                      Nenhuma anotação registrada ainda neste incidente.
                    </p>
                  </div>
                ) : (
                  comments.map((com) => {
                    const initials = com.userName ? com.userName.slice(0, 2).toUpperCase() : "??";
                    return (
                      <div key={com.id} className="fq-comment-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-neutral-300 uppercase">
                              {initials}
                            </div>
                            <span className="font-mono text-xs font-medium text-neutral-200">
                              {com.userName}
                            </span>
                          </div>
                          <span className="font-mono text-[9px] text-neutral-500">
                            {com.createdAt ? new Date(com.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 leading-relaxed pl-1 whitespace-pre-wrap">
                          {com.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Comment post form inputs wrapper - styled as a clear textarea and submission button */}
            <form onSubmit={handlePostComment} className="pt-4 border-t border-white/[0.06] flex flex-col gap-3">
              <textarea
                required
                rows={5}
                className="fq-textarea text-sm leading-relaxed"
                placeholder="Escreva uma nota técnica detalhada, comentários ou atualização de progresso operacional para este incidente..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingComment || !newComment.trim()}
                  className="fq-btn-primary text-[11px] font-mono font-bold"
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
            onClick={closeEvidenceFullscreen}
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div 
              ref={evidenceDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="evidence-fullscreen-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="evidence-fullscreen-title" className="sr-only">
                Visualização ampliada de evidência
              </h2>
              <img 
                src={fullscreenUrl} 
                alt="Fullscreen Preview" 
                referrerPolicy="no-referrer"
                className="rounded-xl max-h-[80vh] object-contain shadow-2xl" 
                onClick={(e) => e.stopPropagation()} 
              />
              <span className="text-xs font-mono text-neutral-500">Clique em qualquer local fora da imagem para fechar</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
