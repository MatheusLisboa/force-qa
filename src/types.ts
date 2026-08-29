/**
 * Type declarations for ForceQA War Room board
 */

export type UserRole = "admin" | "qa" | "developer" | "dba" | "devops" | "scrum_master" | "viewer";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  squad: string;
  organizationId: string;
  isSuperadmin?: boolean;
  avatarUrl?: string;
  isGuest?: boolean;
  createdAt: string;
}

export type SeverityLevel = "blocker" | "critical" | "high" | "medium" | "low";

export type BugStatus = "new" | "under_analysis" | "in_progress" | "ready_for_qa" | "validated" | "reopened";

export type BugPriority = "immediate" | "high" | "medium" | "low";

export type BugType =
  | "bug"
  | "requirement"
  | "ihc"
  | "product"
  | "improvement"
  | "ui_adjustment"
  | "performance"
  | "security";

export type AttachmentKind = "file" | "link" | "prototype";

export interface BugAttachment {
  id: string;
  url: string;
  kind: AttachmentKind;
}

export interface ReproItem {
  id: string;
  text: string;
  done: boolean;
}

export type RoomType = "war_room" | "board";

export interface KanbanColumn {
  id: string;
  label: string;
  color: string;
  status: BugStatus;
  builtin?: boolean;
}

export interface WarRoom {
  id: string;
  name: string;
  project: string;
  squad: string;
  date: string;
  periodEnd?: string;
  description: string;
  severity: SeverityLevel;
  status: "active" | "ended" | "paused";
  roomType: RoomType;
  kanbanColumns?: KanbanColumn[];
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  guestAccessDisabled?: boolean;
  organizationId?: string;
}

export interface Bug {
  id: string;
  warRoomId: string;
  title: string;
  description: string;
  criticism: SeverityLevel;
  status: BugStatus;
  kanbanColumnId?: string;
  evidenceUrl?: string; // https Storage/object URL or https external link
  prototypeUrl?: string;
  ownerId: string | null;
  ownerName: string | null;
  environment: "production" | "homologation" | "dev";
  affectedUrl?: string;
  buildVersion?: string;
  tags: string[];
  priority: BugPriority;
  type: BugType;
  attachments?: BugAttachment[];
  duplicateOfBugId?: string | null;
  reproChecklist?: ReproItem[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
  resolvedAt?: string;
  reopenCount?: number;
  archived?: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  warRoomId?: string;
  bugId?: string;
  readAt?: string | null;
  createdAt: string;
}

export interface BugComment {
  id: string;
  bugId: string;
  warRoomId: string;
  userId: string;
  userName: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  bugId: string;
  warRoomId: string;
  userId: string;
  userName: string;
  type: string; // e.g. "creation", "status_change", "assignment", "comment"
  description: string;
  createdAt: string;
}

export interface AISuggestion {
  criticism: SeverityLevel;
  priority: BugPriority;
  type: BugType;
  tags: string[];
  explanation: string;
}

export interface AIDuplicateCheck {
  isDuplicate: boolean;
  duplicateOfBugId: string | null;
  confidenceScore: number;
  explanation: string;
}

export interface AIWarRoomSummary {
  title: string;
  executiveSummary: string;
  markdownReport: string;
}

export interface BoardViewFilters {
  types?: string[];
  statuses?: BugStatus[];
  severity?: SeverityLevel[];
}

export interface BoardView {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  orderIndex: number;
  filters: BoardViewFilters;
  projectId?: string;
  organizationId?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  squad: string;
  description: string;
  warRoomId: string;
  organizationId?: string;
  createdAt: string;
  createdBy: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OrganizationAdmin {
  id: string;
  name: string;
  email: string;
}

export interface OrganizationOverview extends Organization {
  userCount: number;
  roomCount: number;
  admins: OrganizationAdmin[];
}
