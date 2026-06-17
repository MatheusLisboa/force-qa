import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Copy, Download, Sparkles, X } from "lucide-react";
import { Bug, WarRoom } from "../types";
import { aggregateBoardMetrics } from "../lib/aiReport/aggregateMetrics";
import { fetchAIExecutiveReport } from "../lib/services";
import { AIExecutiveReport } from "../lib/aiReport/types";
import { useModalA11y } from "../hooks/useModalA11y";

interface AIReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  warRoom: WarRoom;
  bugs: Bug[];
  autoGenerate?: boolean;
}

export const AIReportModal: React.FC<AIReportModalProps> = ({
  isOpen,
  onClose,
  warRoom,
  bugs,
  autoGenerate = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<AIExecutiveReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const generatedRef = useRef(false);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  useModalA11y(isOpen, handleClose, dialogRef);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const metrics = aggregateBoardMetrics(warRoom, bugs);
      const result = await fetchAIExecutiveReport(metrics);
      setReport(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Falha ao gerar relatório.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [warRoom, bugs]);

  useEffect(() => {
    if (!isOpen) {
      generatedRef.current = false;
      return;
    }
    if (autoGenerate && !generatedRef.current) {
      generatedRef.current = true;
      generateReport();
    }
  }, [isOpen, autoGenerate, generateReport]);

  useEffect(() => {
    if (!isOpen) {
      setReport(null);
      setError("");
      setCopied(false);
    }
  }, [isOpen]);

  const handleCopy = async () => {
    if (!report?.markdown) return;
    await navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report?.markdown) return;
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forceqa-report-${warRoom.id}-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fq-modal-overlay animate-fade-in">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-report-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fq-modal fq-modal--lg fq-modal--tall h-[90vh] max-h-[900px]"
          >
            <div className="fq-modal-header shrink-0">
              <h3 id="ai-report-modal-title" className="fq-modal-title">
                <Brain className="w-5 h-5 text-neutral-400" />
                AI Report — {warRoom.name}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="fq-btn-icon"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 pb-3 border-b border-white/[0.06]">
              <button
                type="button"
                onClick={generateReport}
                disabled={loading}
                className="fq-btn-primary text-xs"
              >
                <Sparkles className="w-4 h-4" />
                {loading ? "Gerando relatório..." : report ? "Regenerar relatório" : "Gerar relatório executivo"}
              </button>
              {report && (
                <>
                  <button type="button" onClick={handleCopy} className="fq-btn-secondary text-xs">
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? "Copiado!" : "Copiar Markdown"}
                  </button>
                  <button type="button" onClick={handleDownload} className="fq-btn-ghost text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Baixar .md
                  </button>
                </>
              )}
              {report && (
                <span className="text-[10px] font-mono text-neutral-500 ml-auto">
                  {report.provider} / {report.model}
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1">
              {loading && (
                <div className="text-center py-16">
                  <div className="fq-spinner mx-auto mb-4" />
                  <p className="text-neutral-500 text-xs font-mono">
                    Agregando métricas e gerando relatório executivo...
                  </p>
                  <p className="text-[10px] text-neutral-600 font-mono mt-1">
                    Apenas dados agregados são enviados à IA (baixo custo de tokens).
                  </p>
                </div>
              )}

              {!loading && error && (
                <div className="fq-alert-error">{error}</div>
              )}

              {!loading && !error && !report && (
                <div className="fq-empty-state py-16">
                  <Brain className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                  <h4 className="text-neutral-300 font-semibold">Relatório não gerado</h4>
                  <p className="text-neutral-500 text-xs max-w-md mx-auto mt-1 leading-relaxed">
                    Clique em &quot;Gerar relatório executivo&quot; para analisar métricas agregadas
                    do board e produzir um relatório em Markdown para gestores de QA.
                  </p>
                </div>
              )}

              {report && !loading && (
                <article className="fq-panel text-sm leading-relaxed whitespace-pre-wrap font-sans text-neutral-300">
                  {report.markdown}
                </article>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
