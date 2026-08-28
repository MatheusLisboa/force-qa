import React, { useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y";
import { createProject } from "../lib/services";
import { SquadSelect } from "./SquadSelect";

interface CreateProjectModalProps {
  open: boolean;
  createdBy: string;
  createdByName: string;
  organizationId?: string;
  onClose: () => void;
  onCreated: (warRoomId: string) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  open,
  createdBy,
  createdByName,
  organizationId,
  onClose,
  onCreated,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const [name, setName] = useState("");
  const [squad, setSquad] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !squad.trim()) {
      setFormError("Preencha todos os campos obrigatórios.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const { warRoomId } = await createProject({
        name: name.trim(),
        squad: squad.trim(),
        description: description.trim(),
        createdBy,
        createdByName,
        organizationId,
      });
      setName("");
      setSquad("");
      setDescription("");
      onCreated(warRoomId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      setFormError("Erro ao criar projeto: " + message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fq-modal-overlay">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fq-modal fq-modal--md"
      >
        <div className="fq-modal-header">
          <h3 id="project-modal-title" className="fq-modal-title">
            <LayoutGrid className="w-5 h-5 text-neutral-400" /> Novo Projeto
          </h3>
          <button onClick={onClose} className="fq-btn-icon" aria-label="Fechar">
            X
          </button>
        </div>

        <p className="text-[13px] text-neutral-500 mb-4 leading-relaxed">
          Depois de criar, você pode salvar visões do Kanban em Mais → Visões.
        </p>

        {formError && <div className="fq-alert-error mb-4">{formError}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm text-neutral-300">
          <div>
            <label className="fq-label">Nome do Projeto *</label>
            <input
              required
              type="text"
              className="fq-input"
              placeholder="Ex: Portal Admin"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="fq-label">Área *</label>
            <SquadSelect required value={squad} onChange={setSquad} />
          </div>

          <div>
            <label className="fq-label">Descrição</label>
            <textarea
              rows={3}
              className="fq-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-3 font-semibold">
            <button type="button" onClick={onClose} className="fq-btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="fq-btn-primary">
              {submitting ? "Criando..." : "Criar Projeto"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
