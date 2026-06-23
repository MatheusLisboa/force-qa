import { BugType, BugStatus, SeverityLevel } from "../types";

export interface BadgeConfig {
  label: string;
  className: string;
}

/** @deprecated use BadgeConfig */
export type BugTypeConfig = BadgeConfig;

export const BUG_TYPE_CONFIG: Record<BugType, BadgeConfig> = {
  bug: { label: "Bug", className: "fq-badge--type-bug" },
  requirement: { label: "Requisito", className: "fq-badge--type-requirement" },
  ihc: { label: "IHC", className: "fq-badge--type-ihc" },
  product: { label: "Produto", className: "fq-badge--type-product" },
  improvement: { label: "Melhoria", className: "fq-badge--type-improvement" },
  ui_adjustment: { label: "UI/Visual", className: "fq-badge--type-ui" },
  performance: { label: "Performance", className: "fq-badge--type-performance" },
  security: { label: "Segurança", className: "fq-badge--type-security" },
};

export const BUG_TYPE_OPTIONS: { value: BugType; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐞" },
  { value: "requirement", label: "Requisito", emoji: "📋" },
  { value: "ihc", label: "IHC", emoji: "🎨" },
  { value: "product", label: "Produto", emoji: "📦" },
  { value: "improvement", label: "Melhoria", emoji: "⚡" },
  { value: "ui_adjustment", label: "Ajuste Visual", emoji: "🖼️" },
  { value: "performance", label: "Performance", emoji: "🚀" },
  { value: "security", label: "Segurança", emoji: "🔒" },
];

export const ALL_BUG_TYPES = BUG_TYPE_OPTIONS.map((o) => o.value);

export const SEVERITY_CONFIG: Record<SeverityLevel, BadgeConfig> = {
  blocker: { label: "BLOCKER", className: "fq-badge--severity-blocker" },
  critical: { label: "CRÍTICO", className: "fq-badge--severity-critical" },
  high: { label: "ALTO", className: "fq-badge--severity-high" },
  medium: { label: "MÉDIO", className: "fq-badge--severity-medium" },
  low: { label: "BAIXO", className: "fq-badge--severity-low" },
};

export const STATUS_CONFIG: Record<BugStatus, BadgeConfig> = {
  new: { label: "Novo", className: "fq-badge--status-new" },
  under_analysis: { label: "Em Análise", className: "fq-badge--status-analysis" },
  in_progress: { label: "Em Correção", className: "fq-badge--status-progress" },
  ready_for_qa: { label: "Pronto para QA", className: "fq-badge--status-qa" },
  validated: { label: "Validado", className: "fq-badge--status-validated" },
  reopened: { label: "Reaberto", className: "fq-badge--status-reopened" },
};

export const USER_ROLE_CONFIG: Record<string, BadgeConfig> = {
  admin: { label: "ADMIN", className: "fq-badge--role-admin" },
  dba: { label: "DBA", className: "fq-badge--role-dba" },
  qa: { label: "QA", className: "fq-badge--role-qa" },
  developer: { label: "DEV", className: "fq-badge--role-dev" },
  devops: { label: "DEVOPS", className: "fq-badge--role-devops" },
  scrum_master: { label: "SCRUM", className: "fq-badge--role-scrum" },
  viewer: { label: "OBS/VIEWER", className: "fq-badge--role-viewer" },
};

export type WarRoomStatus = "active" | "paused" | "ended";
export type RoomType = "board" | "war_room";

export const ROOM_STATUS_CONFIG: Record<WarRoomStatus, BadgeConfig> = {
  active: { label: "ATIVO", className: "fq-badge--room-active" },
  paused: { label: "PAUSADO", className: "fq-badge--room-paused" },
  ended: { label: "ENCERRADO", className: "fq-badge--room-ended" },
};

export const ROOM_TYPE_CONFIG: Record<RoomType, BadgeConfig> = {
  board: { label: "BOARD", className: "fq-badge--room-board" },
  war_room: { label: "WAR ROOM", className: "fq-badge--room-war" },
};

export function getRoomStatusConfig(status: WarRoomStatus): BadgeConfig {
  return ROOM_STATUS_CONFIG[status];
}

export function getRoomTypeConfig(type: RoomType): BadgeConfig {
  return ROOM_TYPE_CONFIG[type];
}

export function getBugTypeConfig(type: BugType): BadgeConfig {
  return BUG_TYPE_CONFIG[type] ?? BUG_TYPE_CONFIG.bug;
}

export function getBugTypeLabel(type: BugType): string {
  return getBugTypeConfig(type).label;
}

export function getSeverityConfig(severity: SeverityLevel): BadgeConfig {
  return SEVERITY_CONFIG[severity];
}

export function getSeverityLabel(severity: SeverityLevel): string {
  return SEVERITY_CONFIG[severity].label;
}

export function getStatusConfig(status: BugStatus): BadgeConfig {
  return STATUS_CONFIG[status];
}

export function getStatusLabel(status: BugStatus): string {
  return STATUS_CONFIG[status].label;
}

export function getUserRoleConfig(role: string): BadgeConfig {
  return USER_ROLE_CONFIG[role] ?? USER_ROLE_CONFIG.viewer;
}

export function truncateForLog(text: string, max = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max) + "…";
}
