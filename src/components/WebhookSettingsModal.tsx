import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y";
import { fetchOrgWebhookUrl, saveOrgWebhookUrl } from "../lib/services";
import { useToast } from "../context/ToastContext";

interface WebhookSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const WebhookSettingsModal: React.FC<WebhookSettingsModalProps> = ({ open, onClose }) => {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    fetchOrgWebhookUrl()
      .then(setUrl)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveOrgWebhookUrl(url.trim());
      toast("Webhook salvo.", { kind: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
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
        aria-labelledby="webhook-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fq-modal fq-modal--sm"
      >
        <div className="fq-modal-header">
          <h3 id="webhook-title" className="fq-modal-title">Webhook Slack / Discord</h3>
          <button type="button" className="fq-btn-icon" onClick={onClose} aria-label="Fechar">X</button>
        </div>
        <form onSubmit={handleSave} className="space-y-4 text-sm text-neutral-400">
          {error && <div className="fq-alert-error text-xs">{error}</div>}
          <p>
            Incoming webhook da organização. Dispara quando um card vira blocker ou entra em Pronto para QA.
          </p>
          <input
            type="url"
            className="fq-input"
            placeholder="https://hooks.slack.com/... ou https://discord.com/api/webhooks/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <p className="text-[12px] text-neutral-500">Deixe em branco para desativar.</p>
          <div className="fq-modal-footer">
            <button type="button" className="fq-btn-ghost text-xs" onClick={onClose}>Cancelar</button>
            <button type="submit" className="fq-btn-primary text-xs" disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
