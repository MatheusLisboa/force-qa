import React from "react";
import { Bug, KanbanColumn, UserRole } from "../types";
import { BugTypeTag } from "./BugTypeTag";
import { evidenceLabel, isImageEvidence } from "../lib/evidence";
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
}) => {
  const canDrag = canWriteBugs(role) && !isCoarsePointer;

  return (
    <div className="fq-kanban-board">
      {columns.map((column) => {
        const list = bugsByColumn[column.id] ?? [];
        return (
          <div
            key={column.id}
            className="fq-kanban-column"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, column.id)}
          >
            <div className="fq-kanban-column-header">
              <span className="text-[13px] font-medium text-neutral-300 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${column.color}`} />
                {displayColumnLabel(column)}
              </span>
              <span className="bg-white/[0.06] px-1.5 py-0.5 rounded-full text-[11px] font-medium text-neutral-400 tabular-nums">
                {list.length}
              </span>
            </div>

            <div className={`fq-kanban-column-body${list.length > 5 ? " fq-kanban-column-body--scroll" : ""}`}>
              {list.length === 0 ? (
                <div className="text-center py-10 text-neutral-500 text-[13px] border border-dashed border-white/[0.06] rounded-lg">
                  Nenhum card nesta coluna
                </div>
              ) : (
                list.map((bug) => {
                  const sla = isSlaBreached(bug);
                  const severity = getSeverityConfig(bug.criticism);
                  return (
                    <div
                      key={bug.id}
                      draggable={canDrag}
                      onDragStart={(e) => onDragStart(e, bug.id)}
                      onClick={() => onOpenBug(bug)}
                      className={`group fq-kanban-card ${sla ? "ring-1 ring-red-500/40" : ""}`}
                    >
                      <span
                        className={`absolute left-0 top-0 h-full w-1 ${getSeverityStripeClass(bug.criticism)}`}
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
                          {bug.evidenceUrl && (
                            isImageEvidence(bug.evidenceUrl) ? (
                              <img
                                src={bug.evidenceUrl}
                                alt="Evidência"
                                className="h-7 w-10 rounded object-cover border border-white/[0.08]"
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                                {evidenceLabel(bug.evidenceUrl) === "link" ? (
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
