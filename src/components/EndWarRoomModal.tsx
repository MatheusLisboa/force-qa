import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Brain } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";
import { Bug, WarRoom } from "../types";
import { leftoverOpenBugs, LeftoverAction } from "../lib/endWarRoom";
import { applyLeftoverAction, findPermanentBoardForWarRoom, updateWarRoom } from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

interface EndWarRoomModalProps {
  open: boolean;
  warRoom: WarRoom;
  bugs: Bug[];
  canUseAi: boolean;
  onClose: () => void;
  onEnded: () => void;
  onOpenAiReport: () => void;
}

export const EndWarRoomModal: React.FC<EndWarRoomModalProps> = ({
  open,
  warRoom,
  bugs,
  canUseAi,
  onClose,
  onEnded,
  onOpenAiReport,
}) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  const leftovers = leftoverOpenBugs(bugs);
  const [action, setAction] = useState<LeftoverAction>("keep");
  const [board, setBoard] = useState<{ roomId: string; name: string } | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAction(leftovers.length ? "move" : "keep");
    setError("");
    setLoadingBoard(true);
    findPermanentBoardForWarRoom(warRoom)
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoadingBoard(false));
  }, [open, warRoom.id, warRoom.project, leftovers.length]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!profile) return;
    if (action === "move" && leftovers.length > 0 && !board) {
      setError("Não há board permanente deste projeto. Arquive, deixe na sala ou crie o projeto.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await applyLeftoverAction(
        leftovers,
        leftovers.length ? action : "keep",
        profile.id,
        profile.name,
        board?.roomId
      );
      await updateWarRoom(warRoom.id, { status: "ended" });
      toast("War room encerrada.", { kind: "success" });
      onEnded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível encerrar a sala.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fq-modal-overlay">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-room-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fq-modal fq-modal--md"
      >
        <div className="fq-modal-header">
          <h3 id="end-room-title" className="fq-modal-title">Encerrar war room</h3>
          <button type="button" className="fq-btn-icon" onClick={onClose} aria-label="Fechar">X</button>
        </div>

        <div className="space-y-4 text-sm text-neutral-400">
          {error && <div className="fq-alert-error text-xs">{error}</div>}

          {leftovers.length === 0 ? (
            <p>Não há cards abertos. A sala será marcada como encerrada.</p>
          ) : (
            <>
              <p>
                {leftovers.length} card{leftovers.length === 1 ? "" : "s"} ainda aberto
                {leftovers.length === 1 ? "" : "s"}. O que fazer com eles?
              </p>
              <ul className="max-h-32 overflow-y-auto space-y-1 text-[13px] text-neutral-300">
                {leftovers.slice(0, 12).map((bug) => (
                  <li key={bug.id} className="truncate">· {bug.title}</li>
                ))}
                {leftovers.length > 12 && (
                  <li className="text-neutral-500">+{leftovers.length - 12} outros</li>
                )}
              </ul>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="leftover"
                    checked={action === "move"}
                    onChange={() => setAction("move")}
                    className="mt-1"
                  />
                  <span>
                    Mover para o board permanente
                    {loadingBoard ? "…" : board ? ` (${board.name})` : " (nenhum board deste projeto)"}
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="leftover"
                    checked={action === "keep"}
                    onChange={() => setAction("keep")}
                    className="mt-1"
                  />
                  <span>Deixar na sala encerrada</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="leftover"
                    checked={action === "archive"}
                    onChange={() => setAction("archive")}
                    className="mt-1"
                  />
                  <span>Arquivar todos</span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="fq-modal-footer !justify-between">
          {canUseAi ? (
            <button
              type="button"
              className="fq-btn-ghost text-xs"
              onClick={onOpenAiReport}
            >
              <Brain className="w-3.5 h-3.5" />
              Relatório IA
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="fq-btn-ghost text-xs" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="fq-btn-primary text-xs" disabled={saving} onClick={handleConfirm}>
              {saving ? "Encerrando..." : "Encerrar"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
