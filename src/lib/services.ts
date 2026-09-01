import {
  supabase,
  handleDbError,
  OperationType,
  toUserProfile,
  toWarRoom,
  findWarRoomByIdOrName,
} from "./supabase";
import { parseRoomInvite } from "./routes";
import {
  WarRoom,
  Bug,
  BugComment,
  ActivityLog,
  AISuggestion,
  AIDuplicateCheck,
  UserProfile,
} from "../types";
import type { AIExecutiveReport } from "./aiReport/types";
import { BoardView, BoardViewFilters, Project, AppNotification, OrganizationOverview } from "../types";
import { DEFAULT_KANBAN_COLUMNS } from "./kanbanColumns";
import { slugifyBoardViewName } from "./boardViews";
import { authFetch, readApiError } from "./apiClient";
import { diffRoomAccess } from "./roomAccess";
import { normalizeArea } from "./squads";
import { resolveOrganizationId } from "./organizations";
import { safeMediaUrl, copyEvidenceToRoom } from "./evidence";
import { attachmentsOf, makeAttachment, parseAttachments } from "./attachments";
import { parseReproChecklist, reproForType } from "./reproChecklist";
import { findMentionedUsers } from "./mentions";

function cleanUndefined<T extends object>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) delete result[key];
  });
  return result as T;
}

function generateId(prefix: string): string {
  const uuid = crypto.randomUUID();
  return `${prefix}${uuid}`;
}

async function notifyWebhook(input: {
  roomId: string;
  bugId: string;
  kind: "blocker" | "ready_for_qa";
}): Promise<void> {
  try {
    const response = await authFetch("/api/webhooks/dispatch", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      console.warn("webhook dispatch:", await response.text().catch(() => response.status));
    }
  } catch (error) {
    console.warn("webhook dispatch:", error);
  }
}

function warRoomToRow(data: Omit<WarRoom, "id" | "createdAt">, customId: string) {
  return cleanUndefined({
    id: customId,
    name: data.name,
    project: data.project,
    squad: normalizeArea(data.squad),
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
    organization_id: resolveOrganizationId(data.organizationId),
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
  organizationId?: string;
}): Promise<{ projectId: string; warRoomId: string }> {
  const name = data.name.trim();
  const slug = slugifyBoardViewName(name);
  const organizationId = resolveOrganizationId(data.organizationId);
  const warRoomId = await createBoard({
    name,
    project: name,
    squad: normalizeArea(data.squad),
    description: data.description.trim(),
    severity: "medium",
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    organizationId,
  });

  const { data: row, error } = await supabase
    .from("projects")
    .insert({
      name,
      slug,
      squad: normalizeArea(data.squad),
      description: data.description.trim() || "",
      war_room_id: warRoomId,
      created_by: data.createdBy,
      organization_id: organizationId,
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
  if (fields.squad !== undefined) payload.squad = normalizeArea(fields.squad);
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
  userName: string,
  options?: { skipWebhook?: boolean }
): Promise<string> {
  const customId = generateId("bug-");
  try {
    if (data.evidenceUrl?.startsWith("data:")) {
      throw new Error("Evidências devem ser enviadas como arquivo (Storage), não Base64.");
    }
    const evidenceUrl = data.evidenceUrl ? safeMediaUrl(data.evidenceUrl) : undefined;
    if (data.evidenceUrl && !evidenceUrl) {
      throw new Error("O link de evidência precisa ser https://");
    }
    if (data.prototypeUrl?.startsWith("data:")) {
      throw new Error("Protótipos devem ser enviados como arquivo (Storage), não Base64.");
    }
    const prototypeUrl = data.prototypeUrl ? safeMediaUrl(data.prototypeUrl) : undefined;
    if (data.prototypeUrl && !prototypeUrl) {
      throw new Error("O link de protótipo precisa ser https://");
    }
    const attachments = parseAttachments(data.attachments).length
      ? parseAttachments(data.attachments)
      : [
          ...(evidenceUrl ? [makeAttachment(evidenceUrl, "file")] : []),
          ...(prototypeUrl ? [makeAttachment(prototypeUrl, "prototype")] : []),
        ];
    const reproChecklist = parseReproChecklist(data.reproChecklist).length
      ? parseReproChecklist(data.reproChecklist)
      : reproForType(data.type);

    const now = new Date().toISOString();
    const row = cleanUndefined({
      id: customId,
      war_room_id: data.warRoomId,
      title: data.title,
      description: data.description,
      criticism: data.criticism,
      status: data.status,
      kanban_column_id: data.kanbanColumnId ?? data.status,
      evidence_url: evidenceUrl || attachments[0]?.url,
      prototype_url: prototypeUrl,
      attachments,
      duplicate_of_bug_id: data.duplicateOfBugId || null,
      repro_checklist: reproChecklist,
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

    if (data.criticism === "blocker" && !options?.skipWebhook) {
      void notifyWebhook({ roomId: data.warRoomId, bugId: customId, kind: "blocker" });
    }

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
  if (fields.evidenceUrl !== undefined) {
    if (fields.evidenceUrl === "") {
      payload.evidence_url = null;
    } else {
      const evidenceUrl = safeMediaUrl(fields.evidenceUrl);
      if (!evidenceUrl) throw new Error("O link de evidência precisa ser https://");
      payload.evidence_url = evidenceUrl;
    }
  }
  if (fields.prototypeUrl !== undefined) {
    if (fields.prototypeUrl === "") {
      payload.prototype_url = null;
    } else {
      const prototypeUrl = safeMediaUrl(fields.prototypeUrl);
      if (!prototypeUrl) throw new Error("O link de protótipo precisa ser https://");
      payload.prototype_url = prototypeUrl;
    }
  }
  if (fields.ownerId !== undefined) payload.owner_id = fields.ownerId;
  if (fields.ownerName !== undefined) payload.owner_name = fields.ownerName;
  if (fields.environment !== undefined) payload.environment = fields.environment;
  if (fields.affectedUrl !== undefined) payload.affected_url = fields.affectedUrl;
  if (fields.buildVersion !== undefined) payload.build_version = fields.buildVersion;
  if (fields.tags !== undefined) payload.tags = fields.tags;
  if (fields.priority !== undefined) payload.priority = fields.priority;
  if (fields.type !== undefined) payload.type = fields.type;
  if (fields.reopenCount !== undefined) payload.reopen_count = fields.reopenCount;
  if (fields.archived !== undefined) payload.archived = fields.archived;
  if (fields.attachments !== undefined) {
    const attachments = parseAttachments(fields.attachments);
    payload.attachments = attachments;
    payload.evidence_url = attachments[0]?.url ?? null;
  }
  if (fields.duplicateOfBugId !== undefined) payload.duplicate_of_bug_id = fields.duplicateOfBugId || null;
  if (fields.reproChecklist !== undefined) payload.repro_checklist = parseReproChecklist(fields.reproChecklist);

  const { data: previous } = await supabase
    .from("bugs")
    .select("criticism, status")
    .eq("id", bugId)
    .maybeSingle();

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

  if (fields.ownerId && fields.ownerId !== userId) {
    await createNotification({
      userId: fields.ownerId,
      type: "assignment",
      title: `${userName} atribuiu um card para você`,
      body: logDescription,
      warRoomId,
      bugId,
    });
  }

  const becameBlocker = fields.criticism === "blocker" && previous?.criticism !== "blocker";
  const becameReady = fields.status === "ready_for_qa" && previous?.status !== "ready_for_qa";
  if (becameBlocker) void notifyWebhook({ roomId: warRoomId, bugId, kind: "blocker" });
  if (becameReady) void notifyWebhook({ roomId: warRoomId, bugId, kind: "ready_for_qa" });
}

export async function archiveBug(
  bugId: string,
  warRoomId: string,
  userId: string,
  userName: string
): Promise<void> {
  await updateBugField(
    bugId,
    warRoomId,
    { archived: true },
    userId,
    userName,
    "Arquivou o card",
    "archive"
  );
}

export async function fetchAccessibleRooms(): Promise<
  Array<Pick<WarRoom, "id" | "name" | "roomType" | "project">>
> {
  const { data, error } = await supabase
    .from("war_rooms")
    .select("id, name, room_type, project")
    .order("name");
  if (error) {
    console.error("fetchAccessibleRooms:", error);
    return [];
  }
  return (data || []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) || row.id,
    roomType: (row.room_type as WarRoom["roomType"]) || "war_room",
    project: (row.project as string) || "",
  }));
}

export async function findPermanentBoardForWarRoom(
  warRoom: Pick<WarRoom, "id" | "project">
): Promise<{ roomId: string; name: string } | null> {
  if (!warRoom.project.trim()) return null;
  const { data: project } = await supabase
    .from("projects")
    .select("war_room_id, name")
    .eq("name", warRoom.project)
    .maybeSingle();
  if (project?.war_room_id && project.war_room_id !== warRoom.id) {
    return { roomId: project.war_room_id as string, name: (project.name as string) || warRoom.project };
  }
  const { data: board } = await supabase
    .from("war_rooms")
    .select("id, name")
    .eq("project", warRoom.project)
    .eq("room_type", "board")
    .neq("id", warRoom.id)
    .maybeSingle();
  if (board?.id) {
    return { roomId: board.id as string, name: (board.name as string) || warRoom.project };
  }
  return null;
}

export async function copyBugToRoom(
  bug: Bug,
  targetRoomId: string,
  userId: string,
  userName: string,
  options?: { archiveSource?: boolean; skipWebhook?: boolean }
): Promise<string> {
  if (targetRoomId === bug.warRoomId) {
    throw new Error("Escolha outra sala.");
  }
  const copied = [];
  for (const attachment of attachmentsOf(bug)) {
    if (attachment.kind === "link") {
      copied.push(makeAttachment(attachment.url, "link"));
      continue;
    }
    copied.push(makeAttachment(await copyEvidenceToRoom(attachment.url, targetRoomId), attachment.kind));
  }
  const newId = await createBug(
    {
      warRoomId: targetRoomId,
      title: bug.title,
      description: bug.description,
      criticism: bug.criticism,
      status: bug.status,
      kanbanColumnId: bug.kanbanColumnId ?? bug.status,
      attachments: copied,
      evidenceUrl: copied[0]?.url,
      prototypeUrl: copied.find((item) => item.kind === "prototype")?.url,
      duplicateOfBugId: bug.duplicateOfBugId || null,
      reproChecklist: bug.reproChecklist || [],
      ownerId: bug.ownerId,
      ownerName: bug.ownerName,
      environment: bug.environment,
      affectedUrl: bug.affectedUrl,
      buildVersion: bug.buildVersion,
      tags: bug.tags,
      priority: bug.priority,
      type: bug.type,
      createdBy: userId,
      createdByName: userName,
    },
    userId,
    userName,
    { skipWebhook: options?.skipWebhook ?? true }
  );
  if (options?.archiveSource) {
    await archiveBug(bug.id, bug.warRoomId, userId, userName);
  }
  return newId;
}

export async function applyLeftoverAction(
  bugs: Bug[],
  action: "keep" | "move" | "archive",
  userId: string,
  userName: string,
  targetRoomId?: string
): Promise<void> {
  if (action === "keep" || bugs.length === 0) return;
  if (action === "archive") {
    for (const bug of bugs) {
      await archiveBug(bug.id, bug.warRoomId, userId, userName);
    }
    return;
  }
  if (!targetRoomId) throw new Error("Não há board permanente deste projeto.");
  for (const bug of bugs) {
    await copyBugToRoom(bug, targetRoomId, userId, userName, {
      archiveSource: true,
      skipWebhook: true,
    });
  }
}

export async function fetchOrgWebhookUrl(): Promise<string> {
  const response = await authFetch("/api/admin/org-webhook");
  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível ler o webhook."));
  }
  const data = (await response.json()) as { url?: string };
  return String(data.url || "");
}

export async function saveOrgWebhookUrl(url: string): Promise<void> {
  const response = await authFetch("/api/admin/org-webhook", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível salvar o webhook."));
  }
}

async function joinWarRoomViaApi(input: string): Promise<string> {
  const response = await authFetch("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Não foi possível entrar na sala."));
  }
  const data = await response.json();
  return data.roomId as string;
}

export async function joinWarRoom(input: string): Promise<string> {
  const trimmed = parseRoomInvite(input);
  if (!trimmed) throw new Error("Cole o link da sala ou o ID.");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sessão expirada. Faça login novamente.");

  const visible = await findWarRoomByIdOrName(trimmed);
  if (visible) return visible.id;

  const { data: profile } = await supabase
    .from("users")
    .select("is_guest")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_guest) {
    throw new Error(
      "Você não tem acesso a esta sala. Peça a um admin para marcar o board em Usuários."
    );
  }

  const { error } = await supabase.from("room_members").insert({
    war_room_id: trimmed,
    user_id: userId,
    added_by: userId,
  });
  if (!error || error.code === "23505") {
    return trimmed;
  }
  if (error.code === "23503") {
    try {
      return await joinWarRoomViaApi(trimmed);
    } catch {
      throw new Error("Sala não encontrada. Confira o link.");
    }
  }

  try {
    return await joinWarRoomViaApi(trimmed);
  } catch {
    throw new Error(error.message || "Não foi possível entrar na sala.");
  }
}

export async function fetchMembershipPairs(): Promise<Array<{ userId: string; roomId: string }>> {
  const { data, error } = await supabase.from("room_members").select("user_id, war_room_id");
  if (error) {
    console.error("fetchMembershipPairs:", error);
    return [];
  }
  return (data || []).map((row) => ({
    userId: row.user_id as string,
    roomId: row.war_room_id as string,
  }));
}

export async function fetchUserRoomIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select("war_room_id")
    .eq("user_id", userId);
  if (error) handleDbError(error, OperationType.LIST, `room_members/${userId}`);
  return (data || []).map((row) => row.war_room_id as string);
}

export async function fetchRoomMemberIds(roomId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("war_room_id", roomId);
  if (error) handleDbError(error, OperationType.LIST, `room_members/${roomId}`);
  return (data || []).map((row) => row.user_id as string);
}

export async function addRoomMember(
  roomId: string,
  userId: string,
  addedBy: string
): Promise<void> {
  const { error } = await supabase.from("room_members").insert({
    war_room_id: roomId,
    user_id: userId,
    added_by: addedBy,
  });
  if (error && error.code !== "23505") {
    handleDbError(error, OperationType.CREATE, `room_members/${roomId}/${userId}`);
  }
}

export async function removeRoomMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("war_room_id", roomId)
    .eq("user_id", userId);
  if (error) handleDbError(error, OperationType.DELETE, `room_members/${roomId}/${userId}`);
}

export async function setUserRoomAccess(
  userId: string,
  roomIds: string[],
  actorId: string
): Promise<void> {
  const current = await fetchUserRoomIds(userId);
  const { add, remove } = diffRoomAccess(current, roomIds);
  await Promise.all([
    ...add.map((roomId) => addRoomMember(roomId, userId, actorId)),
    ...remove.map((roomId) => removeRoomMember(roomId, userId)),
  ]);
}

export async function inviteToRoom(
  roomId: string,
  email: string,
  role?: string
): Promise<{ invited: boolean; alreadyMember: boolean; roleApplied?: string | null }> {
  const response = await authFetch("/api/rooms/invite", {
    method: "POST",
    body: JSON.stringify({ roomId, email, role }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Falha ao enviar convite."));
  }
  return response.json();
}

export async function createNotification(
  data: Omit<AppNotification, "id" | "createdAt" | "readAt">
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
    war_room_id: data.warRoomId || null,
    bug_id: data.bugId || null,
  });
  if (error) {
    console.error("createNotification:", error);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) handleDbError(error, OperationType.UPDATE, `notifications/${id}`);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) handleDbError(error, OperationType.UPDATE, "notifications");
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

  const { data: bugRow } = await supabase
    .from("bugs")
    .select("owner_id, title")
    .eq("id", commentData.bugId)
    .maybeSingle();
  if (bugRow?.owner_id && bugRow.owner_id !== commentData.userId) {
    await createNotification({
      userId: bugRow.owner_id as string,
      type: "comment",
      title: `${userName} comentou no seu card`,
      body: (bugRow.title as string) || commentData.text.slice(0, 80),
      warRoomId: commentData.warRoomId,
      bugId: commentData.bugId,
    });
  }

  const users = await fetchUsersList();
  const mentioned = findMentionedUsers(
    commentData.text,
    users.map((user) => ({ id: user.id, name: user.name }))
  );
  const alreadyNotified = new Set<string>([commentData.userId, String(bugRow?.owner_id || "")]);
  for (const user of mentioned) {
    if (alreadyNotified.has(user.id)) continue;
    alreadyNotified.add(user.id);
    await createNotification({
      userId: user.id,
      type: "mention",
      title: `${userName} mencionou você`,
      body: (bugRow?.title as string) || commentData.text.slice(0, 80),
      warRoomId: commentData.warRoomId,
      bugId: commentData.bugId,
    });
  }
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
  if (fields.squad !== undefined) payload.squad = normalizeArea(fields.squad);

  const { error } = await supabase.from("users").update(payload).eq("id", userId);
  if (error) handleDbError(error, OperationType.UPDATE, `users/${userId}`);
}

export async function deleteUserProfile(userId: string): Promise<void> {
  const response = await authFetch("/api/admin/delete-user", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Erro ao remover usuário."));
  }
}

export async function moveUserToOrganization(userId: string, organizationId: string): Promise<void> {
  const response = await authFetch("/api/admin/move-user", {
    method: "POST",
    body: JSON.stringify({ userId, organizationId }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Erro ao mover usuário."));
  }
}

export async function fetchOrganizationOverviews(): Promise<OrganizationOverview[]> {
  const [{ data: orgRows, error: orgError }, { data: userRows, error: userError }, { data: roomRows, error: roomError }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, slug, created_at").order("created_at", { ascending: true }),
      supabase.from("users").select("id, name, email, role, organization_id, is_guest"),
      supabase.from("war_rooms").select("organization_id"),
    ]);
  if (orgError) handleDbError(orgError, OperationType.LIST, "organizations");
  if (userError) handleDbError(userError, OperationType.LIST, "users");
  if (roomError) handleDbError(roomError, OperationType.LIST, "war_rooms");

  const users = userRows || [];
  const rooms = roomRows || [];

  return (orgRows || []).map((row) => {
    const id = row.id as string;
    const members = users.filter((user) => user.organization_id === id && !user.is_guest);
    return {
      id,
      name: row.name as string,
      slug: row.slug as string,
      createdAt: row.created_at as string,
      userCount: members.length,
      roomCount: rooms.filter((room) => room.organization_id === id).length,
      admins: members
        .filter((user) => user.role === "admin")
        .map((user) => ({
          id: user.id as string,
          name: (user.name as string) || "",
          email: (user.email as string) || "",
        })),
    };
  });
}

export async function createOrganizationWithAdmin(input: {
  name: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}): Promise<{ organizationId: string; adminUserId: string; slug: string }> {
  const response = await authFetch("/api/admin/create-organization", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Falha ao criar organização."));
  }
  return response.json();
}

export async function createOrganizationAdmin(input: {
  organizationId: string;
  name: string;
  email: string;
  password: string;
}): Promise<string> {
  const response = await authFetch("/api/admin/create-user", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
      role: "admin",
      squad: "Admin",
      organizationId: input.organizationId,
    }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Falha ao criar admin."));
  }
  const data = await response.json().catch(() => ({}));
  return String(data.userId || "");
}

export async function renameOrganization(organizationId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Nome da organização é obrigatório.");
  }
  const { error } = await supabase.from("organizations").update({ name: trimmed }).eq("id", organizationId);
  if (error) handleDbError(error, OperationType.UPDATE, `organizations/${organizationId}`);
}

// -------------------------
// AI proxy calls
// -------------------------

export async function fetchAISuggestions(
  title: string,
  description: string
): Promise<AISuggestion> {
  const response = await authFetch("/api/ai/suggest-bug-fields", {
    method: "POST",
    body: JSON.stringify({ title, description }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch AI suggests."));
  }
  return response.json();
}

export async function fetchAIDuplicateCheck(
  title: string,
  description: string,
  existingBugs: Partial<Bug>[]
): Promise<AIDuplicateCheck> {
  const response = await authFetch("/api/ai/detect-duplicate", {
    method: "POST",
    body: JSON.stringify({ title, description, existingBugs }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to fetch Duplication checks."));
  }
  return response.json();
}

export async function fetchAIExecutiveReport(
  roomId: string
): Promise<AIExecutiveReport> {
  const response = await authFetch("/api/ai/generate-report", {
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Falha ao gerar relatório executivo."));
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
