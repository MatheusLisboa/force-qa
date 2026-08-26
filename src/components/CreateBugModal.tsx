import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle, Sparkles, Upload } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { createBug, fetchAIDuplicateCheck } from "../lib/services";
import { uploadEvidenceFile } from "../lib/evidence";
import { canWriteBugs } from "../lib/permissions";
import { BUG_TYPE_OPTIONS } from "../lib/bugLabels";
import { Bug, BugPriority, BugType, SeverityLevel } from "../types";

interface CreateBugModalProps {
  open: boolean;
  roomId: string;
  existingBugs: Pick<Bug, "id" | "title" | "description">[];
  presetType?: BugType;
  onClose: () => void;
}

export const CreateBugModal: React.FC<CreateBugModalProps> = ({
  open,
  roomId,
  existingBugs,
  presetType = "bug",
  onClose,
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugCrit, setBugCrit] = useState<SeverityLevel>("medium");
  const [bugEnv, setBugEnv] = useState<"production" | "homologation" | "dev">("production");
  const [bugType, setBugType] = useState<BugType>(presetType);

  useEffect(() => {
    if (open) setBugType(presetType);
  }, [open, presetType]);
  const [bugPriority, setBugPriority] = useState<BugPriority>("medium");
  const [bugUrl, setBugUrl] = useState("");
  const [bugTagsInput, setBugTagsInput] = useState("");
  const [bugEvidence, setBugEvidence] = useState<string | null>(null);
  const [bugEvidenceFile, setBugEvidenceFile] = useState<File | null>(null);
  const [bugEvidenceLink, setBugEvidenceLink] = useState("");
  const [bugPrototype, setBugPrototype] = useState<string | null>(null);
  const [bugPrototypeFile, setBugPrototypeFile] = useState<File | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [moreDetails, setMoreDetails] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<{
    isDuplicate: boolean;
    explanation: string;
    confidenceScore: number;
  } | null>(null);

  const resetForm = useCallback(() => {
    setBugTitle("");
    setBugDesc("");
    setBugCrit("medium");
    setBugEnv("production");
    setBugType(presetType);
    setBugPriority("medium");
    setBugUrl("");
    setBugTagsInput("");
    setBugEvidence(null);
    setBugEvidenceFile(null);
    setBugEvidenceLink("");
    setBugPrototype(null);
    setBugPrototypeFile(null);
    setDuplicateAlert(null);
    setFormError("");
    setMoreDetails(false);
  }, [presetType]);

  const closeAndReset = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, kind: "evidence" | "prototype") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Arquivos de evidência devem ter no máximo 2MB.", { kind: "error" });
      return;
    }
    const preview = URL.createObjectURL(file);
    if (kind === "evidence") {
      setBugEvidenceFile(file);
      setBugEvidence(preview);
      setBugEvidenceLink("");
    } else {
      setBugPrototypeFile(file);
      setBugPrototype(preview);
    }
  };

  const handleReportBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim()) {
      setFormError("Informe um título para o card.");
      return;
    }

    setFormSubmitting(true);
    setFormError("");
    try {
      if (!canWriteBugs(profile?.role)) {
        throw new Error("Observadores não podem criar cards.");
      }

      try {
        const triage = await fetchAIDuplicateCheck(
          bugTitle,
          bugDesc,
          existingBugs.map((b) => ({ id: b.id, title: b.title, description: b.description || "" }))
        );
        setDuplicateAlert(triage);
        if (triage.isDuplicate && (triage.confidenceScore ?? 0) >= 70) {
          const proceed = window.confirm(
            `Possível duplicata (${triage.confidenceScore}%): ${triage.explanation}\n\nCriar o card mesmo assim?`
          );
          if (!proceed) {
            setFormSubmitting(false);
            return;
          }
        }
      } catch (dupErr) {
        console.warn("Checagem de duplicata indisponível:", dupErr);
      }

      let evidenceValue = bugEvidenceLink.trim() || undefined;
      if (bugEvidenceFile) {
        evidenceValue = await uploadEvidenceFile(roomId, bugEvidenceFile);
      } else if (evidenceValue?.startsWith("data:")) {
        throw new Error("Envie a evidência pelo campo de arquivo.");
      }

      let prototypeValue: string | undefined;
      if (bugPrototypeFile) {
        prototypeValue = await uploadEvidenceFile(roomId, bugPrototypeFile);
      }

      const splitTags = bugTagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      await createBug({
        warRoomId: roomId,
        title: bugTitle.trim(),
        description: bugDesc.trim(),
        criticism: bugCrit,
        status: "new",
        kanbanColumnId: "new",
        evidenceUrl: evidenceValue,
        prototypeUrl: prototypeValue,
        ownerId: null,
        ownerName: null,
        environment: bugEnv,
        affectedUrl: bugUrl.trim() || undefined,
        tags: splitTags,
        priority: bugPriority,
        type: bugType,
        createdBy: profile?.id || "unknown",
        createdByName: profile?.name || "Anônimo",
      }, profile?.id || "unknown", profile?.name || "Anônimo");

      toast("Card criado.", { kind: "success" });
      closeAndReset();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Falha ao criar o card.");
    } finally {
      setFormSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fq-modal-overlay">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-create-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fq-modal fq-modal--md fq-modal--tall max-h-[90vh]"
      >
        <div className="fq-modal-header !mb-0 shrink-0">
          <h3 id="bug-create-modal-title" className="fq-modal-title">
            <Sparkles className="w-5 h-5 text-neutral-400" /> Novo Card
          </h3>
          <button onClick={closeAndReset} className="fq-btn-icon" aria-label="Fechar">X</button>
        </div>

        <form onSubmit={handleReportBug} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 text-sm text-neutral-400">
            {formError && <div className="fq-alert-error text-xs">{formError}</div>}

            <div>
              <label className="fq-label fq-label--xs">Título *</label>
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
              <label className="fq-label fq-label--xs">Severidade</label>
              <select value={bugCrit} onChange={(e) => setBugCrit(e.target.value as SeverityLevel)} className="fq-input">
                <option value="blocker">Blocker</option>
                <option value="critical">Crítico</option>
                <option value="high">Alto</option>
                <option value="medium">Médio</option>
                <option value="low">Baixo</option>
              </select>
            </div>

            <div>
              <label className="fq-label fq-label--xs">Evidência (imagem ou link)</label>
              <input
                type="url"
                className="fq-input text-[13px] mb-2"
                placeholder="https://..."
                value={bugEvidenceLink}
                onChange={(e) => {
                  setBugEvidenceLink(e.target.value);
                  if (e.target.value.trim()) {
                    setBugEvidence(null);
                    setBugEvidenceFile(null);
                  }
                }}
              />
              <div className="fq-upload-zone space-y-2">
                <Upload className="w-6 h-6 text-neutral-500 mx-auto" />
                <span className="block text-[12px] text-neutral-400">Ou envie imagem (PNG/JPG, máx. 2MB)</span>
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "evidence")} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              {(bugEvidence || bugEvidenceLink.trim()) && (
                <div className="fq-attachment-chip">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-[12px] text-neutral-400 truncate">
                    {bugEvidence ? "Imagem anexada" : `Link: ${bugEvidenceLink.trim()}`}
                  </span>
                  <button type="button" onClick={() => { setBugEvidence(null); setBugEvidenceFile(null); setBugEvidenceLink(""); }} className="ml-auto text-[12px] text-red-400 hover:underline">
                    Excluir
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="fq-label fq-label--xs">O que aconteceu</label>
              <textarea
                rows={3}
                className="fq-textarea font-sans"
                placeholder="Passos, logs e comportamento observado..."
                value={bugDesc}
                onChange={(e) => setBugDesc(e.target.value)}
              />
            </div>
            {duplicateAlert && (
              <div className={`p-3 border rounded-md text-[12px] leading-relaxed ${
                duplicateAlert.isDuplicate
                  ? "bg-yellow-950/20 border-yellow-500/30 text-yellow-400"
                  : "bg-green-950/10 border-green-500/20 text-green-400"
              }`}>
                {duplicateAlert.explanation} ({duplicateAlert.confidenceScore}%)
              </div>
            )}

            <button
              type="button"
              className="text-[13px] text-neutral-400 hover:text-neutral-200"
              onClick={() => setMoreDetails((open) => !open)}
            >
              {moreDetails ? "Menos detalhes" : "Mais detalhes"}
            </button>

            {moreDetails && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="fq-label fq-label--xs">Ambiente</label>
                    <select value={bugEnv} onChange={(e) => setBugEnv(e.target.value as "production" | "homologation" | "dev")} className="fq-input">
                      <option value="production">Produção</option>
                      <option value="homologation">Homologação</option>
                      <option value="dev">Dev</option>
                    </select>
                  </div>
                  <div>
                    <label className="fq-label fq-label--xs">Tipo</label>
                    <select value={bugType} onChange={(e) => setBugType(e.target.value as BugType)} className="fq-select">
                      {BUG_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="fq-label fq-label--xs">Prioridade</label>
                    <select value={bugPriority} onChange={(e) => setBugPriority(e.target.value as BugPriority)} className="fq-select">
                      <option value="immediate">Imediata</option>
                      <option value="high">Alta</option>
                      <option value="medium">Média</option>
                      <option value="low">Baixa</option>
                    </select>
                  </div>
                  <div>
                    <label className="fq-label fq-label--xs">URL relacionada</label>
                    <input type="url" className="fq-input text-[13px]" placeholder="https://..." value={bugUrl} onChange={(e) => setBugUrl(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="fq-label fq-label--xs">Tags (separadas por vírgula)</label>
                  <input className="fq-input text-[13px]" value={bugTagsInput} onChange={(e) => setBugTagsInput(e.target.value)} placeholder="pix, checkout" />
                </div>
                <div>
                  <label className="fq-label fq-label--xs">Protótipo (opcional)</label>
                  <div className="fq-upload-zone space-y-2">
                    <Upload className="w-6 h-6 text-neutral-500 mx-auto opacity-70" />
                    <span className="block text-[12px] text-neutral-400">Referência visual (PNG/JPG, máx. 2MB)</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "prototype")} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  {bugPrototype && (
                    <div className="fq-attachment-chip">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-[12px] text-neutral-400">Protótipo anexado</span>
                      <button type="button" onClick={() => { setBugPrototype(null); setBugPrototypeFile(null); }} className="ml-auto text-[12px] text-red-400 hover:underline">
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="fq-modal-footer">
            <button type="button" onClick={closeAndReset} className="fq-btn-ghost text-xs">Cancelar</button>
            <button type="submit" disabled={formSubmitting || !bugTitle.trim()} className="fq-btn-primary">
              {formSubmitting ? "Criando card..." : "Criar Card"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
