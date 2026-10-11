import React, { useCallback, useRef, useState } from "react";
import { Bug, KanbanColumn, UserRole } from "../types";
import { BugTypeTag } from "./BugTypeTag";
import { evidenceLabel, isImageEvidence } from "../lib/evidence";
import { primaryAttachmentUrl } from "../lib/attachments";
import { canWriteBugs } from "../lib/permissions";
import { formatOpenAge, isSlaBreached } from "../lib/cardAge";
import { displayColumnLabel, resolveBugColumnId } from "../lib/kanbanColumns";
import { getSeverityConfig, getSeverityStripeClass } from "../lib/bugLabels";
import { Clock, Link2, Paperclip, User } from "lucide-react";

interface KanbanBoardProps {
  columns: KanbanColumn[];
  bugsByColumn: Record<string, Bug[]>;
  role?: UserRole | string | null;
  isCoarsePointer: boolean;
  onDragStart: (e: React.DragEvent, bugId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, columnId: string) => void;
  onOpenBug: (bug: Bug) => void;
  onMoveToColumn: (bug: Bug, column: KanbanColumn) => void;
  selectedBugId?: string;
  /** Seleção em lote (checkbox no card). Omitir desliga o recurso. */
  bulkSelectedIds?: ReadonlySet<string>;
  onToggleBulk?: (bugId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns,
  bugsByColumn,
  role,
  isCoarsePointer,
  onDragStart,
  onDragOver,
  onDrop,
  onOpenBug,
  onMoveToColumn,
  selectedBugId,
  bulkSelectedIds,
  onToggleBulk,
}) => {
  const canWrite = canWriteBugs(role);
  const canDrag = canWrite && !isCoarsePointer;
  const boardRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const focusCard = useCallback((bugId: string) => {
    requestAnimationFrame(() => {
      boardRef.current?.querySelector<HTMLElement>(`[data-bug-id="${bugId}"]`)?.focus();
    });
  }, []);

  /** Setas: ↑↓ percorrem a coluna, ←→ pulam para a coluna vizinha. Shift+←→ movem o card. */
  const handleCardKeyDown = (event: React.KeyboardEvent, bug: Bug, columnIndex: number, cardIndex: number) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key;

    if (key === "Enter") {
      event.preventDefault();
      onOpenBug(bug);
      return;
    }
    // Espaço marca/desmarca para ação em lote (padrão de listas selecionáveis).
    if (key === " " && onToggleBulk && canWrite) {
      event.preventDefault();
      onToggleBulk(bug.id);
      return;
    }
    if (key === " ") {
      event.preventDefault();
      onOpenBug(bug);
      return;
    }

    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const vertical = key === "ArrowUp" || key === "ArrowDown";
    if (!horizontal && !vertical) return;
    event.preventDefault();

    if (vertical) {
      const list = bugsByColumn[columns[columnIndex].id] ?? [];
      const target = list[cardIndex + (key === "ArrowDown" ? 1 : -1)];
      if (target) focusCard(target.id);
      return;
    }

    const nextIndex = columnIndex + (key === "ArrowRight" ? 1 : -1);
    const nextColumn = columns[nextIndex];
    if (!nextColumn) return;

    if (event.shiftKey) {
      if (!canWrite) return;
      onMoveToColumn(bug, nextColumn);
      setAnnouncement(`${bug.title} movido para ${displayColumnLabel(nextColumn)}.`);
      focusCard(bug.id);
      return;
    }

    const neighbours = bugsByColumn[nextColumn.id] ?? [];
    const target = neighbours[Math.min(cardIndex, neighbours.length - 1)];
    if (target) focusCard(target.id);
  };

  return (
    <div className="fq-kanban-board" ref={boardRef} role="group" aria-label="Quadro Kanban">
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {columns.map((column, columnIndex) => {
        const list = bugsByColumn[column.id] ?? [];
        return (
          <div
            key={column.id}
            className="fq-kanban-column"
            role="group"
            aria-label={`${displayColumnLabel(column)}, ${list.length} cards`}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, column.id)}
          >
            <div className="fq-kanban-column-header">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-neutral-300">
                <span className={`h-1.5 w-1.5 rounded-full ${column.color}`} />
                {displayColumnLabel(column)}
              </span>
              <span className="fq-kanban-count">{list.length}</span>
            </div>

            <div className={`fq-kanban-column-body${list.length > 5 ? " fq-kanban-column-body--scroll" : ""}`}>
              {list.length === 0 ? (
                <div className="fq-empty !py-8" role="note">
                  <p className="fq-empty-title">Coluna vazia</p>
                  <p className="fq-empty-desc">
                    {canDrag ? "Arraste um card até aqui." : "Nenhum card nesta coluna."}
                  </p>
                </div>
              ) : (
                list.map((bug, cardIndex) => {
                  const sla = isSlaBreached(bug);
                  const severity = getSeverityConfig(bug.criticism);
                  const thumb = primaryAttachmentUrl(bug);
                  return (
                    <div
                      key={bug.id}
                      data-bug-id={bug.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${bug.title}. Severidade ${severity.label}. ${bug.ownerName ? `Responsável ${bug.ownerName}` : "Sem responsável"}.${sla ? " Atrasado." : ""}`}
                      aria-keyshortcuts={canWrite ? "Shift+ArrowLeft Shift+ArrowRight" : undefined}
                      draggable={canDrag}
                      onDragStart={(e) => onDragStart(e, bug.id)}
                      onClick={() => onOpenBug(bug)}
                      onKeyDown={(e) => handleCardKeyDown(e, bug, columnIndex, cardIndex)}
                      aria-pressed={onToggleBulk && canWrite ? bulkSelectedIds?.has(bug.id) ?? false : undefined}
                      className={`group fq-kanban-card ${sla ? "ring-1 ring-red-500/40" : ""} ${
                        selectedBugId === bug.id ? "fq-kanban-card--selected" : ""
                      } ${bulkSelectedIds?.has(bug.id) ? "fq-kanban-card--bulk" : ""}`}
                    >
                      {onToggleBulk && canWrite && (
                        <label
                          className={`fq-kanban-check ${bulkSelectedIds?.has(bug.id) || (bulkSelectedIds?.size ?? 0) > 0 ? "fq-kanban-check--visible" : ""}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={bulkSelectedIds?.has(bug.id) ?? false}
                            onChange={() => onToggleBulk(bug.id)}
                            aria-label={`Selecionar ${bug.title}`}
                          />
                        </label>
                      )}
                      <span
                        className={`fq-kanban-card-stripe ${getSeverityStripeClass(bug.criticism)}`}
                        title={severity.label}
                      />

                      <div className="pl-1.5 min-w-0">
                        <h4 className="fq-kanban-card-title" title={bug.title}>
                          {bug.title}
                        </h4>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <BugTypeTag type={bug.type} />
                          {sla && (
                            <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                              Atrasado
                            </span>
                          )}
                          {thumb && (
                            isImageEvidence(thumb) ? (
                              <img
                                src={thumb}
                                alt="Evidência"
                                className="h-7 w-10 rounded object-cover border border-white/[0.08]"
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                                {evidenceLabel(thumb) === "link" ? (
                                  <Link2 className="w-3 h-3" />
                                ) : (
                                  <Paperclip className="w-3 h-3" />
                                )}
                                Evidência
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      <div className="pl-1.5 pt-2 border-t border-white/[0.06] flex justify-between items-center gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <span
                            className={`truncate text-[13px] ${bug.ownerName ? "text-neutral-200" : "text-neutral-500"}`}
                            title={bug.ownerName || "Sem responsável"}
                          >
                            {bug.ownerName || "Sem responsável"}
                          </span>
                        </div>
                        <span
                          className={`flex items-center gap-1 text-[12px] shrink-0 tabular-nums ${
                            sla ? "text-red-400 font-semibold" : "text-neutral-400"
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {formatOpenAge(bug.createdAt)}
                        </span>
                      </div>

                      {canWriteBugs(role) && isCoarsePointer && (
                        <select
                          className="mt-2 w-full fq-select !text-[12px] !py-1"
                          value={resolveBugColumnId(bug, columns)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = columns.find((col) => col.id === e.target.value);
                            if (next) onMoveToColumn(bug, next);
                          }}
                        >
                          {columns.map((col) => (
                            <option key={col.id} value={col.id}>
                              {displayColumnLabel(col)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
