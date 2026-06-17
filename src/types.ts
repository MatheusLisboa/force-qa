/**
 * Type declarations for ForceQA "War Room" Operations board
 */

export type UserRole = "admin" | "qa" | "developer" | "dba" | "devops" | "scrum_master" | "viewer";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  squad: string;
  avatarUrl?: string;
  createdAt: any; // Firestore server timestamp / Date
}

export type SeverityLevel = "blocker" | "critical" | "high" | "medium" | "low";

export type BugStatus = "new" | "under_analysis" | "in_progress" | "ready_for_qa" | "validated" | "reopened";

export type BugPriority = "immediate" | "high" | "medium" | "low";

export type BugType = "bug" | "improvement" | "ui_adjustment" | "performance" | "security";

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
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  guestAccessDisabled?: boolean;
}

export interface Bug {
  id: string;
  warRoomId: string;
  title: string;
  description: string;
  criticism: SeverityLevel;
  status: BugStatus;
  kanbanColumnId?: string;
  evidenceUrl?: string; // Base64 data URL, image URL, or external link
  prototypeUrl?: string; // Optional figma/prototype screenshot
  ownerId: string | null;
  ownerName: string | null;
  environment: "production" | "homologation" | "dev";
  affectedUrl?: string;
  buildVersion?: string;
  tags: string[];
  priority: BugPriority;
  type: BugType;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  createdByName: string;
  resolvedAt?: any;
  reopenCount?: number;
}

export interface BugComment {
  id: string;
  bugId: string;
  warRoomId: string;
  userId: string;
  userName: string;
  avatarUrl: string;
  text: string;
  createdAt: any;
}

export interface ActivityLog {
  id: string;
  bugId: string;
  warRoomId: string;
  userId: string;
  userName: string;
  type: string; // e.g. "creation", "status_change", "assignment", "comment"
  description: string;
  createdAt: any;
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
