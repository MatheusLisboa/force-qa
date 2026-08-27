import React, { useRef, useState } from "react";
import { Clock } from "lucide-react";
import { motion } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y";
import { createWarRoom } from "../lib/services";
import { SeverityLevel } from "../types";
import { SquadSelect } from "./SquadSelect";
import { SeverityPicker } from "./SeverityPicker";

interface CreateWarRoomModalProps {
  open: boolean;
  createdBy: string;
  createdByName: string;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export const CreateWarRoomModal: React.FC<CreateWarRoomModalProps> = ({
  open,
  createdBy,
  createdByName,
  onClose,
  onCreated,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [squad, setSquad] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SeverityLevel>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !project.trim() || !squad.trim()) {
      setFormError("Preencha todos os campos obrigatórios.");
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
        createdBy,
        createdByName,
      });
      setName("");
      setProject("");
      setSquad("");
      setDescription("");
      setPeriodEnd("");
      setSeverity("medium");
      onCreated(roomId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";
      setFormError("Erro ao criar War Room: " + message);
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
          <button onClick={onClose} className="fq-btn-icon" aria-label="Fechar">
            X
          </button>
        </div>

        <p className="text-xs text-neutral-500 font-mono mb-4">
          Sessão de QA com data de início e término (release, hotfix ou incidente).
        </p>

        {formError && <div className="fq-alert-error mb-4">{formError}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm text-neutral-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="fq-label">Nome da War Room *</label>
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
              <label className="fq-label">Projeto / Sistema *</label>
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
              <label className="fq-label">Área *</label>
              <SquadSelect required value={squad} onChange={setSquad} />
            </div>
            <div>
              <label className="fq-label">Data de Início *</label>
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
            <label className="fq-label">Data de Término (opcional)</label>
            <input
              type="date"
              className="fq-input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>

          <div>
            <label className="fq-label">Descrição do Escopo</label>
            <textarea
              rows={3}
              className="fq-textarea"
              placeholder="Contexto do incidente e escopo dos testes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="fq-label">Severidade Geral Prevista</label>
            <SeverityPicker value={severity} onChange={setSeverity} />
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex justify-end gap-3 font-semibold">
            <button type="button" onClick={onClose} className="fq-btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="fq-btn-primary">
              {submitting ? "Criando..." : "Criar War Room"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
