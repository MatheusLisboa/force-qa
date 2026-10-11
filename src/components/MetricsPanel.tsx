import React, { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { Bug, WarRoom } from "../types";
import { computeTrends, formatDuration } from "../lib/trends";
import { SEVERITY_CONFIG } from "../lib/bugLabels";
import { Button } from "./ui";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 32 };

const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: "danger" | "warning" }> = ({ label, value, hint, tone }) => (
  <div className="fq-panel">
    <p className="text-[12px] text-neutral-500">{label}</p>
    <p
      className="mt-1 font-display text-2xl font-semibold tabular-nums"
      style={{ color: tone === "danger" ? "var(--color-fq-danger)" : tone === "warning" ? "var(--color-fq-warning)" : "var(--color-fq-text-primary)" }}
    >
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>}
  </div>
);

/** Métricas da sala: criados × resolvidos por semana, backlog e indicadores. Exporta PDF via impressão. */
export const MetricsPanel: React.FC<{ warRoom: WarRoom; bugs: Bug[] }> = ({ warRoom, bugs }) => {
  const { weeks, summary } = useMemo(() => computeTrends(bugs, { weeks: 8 }), [bugs]);
  const [printing, setPrinting] = useState(false);

  // Na impressão força o tema claro (papel) e depois restaura.
  useEffect(() => {
    if (!printing) return;
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = "light";
    const restore = () => {
      if (previous) root.dataset.theme = previous;
      else delete root.dataset.theme;
      setPrinting(false);
    };
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
    };
  }, [printing]);

  const max = Math.max(1, ...weeks.map((w) => Math.max(w.created, w.resolved, w.backlog)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const groupW = innerW / weeks.length;
  const barW = Math.min(18, groupW / 3);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const x = (index: number) => PAD.left + groupW * index + groupW / 2;
  const backlogPath = weeks.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w.backlog).toFixed(1)}`).join(" ");
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  const severities = (Object.keys(SEVERITY_CONFIG) as Array<keyof typeof SEVERITY_CONFIG>).filter((s) => summary.openBySeverity[s] > 0);

  return (
    <div className="fq-print-area space-y-5" data-testid="metrics-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="fq-section-title !mb-0">Métricas e tendência</h3>
          <p className="mt-0.5 text-sm text-neutral-500">{warRoom.name} · últimas 8 semanas</p>
        </div>
        <Button variant="secondary" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => setPrinting(true)} className="fq-no-print" data-testid="export-pdf">
          Exportar PDF
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Em aberto" value={String(summary.openNow)} hint={`${summary.validated} validados de ${summary.total}`} />
        <Tile label="Tempo mediano de resolução" value={formatDuration(summary.medianResolutionHours)} hint="da abertura até validar" />
        <Tile label="Taxa de reabertura" value={`${Math.round(summary.reopenRate * 100)}%`} hint="cards que voltaram ao menos uma vez" tone={summary.reopenRate >= 0.2 ? "warning" : undefined} />
        <Tile label="SLA estourado" value={String(summary.slaBreachedOpen)} hint={`${summary.unassignedOpen} sem responsável`} tone={summary.slaBreachedOpen > 0 ? "danger" : undefined} />
      </div>

      <div className="fq-panel">
        <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px] text-neutral-400">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-fq-warning)" }} /> Criados</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-fq-success)" }} /> Resolvidos</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: "var(--color-fq-text-secondary)" }} /> Backlog ao fim da semana</span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cards criados, resolvidos e backlog nas últimas ${weeks.length} semanas. Os valores estão na tabela abaixo.`} className="h-auto w-full">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-fq-border)" strokeDasharray={tick === 0 ? undefined : "3 3"} />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="var(--color-fq-text-tertiary)">{tick}</text>
            </g>
          ))}
          {weeks.map((week, i) => (
            <g key={week.start}>
              <rect x={x(i) - barW - 1} y={y(week.created)} width={barW} height={Math.max(0, y(0) - y(week.created))} rx="2" fill="var(--color-fq-warning)">
                <title>{`${week.label}: ${week.created} criados`}</title>
              </rect>
              <rect x={x(i) + 1} y={y(week.resolved)} width={barW} height={Math.max(0, y(0) - y(week.resolved))} rx="2" fill="var(--color-fq-success)">
                <title>{`${week.label}: ${week.resolved} resolvidos`}</title>
              </rect>
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--color-fq-text-tertiary)">{week.label}</text>
            </g>
          ))}
          <path d={backlogPath} fill="none" stroke="var(--color-fq-text-secondary)" strokeWidth="2" strokeLinejoin="round" />
          {weeks.map((week, i) => (
            <circle key={week.start} cx={x(i)} cy={y(week.backlog)} r="3" fill="var(--color-fq-surface)" stroke="var(--color-fq-text-secondary)" strokeWidth="2">
              <title>{`${week.label}: backlog ${week.backlog}`}</title>
            </circle>
          ))}
        </svg>

        <details className="mt-3 fq-no-print">
          <summary className="cursor-pointer text-[12px] text-neutral-500">Ver os valores em tabela</summary>
          <table className="mt-2 w-full text-left text-[12px] text-neutral-300">
            <caption className="sr-only">Cards por semana</caption>
            <thead className="text-neutral-500">
              <tr><th scope="col" className="py-1 pr-3">Semana de</th><th scope="col">Criados</th><th scope="col">Resolvidos</th><th scope="col">Backlog</th></tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.start} className="border-t border-white/[0.06]">
                  <th scope="row" className="py-1 pr-3 font-normal">{week.label}</th>
                  <td className="tabular-nums">{week.created}</td>
                  <td className="tabular-nums">{week.resolved}</td>
                  <td className="tabular-nums">{week.backlog}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="fq-panel">
        <h4 className="fq-panel-title">Em aberto por severidade</h4>
        {severities.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum card em aberto.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {severities.map((severity) => (
              <li key={severity} className={`fq-badge ${SEVERITY_CONFIG[severity].className} !text-[12px]`}>
                {SEVERITY_CONFIG[severity].label}: {summary.openBySeverity[severity]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
