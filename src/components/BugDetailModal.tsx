import React, { useEffect, useState, useRef, useCallback } from "react";
import { subscribeBug, subscribeBugComments, subscribeActivityLogs } from "../lib/supabase";
import { updateBugField, createComment, fetchUsersList, archiveBug } from "../lib/services";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { Bug, BugComment, ActivityLog, BugStatus } from "../types";
import { isImageEvidence } from "../lib/evidence";
import { truncateForLog, getStatusLabel, ENVIRONMENT_LABELS } from "../lib/bugLabels";
import { BugTypeTag } from "./BugTypeTag";
import { SeverityBadge, StatusBadge } from "./BugBadges";
import { useModalA11y } from "../hooks/useModalA11y";
import { canArchiveBugs, canAssignBugs, canWriteBugs } from "../lib/permissions";
import { 
  X, 
  Send, 
  UserPlus, 
  CheckCircle, 
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
  const { toast } = useToast();
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

  const canEdit = canWriteBugs(profile?.role);

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
      toast("O título não pode ficar vazio.", { kind: "error" });
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
    if (!canWriteBugs(profile.role)) {
      toast("Observadores não podem modificar o status de tarefas.", { kind: "error" });
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
      cleanFields.kanbanColumnId = "reopened";
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
    if (!canWriteBugs(profile.role)) {
      toast("Observadores não podem assumir cards.", { kind: "error" });
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
    if (!profile || !canAssignBugs(profile.role)) return;
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
    <div className="fq-drawer-overlay" onClick={onClose}>
      <motion.div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-detail-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="fq-drawer"
      >
        <div className="flex justify-between items-start gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--color-fq-border-subtle)", backgroundColor: "var(--color-fq-surface)" }}
        >
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  className="w-full fq-input text-base font-semibold"
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
                <h2 id="bug-detail-modal-title" className="text-base font-semibold text-neutral-100 leading-tight flex-1">
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BugTypeTag type={activeBug.type} size="md" />
              <SeverityBadge severity={activeBug.criticism} size="md" />
              <StatusBadge status={activeBug.status} size="md" />
            </div>
            <p className="mt-1.5 text-[12px] text-neutral-500">
              {activeBug.createdByName}
              <span className="text-neutral-700"> · </span>
              {ENVIRONMENT_LABELS[activeBug.environment] || activeBug.environment}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(canArchiveBugs(profile?.role) || activeBug.createdBy === profile?.id) && (
              <button
                type="button"
                className="fq-btn-danger text-[10px] font-mono !py-1.5"
                onClick={async () => {
                  if (!profile) return;
                  if (!window.confirm("Arquivar este card? Ele sai do Kanban, mas o histórico permanece.")) return;
                  try {
                    await archiveBug(activeBug.id, activeBug.warRoomId, profile.id, profile.name);
                    onClose();
                  } catch (err) {
                    console.error(err);
                    toast(err instanceof Error ? err.message : "Não foi possível arquivar.", { kind: "error" });
                  }
                }}
              >
                Arquivar
              </button>
            )}
            <button 
              onClick={onClose}
              className="fq-btn-icon"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="fq-detail-panel space-y-4">
            <p className="text-[12px] font-medium text-neutral-400">O que é</p>

            {/* Description text block */}
            <div className="fq-panel">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-neutral-500 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Descrição
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

            <details className="rounded-lg border border-white/[0.06] p-3">
              <summary className="cursor-pointer text-[13px] text-neutral-400">Mais detalhes</summary>
              <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-3">
              <div className="fq-panel !p-3">
                <span className="text-[12px] text-neutral-500 flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5" /> URL
                </span>
                <span className="text-xs text-neutral-300 break-all">
                  {activeBug.affectedUrl || "Nenhuma URL"}
                </span>
              </div>

              <div className="fq-panel !p-3">
                <span className="text-[12px] text-neutral-500 flex items-center gap-1.5 mb-2">
                  <Grid className="w-3.5 h-3.5" /> Build
                </span>
                <span className="text-xs text-neutral-300">
                  {activeBug.buildVersion || "—"}
                </span>
              </div>
            </div>

            {activeBug.tags && activeBug.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-neutral-500" />
                <div className="flex gap-2.5 flex-wrap">
                  {activeBug.tags.map(tag => (
                    <span key={tag} className="fq-badge bg-white/[0.04] text-neutral-400 border-white/[0.06]">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
              </div>
            </details>

            {/* Screenshot evidence and prototype comparative render panel */}
            {(activeBug.evidenceUrl || activeBug.prototypeUrl) && (
              <div className="pt-4 border-t border-white/[0.06]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeBug.evidenceUrl && (
                    <div className="space-y-2">
                      <span className="text-[12px] text-neutral-500 font-medium">
                        {isImageEvidence(activeBug.evidenceUrl)
                          ? "Evidência"
                          : "Link de evidência"}
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
                      <span className="text-[12px] text-neutral-500 font-medium">
                        Protótipo
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
          <div className="fq-detail-panel space-y-4 border-t border-white/[0.06]">
            <div>
              <p className="text-[12px] font-medium text-neutral-400 mb-3">
                O que fazer
              </p>
              
              {/* Responsibility owner section */}
              <div className="space-y-4">
                <div>
                  <span className="fq-label fq-label--inline !mb-1.5">Responsável</span>
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
                      <span className="block text-xs text-neutral-200 font-medium mb-2">Sem responsável</span>
                      <button
                        onClick={handleClaimTask}
                        className="fq-btn-secondary w-full text-xs"
                      >
                        Assumir
                      </button>
                    </div>
                  )}
                </div>

                {/* Squad admin assignment drop selector */}
                {canAssignBugs(profile?.role) && (
                  <div>
                    <span className="fq-label fq-label--inline !mb-1.5 gap-1">
                      <UserPlus className="w-3.5 h-3.5" /> Atribuir
                    </span>
                    <select
                      onChange={handleAssignOwner}
                      className="fq-select text-xs"
                    >
                      <option value="">Membro do squad...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Action status workflow path */}
            <div>
              <span className="fq-panel-title">
                Alterar status
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

            <details className="rounded-lg border border-white/[0.06] p-3">
              <summary className="cursor-pointer text-[13px] text-neutral-400">Histórico</summary>
              <div className="mt-3 space-y-2 max-h-[180px] overflow-y-auto pr-1">
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
            </details>
          </div>

          <div className="fq-detail-panel space-y-3 border-t border-white/[0.06]">
            <div>
              <span className="text-[12px] font-medium text-neutral-400">
                Comentários ({comments.length})
              </span>

              <div className="mt-3 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-neutral-500 text-sm">
                    Nenhuma nota ainda.
                  </p>
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
            <form onSubmit={handlePostComment} className="shrink-0 border-t border-white/[0.06] p-4 flex flex-col gap-2">
              <textarea
                required
                rows={2}
                className="fq-textarea text-sm leading-relaxed"
                placeholder="Escreva um comentário..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingComment || !newComment.trim()}
                  className="fq-btn-primary text-xs"
                >
                  <Send className="w-3 h-3" />
                  Enviar
                </button>
              </div>
            </form>
          </div>
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
