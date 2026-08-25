import { Bug, BugStatus, KanbanColumn } from "../types";

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "new", label: "Novo", color: "bg-blue-500", status: "new", builtin: true },
  { id: "under_analysis", label: "Em análise", color: "bg-purple-500", status: "under_analysis", builtin: true },
  { id: "in_progress", label: "Em correção", color: "bg-orange-500", status: "in_progress", builtin: true },
  { id: "ready_for_qa", label: "Pronto para QA", color: "bg-yellow-500", status: "ready_for_qa", builtin: true },
  { id: "reopened", label: "Reaberto", color: "bg-red-500", status: "reopened", builtin: true },
  { id: "validated", label: "Validado", color: "bg-green-500", status: "validated", builtin: true },
];

const BUILTIN_LABELS: Record<string, string> = {
  new: "Novo",
  under_analysis: "Em análise",
  in_progress: "Em correção",
  ready_for_qa: "Pronto para QA",
  reopened: "Reaberto",
  validated: "Validado",
};

export function displayColumnLabel(column: {
  id: string;
  label: string;
  status: BugStatus;
  builtin?: boolean;
}): string {
  if (column.builtin && BUILTIN_LABELS[column.id]) return BUILTIN_LABELS[column.id];
  if (BUILTIN_LABELS[column.id]) return BUILTIN_LABELS[column.id];
  if (BUILTIN_LABELS[column.status]) return BUILTIN_LABELS[column.status];
  return column.label;
}

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

const REOPENED_COLUMN: KanbanColumn = {
  id: "reopened",
  label: "Reaberto",
  color: "bg-red-500",
  status: "reopened",
  builtin: true,
};

export function resolveKanbanColumns(stored: KanbanColumn[] | undefined | null): KanbanColumn[] {
  const columns = !stored || stored.length === 0 ? [...DEFAULT_KANBAN_COLUMNS] : [...stored];
  const hasReopened = columns.some((c) => c.id === "reopened" || c.status === "reopened");
  if (!hasReopened) {
    const validatedIdx = columns.findIndex((c) => c.id === "validated" || c.status === "validated");
    if (validatedIdx >= 0) columns.splice(validatedIdx, 0, REOPENED_COLUMN);
    else columns.push(REOPENED_COLUMN);
  }
  return columns;
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
  const trimmed = label.trim();
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
