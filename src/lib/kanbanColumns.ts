import { Bug, BugStatus, KanbanColumn } from "../types";

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "new", label: "NOVO INCIDENTE", color: "bg-blue-500", status: "new", builtin: true },
  { id: "under_analysis", label: "EM ANÁLISE", color: "bg-purple-500", status: "under_analysis", builtin: true },
  { id: "in_progress", label: "EM CORREÇÃO", color: "bg-orange-500", status: "in_progress", builtin: true },
  { id: "ready_for_qa", label: "PRONTO PARA QA", color: "bg-yellow-500", status: "ready_for_qa", builtin: true },
  { id: "validated", label: "VALIDADO", color: "bg-green-500", status: "validated", builtin: true },
];

const CUSTOM_COLUMN_COLORS = [
  "bg-cyan-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-lime-500",
] as const;

export function resolveKanbanColumns(stored: KanbanColumn[] | undefined | null): KanbanColumn[] {
  if (!stored || stored.length === 0) return [...DEFAULT_KANBAN_COLUMNS];
  return stored;
}

export function resolveBugColumnId(bug: Bug, columns: KanbanColumn[]): string {
  if (bug.kanbanColumnId && columns.some((c) => c.id === bug.kanbanColumnId)) {
    return bug.kanbanColumnId;
  }

  const byId = columns.find((c) => c.builtin && c.id === bug.status);
  if (byId) return byId.id;

  const byStatus = columns.find((c) => c.status === bug.status);
  if (byStatus) return byStatus.id;

  return columns[0]?.id ?? "new";
}

export function groupBugsByColumn(bugs: Bug[], columns: KanbanColumn[]): Record<string, Bug[]> {
  const grouped: Record<string, Bug[]> = {};
  for (const col of columns) {
    grouped[col.id] = [];
  }
  for (const bug of bugs) {
    const colId = resolveBugColumnId(bug, columns);
    if (!grouped[colId]) grouped[colId] = [];
    grouped[colId].push(bug);
  }
  return grouped;
}

export function createCustomKanbanColumn(
  label: string,
  columns: KanbanColumn[],
  status: BugStatus = "new"
): KanbanColumn {
  const trimmed = label.trim().toUpperCase();
  const usedColors = new Set(columns.map((c) => c.color));
  const color =
    CUSTOM_COLUMN_COLORS.find((c) => !usedColors.has(c)) ?? "bg-neutral-500";

  return {
    id: `col_${Date.now().toString(36)}`,
    label: trimmed,
    color,
    status,
    builtin: false,
  };
}
