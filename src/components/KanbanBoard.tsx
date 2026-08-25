import React from "react";
import { Bug, KanbanColumn, UserRole } from "../types";
import { BugTypeTag } from "./BugTypeTag";
import { SeverityBadge } from "./BugBadges";
import { evidenceLabel } from "../lib/evidence";
import { canWriteBugs } from "../lib/permissions";
import { formatOpenAge, isSlaBreached } from "../lib/cardAge";
import { displayColumnLabel, resolveBugColumnId } from "../lib/kanbanColumns";
import { Clock, User } from "lucide-react";
import { shortId } from "../lib/format";

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
                  return (
                    <div
                      key={bug.id}
                      draggable={canDrag}
                      onDragStart={(e) => onDragStart(e, bug.id)}
                      onClick={() => onOpenBug(bug)}
                      className={`group fq-kanban-card ${sla ? "ring-1 ring-red-500/40" : ""}`}
                    >
                      {(bug.criticism === "blocker" || sla) && (
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500" />
                      )}

                      <div>
                        <div className="flex justify-between items-start gap-1.5 mb-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <BugTypeTag type={bug.type} />
                            <SeverityBadge severity={bug.criticism} />
                            {sla && bug.status !== "validated" && (
                              <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                                SLA
                              </span>
                            )}
                          </div>
                          <span className="fq-kanban-card-meta max-w-[88px] shrink-0" title={bug.id}>
                            {shortId(bug.id)}
                          </span>
                        </div>

                        <h4 className="fq-kanban-card-title" title={bug.title}>
                          {bug.title}
                        </h4>

                        <div className="flex gap-1.5 items-center flex-wrap pt-2">
                          {bug.tags?.length > 0 &&
                            bug.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] text-neutral-400 bg-white/[0.04] border border-white/[0.06] py-0.5 px-1.5 rounded"
                              >
                                #{tag}
                              </span>
                            ))}
                          {bug.tags && bug.tags.length > 3 && (
                            <span className="text-[9px] text-neutral-600">+{bug.tags.length - 3}</span>
                          )}
                          {bug.evidenceUrl && (
                            <span className="fq-badge bg-white/[0.04] text-neutral-400 border-white/[0.06] text-[9px] font-mono py-0.5 px-1.5">
                              {evidenceLabel(bug.evidenceUrl) === "image" ? "📸" : "🔗"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center text-[12px] text-neutral-500 gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <User className="w-3 h-3 text-neutral-500 shrink-0" />
                          <span className="fq-kanban-card-meta" title={bug.ownerName || "Sem responsável"}>
                            {bug.ownerName || "Sem responsável"}
                          </span>
                        </div>
                        <span className={`flex items-center gap-0.5 text-[11px] shrink-0 ${sla ? "text-red-400 font-semibold" : "text-neutral-500"}`}>
                          <Clock className="w-3 h-3" />
                          {formatOpenAge(bug.createdAt)}
                        </span>
                      </div>

                      {canWriteBugs(role) && isCoarsePointer && (
                        <select
                          className="mt-2 w-full fq-select !text-[10px] !py-1"
                          value={resolveBugColumnId(bug, columns)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const column = columns.find((c) => c.id === e.target.value);
                            if (column) onMoveToColumn(bug, column);
                          }}
                        >
                          {columns.map((col) => (
                            <option key={col.id} value={col.id}>{displayColumnLabel(col)}</option>
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
