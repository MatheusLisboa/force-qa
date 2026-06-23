import {
  supabase,
  handleDbError,
  OperationType,
  toUserProfile,
  toWarRoom,
} from "./supabase";
import {
  WarRoom,
  Bug,
  BugComment,
  ActivityLog,
  AISuggestion,
  AIDuplicateCheck,
  AIWarRoomSummary,
  UserProfile,
} from "../types";
import type { BoardReportMetrics, AIExecutiveReport } from "./aiReport/types";
import { BoardView, BoardViewFilters, Project } from "../types";
import { DEFAULT_KANBAN_COLUMNS } from "./kanbanColumns";
import { slugifyBoardViewName } from "./boardViews";

function cleanUndefined<T extends object>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) delete result[key];
  });
  return result as T;
}

function generateId(prefix: string): string {
  return prefix + Math.random().toString(36).substring(2, 11).toUpperCase();
}

function warRoomToRow(data: Omit<WarRoom, "id" | "createdAt">, customId: string) {
  return cleanUndefined({
    id: customId,
    name: data.name,
    project: data.project,
    squad: data.squad,
    date: data.date,
    period_end: data.periodEnd || "",
    description: data.description,
    severity: data.severity,
    status: data.status,
    room_type: data.roomType,
    created_by: data.createdBy,
    created_by_name: data.createdByName,
    guest_access_disabled: data.guestAccessDisabled ?? false,
    kanban_columns: data.kanbanColumns ?? DEFAULT_KANBAN_COLUMNS,
  });
}

// -------------------------
// WarRoom / Board Operations
// -------------------------

export async function createWarRoom(
  data: Omit<WarRoom, "id" | "createdAt">
): Promise<string> {
  const prefix = data.roomType === "board" ? "board-" : "room-";
  const customId = generateId(prefix);
  try {
    const row = warRoomToRow(data, customId);
    const { error } = await supabase.from("war_rooms").insert(row);
    if (error) handleDbError(error, OperationType.CREATE, `war_rooms/${customId}`);
    return customId;
  } catch (error) {
    handleDbError(error, OperationType.CREATE, `war_rooms/${customId}`);
  }
}

export async function createBoard(
  data: Omit<WarRoom, "id" | "createdAt" | "roomType" | "status" | "date" | "periodEnd">
): Promise<string> {
  return createWarRoom({
    ...data,
    roomType: "board",
    status: "active",
    date: "",
    periodEnd: "",
    severity: data.severity || "medium",
  });
}

export async function createProject(data: {
  name: string;
  squad: string;
  description: string;
  createdBy: string;
  createdByName?: string;
}): Promise<{ projectId: string; warRoomId: string }> {
  const name = data.name.trim();
  const slug = slugifyBoardViewName(name);
  const warRoomId = await createBoard({
    name,
    project: name,
    squad: data.squad.trim(),
    description: data.description.trim(),
    severity: "medium",
    createdBy: data.createdBy,
    createdByName: data.createdByName,
  });

  const { data: row, error } = await supabase
    .from("projects")
    .insert({
      name,
      slug,
      squad: data.squad.trim(),
      description: data.description.trim() || "",
      war_room_id: warRoomId,
      created_by: data.createdBy,
    })
    .select("id")
    .single();

  if (error) handleDbError(error, OperationType.CREATE, "projects");
  return { projectId: row!.id as string, warRoomId };
}

export async function updateProject(
  id: string,
  fields: Partial<Pick<Project, "name" | "squad" | "description">>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (fields.name !== undefined) {
    payload.name = fields.name.trim();
    payload.slug = slugifyBoardViewName(fields.name);
  }
  if (fields.squad !== undefined) payload.squad = fields.squad.trim();
  if (fields.description !== undefined) payload.description = fields.description.trim();

  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  if (error) handleDbError(error, OperationType.UPDATE, `projects/${id}`);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) handleDbError(error, OperationType.DELETE, `projects/${id}`);
}

export async function updateWarRoomStatus(
  roomId: string,
  status: "active" | "ended" | "paused"
): Promise<void> {
  const { error } = await supabase
    .from("war_rooms")
    .update({ status })
    .eq("id", roomId);
  if (error) handleDbError(error, OperationType.UPDATE, `war_rooms/${roomId}`);
}

export async function updateWarRoom(
  roomId: string,
  fields: Partial<Pick<WarRoom, "status" | "guestAccessDisabled" | "kanbanColumns">>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (fields.status !== undefined) payload.status = fields.status;
  if (fields.guestAccessDisabled !== undefined)
    payload.guest_access_disabled = fields.guestAccessDisabled;
  if (fields.kanbanColumns !== undefined) payload.kanban_columns = fields.kanbanColumns;

  const { error } = await supabase
    .from("war_rooms")
    .update(payload)
    .eq("id", roomId);
  if (error) handleDbError(error, OperationType.UPDATE, `war_rooms/${roomId}`);
}

export async function deleteWarRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from("war_rooms").delete().eq("id", roomId);
  if (error) handleDbError(error, OperationType.DELETE, `war_rooms/${roomId}`);
}

// -------------------------
// Bug Operations
// -------------------------

export async function createBug(
  data: Omit<Bug, "id" | "createdAt" | "updatedAt">,
  userId: string,
  userName: string
): Promise<string> {
  const customId = generateId("bug-");
  try {
    const now = new Date().toISOString();
    const row = cleanUndefined({
      id: customId,
      war_room_id: data.warRoomId,
      title: data.title,
      description: data.description,
      criticism: data.criticism,
      status: data.status,
      kanban_column_id: data.kanbanColumnId ?? data.status,
      evidence_url: data.evidenceUrl,
      prototype_url: data.prototypeUrl,
      owner_id: data.ownerId,
      owner_name: data.ownerName,
      environment: data.environment,
      affected_url: data.affectedUrl,
      build_version: data.buildVersion,
      tags: data.tags,
      priority: data.priority,
      type: data.type,
      created_at: now,
      updated_at: now,
      created_by: data.createdBy,
      created_by_name: data.createdByName,
      reopen_count: 0,
    });
    const { error } = await supabase.from("bugs").insert(row);
    if (error) handleDbError(error, OperationType.CREATE, `bugs/${customId}`);

    await createActivityLog({
      bugId: customId,
      warRoomId: data.warRoomId,
      userId,
      userName,
      type: "creation",
      description: `Registrou o bug "${data.title}" com criticidade [${data.criticism.toUpperCase()}]`,
    });

    return customId;
  } catch (error) {
    handleDbError(error, OperationType.CREATE, `bugs/${customId}`);
  }
}

export async function updateBugField(
  bugId: string,
  warRoomId: string,
  fields: Partial<Bug>,
  userId: string,
  userName: string,
  logDescription: string,
  logType = "update"
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: now };

  if (fields.title !== undefined) payload.title = fields.title;
  if (fields.description !== undefined) payload.description = fields.description;
  if (fields.criticism !== undefined) payload.criticism = fields.criticism;
  if (fields.status !== undefined) {
    payload.status = fields.status;
    if (fields.status === "validated") payload.resolved_at = now;
  }
  if (fields.kanbanColumnId !== undefined) payload.kanban_column_id = fields.kanbanColumnId;
  if (fields.evidenceUrl !== undefined) payload.evidence_url = fields.evidenceUrl;
  if (fields.prototypeUrl !== undefined) payload.prototype_url = fields.prototypeUrl;
  if (fields.ownerId !== undefined) payload.owner_id = fields.ownerId;
  if (fields.ownerName !== undefined) payload.owner_name = fields.ownerName;
  if (fields.environment !== undefined) payload.environment = fields.environment;
  if (fields.affectedUrl !== undefined) payload.affected_url = fields.affectedUrl;
  if (fields.buildVersion !== undefined) payload.build_version = fields.buildVersion;
  if (fields.tags !== undefined) payload.tags = fields.tags;
  if (fields.priority !== undefined) payload.priority = fields.priority;
  if (fields.type !== undefined) payload.type = fields.type;
  if (fields.reopenCount !== undefined) payload.reopen_count = fields.reopenCount;

  const { error } = await supabase.from("bugs").update(payload).eq("id", bugId);
  if (error) handleDbError(error, OperationType.UPDATE, `bugs/${bugId}`);

  await createActivityLog({
    bugId,
    warRoomId,
    userId,
    userName,
    type: logType,
    description: logDescription,
  });
}

// -------------------------
// Comments
// -------------------------

export async function createComment(
  commentData: Omit<BugComment, "id" | "createdAt">,
  userName: string
): Promise<void> {
  const commentId = generateId("com-");
  const { error } = await supabase.from("bug_comments").insert({
    id: commentId,
    bug_id: commentData.bugId,
    war_room_id: commentData.warRoomId,
    user_id: commentData.userId,
    user_name: commentData.userName,
    avatar_url: commentData.avatarUrl,
    text: commentData.text,
  });
  if (error) handleDbError(error, OperationType.CREATE, `bug_comments/${commentId}`);

  await createActivityLog({
    bugId: commentData.bugId,
    warRoomId: commentData.warRoomId,
    userId: commentData.userId,
    userName,
    type: "comment",
    description: `Adicionou um comentário: "${commentData.text.length > 30 ? commentData.text.substring(0, 30) + "..." : commentData.text}"`,
  });
}

// -------------------------
// Activity Logs
// -------------------------

export async function createActivityLog(
  logData: Omit<ActivityLog, "id" | "createdAt">
): Promise<void> {
  const logId = generateId("log-");
  const { error } = await supabase.from("activity_logs").insert({
    id: logId,
    bug_id: logData.bugId,
    war_room_id: logData.warRoomId,
    user_id: logData.userId,
    user_name: logData.userName,
    type: logData.type,
    description: logData.description,
  });
  if (error) handleDbError(error, OperationType.CREATE, `activity_logs/${logId}`);
}

// -------------------------
// Users
// -------------------------

export async function fetchUsersList(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from("users").select("*");
  if (error) {
    console.error("Error fetching users:", error);
    return [];
  }
  return (data || []).map(toUserProfile);
}

export async function updateUserProfile(
  userId: string,
  fields: { name?: string; role?: string; squad?: string }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.role !== undefined) payload.role = fields.role;
  if (fields.squad !== undefined) payload.squad = fields.squad;

  const { error } = await supabase.from("users").update(payload).eq("id", userId);
  if (error) handleDbError(error, OperationType.UPDATE, `users/${userId}`);
}

export async function deleteUserProfile(userId: string): Promise<void> {
  const { error } = await supabase.from("users").delete().eq("id", userId);
  if (error) handleDbError(error, OperationType.DELETE, `users/${userId}`);
}

// -------------------------
// AI proxy calls
// -------------------------

export async function fetchAISuggestions(
  title: string,
  description: string
): Promise<AISuggestion> {
  const response = await fetch("/api/ai/suggest-bug-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch AI suggests.");
  }
  return response.json();
}

export async function fetchAIDuplicateCheck(
  title: string,
  description: string,
  existingBugs: Partial<Bug>[]
): Promise<AIDuplicateCheck> {
  const response = await fetch("/api/ai/detect-duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, existingBugs }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch Duplication checks.");
  }
  return response.json();
}

export async function fetchAIExecutiveReport(
  metrics: BoardReportMetrics
): Promise<AIExecutiveReport> {
  const response = await fetch("/api/ai/generate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metrics }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Falha ao gerar relatório executivo.");
  }
  return response.json();
}

export async function fetchAIWarRoomSummary(
  warRoom: WarRoom,
  bugs: Bug[]
): Promise<AIWarRoomSummary> {
  const response = await fetch("/api/ai/summarize-warroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warRoom, bugs }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch War Room summary report.");
  }
  return response.json();
}

// -------------------------
// Board views (admin)
// -------------------------

export async function createBoardView(data: {
  projectId: string;
  name: string;
  slug: string;
  filters?: BoardViewFilters;
  orderIndex?: number;
  isActive?: boolean;
}): Promise<string> {
  const { data: row, error } = await supabase
    .from("board_views")
    .insert({
      project_id: data.projectId,
      name: data.name.trim(),
      slug: data.slug.trim(),
      filters: data.filters ?? {},
      order_index: data.orderIndex ?? 0,
      is_active: data.isActive ?? true,
    })
    .select("id")
    .single();
  if (error) handleDbError(error, OperationType.CREATE, "board_views");
  return row!.id as string;
}

export async function updateBoardView(
  id: string,
  fields: Partial<{
    name: string;
    slug: string;
    filters: BoardViewFilters;
    orderIndex: number;
    isActive: boolean;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (fields.name !== undefined) payload.name = fields.name;
  if (fields.slug !== undefined) payload.slug = fields.slug;
  if (fields.filters !== undefined) payload.filters = fields.filters;
  if (fields.orderIndex !== undefined) payload.order_index = fields.orderIndex;
  if (fields.isActive !== undefined) payload.is_active = fields.isActive;

  const { error } = await supabase.from("board_views").update(payload).eq("id", id);
  if (error) handleDbError(error, OperationType.UPDATE, `board_views/${id}`);
}

export async function deleteBoardView(id: string): Promise<void> {
  const { error } = await supabase.from("board_views").delete().eq("id", id);
  if (error) handleDbError(error, OperationType.DELETE, `board_views/${id}`);
}

export async function reorderBoardViews(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) => updateBoardView(id, { orderIndex: index }))
  );
}

// Re-export for convenience
