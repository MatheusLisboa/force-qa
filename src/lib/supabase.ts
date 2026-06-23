import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  WarRoom,
  Bug,
  BugComment,
  ActivityLog,
  UserProfile,
  BoardView,
  Project,
} from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Vite embute VITE_* no build — na Vercel as vars precisam existir antes do deploy. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("placeholder") &&
    supabaseAnonKey !== "placeholder"
  );
}

if (!isSupabaseConfigured()) {
  console.error(
    "[ForceQA] Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY " +
      "(Vercel: Settings → Environment Variables → redeploy obrigatório)."
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB ↔ camelCase app)
// ---------------------------------------------------------------------------

export function toUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as UserProfile["role"],
    squad: (row.squad as string) || "",
    avatarUrl: (row.avatar_url as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export function toWarRoom(row: Record<string, unknown>): WarRoom {
  return {
    id: row.id as string,
    name: row.name as string,
    project: row.project as string,
    squad: row.squad as string,
    date: row.date as string,
    periodEnd: (row.period_end as string) || undefined,
    description: row.description as string,
    severity: row.severity as WarRoom["severity"],
    status: row.status as WarRoom["status"],
    roomType: (row.room_type as WarRoom["roomType"]) || "war_room",
    kanbanColumns: (row.kanban_columns as WarRoom["kanbanColumns"]) || undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    createdByName: (row.created_by_name as string) || undefined,
    guestAccessDisabled: row.guest_access_disabled as boolean,
  };
}

export function toBug(row: Record<string, unknown>): Bug {
  return {
    id: row.id as string,
    warRoomId: row.war_room_id as string,
    title: row.title as string,
    description: (row.description as string) || "",
    criticism: row.criticism as Bug["criticism"],
    status: row.status as Bug["status"],
    kanbanColumnId: (row.kanban_column_id as string) || undefined,
    evidenceUrl: (row.evidence_url as string) || undefined,
    prototypeUrl: (row.prototype_url as string) || undefined,
    ownerId: (row.owner_id as string) || null,
    ownerName: (row.owner_name as string) || null,
    environment: row.environment as Bug["environment"],
    affectedUrl: (row.affected_url as string) || undefined,
    buildVersion: (row.build_version as string) || undefined,
    tags: (row.tags as string[]) || [],
    priority: row.priority as Bug["priority"],
    type: row.type as Bug["type"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string,
    createdByName: row.created_by_name as string,
    resolvedAt: (row.resolved_at as string) || undefined,
    reopenCount: (row.reopen_count as number) || 0,
  };
}

export function toBugComment(row: Record<string, unknown>): BugComment {
  return {
    id: row.id as string,
    bugId: row.bug_id as string,
    warRoomId: row.war_room_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    avatarUrl: row.avatar_url as string,
    text: row.text as string,
    createdAt: row.created_at as string,
  };
}

export function toBoardView(row: Record<string, unknown>): BoardView {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    isActive: row.is_active as boolean,
    orderIndex: (row.order_index as number) ?? 0,
    filters: (row.filters as BoardView["filters"]) || {},
    projectId: (row.project_id as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    squad: row.squad as string,
    description: (row.description as string) || "",
    warRoomId: row.war_room_id as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  };
}

export function toActivityLog(row: Record<string, unknown>): ActivityLog {
  return {
    id: row.id as string,
    bugId: row.bug_id as string,
    warRoomId: row.war_room_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    type: row.type as string,
    description: row.description as string,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function handleDbError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : String(error);
  console.error("Supabase error:", { message, operationType, path });
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (fetch + listen)
// ---------------------------------------------------------------------------

type Unsubscribe = () => void;

function subscribeTable(
  table: string,
  fetchRows: () => Promise<void>,
  channelName: string
): Unsubscribe {
  fetchRows();
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        fetchRows();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeWarRooms(
  callback: (rooms: WarRoom[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("war_rooms")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("subscribeWarRooms:", error);
      return;
    }
    callback((data || []).map(toWarRoom));
  };
  return subscribeTable("war_rooms", fetchRows, "war_rooms-live");
}

export function subscribeAllBugs(callback: (bugs: Bug[]) => void): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase.from("bugs").select("*");
    if (error) {
      console.error("subscribeAllBugs:", error);
      return;
    }
    callback((data || []).map(toBug));
  };
  return subscribeTable("bugs", fetchRows, "bugs-all-live");
}

export function subscribeUsers(
  callback: (users: UserProfile[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase.from("users").select("*");
    if (error) {
      console.error("subscribeUsers:", error);
      return;
    }
    callback((data || []).map(toUserProfile));
  };
  return subscribeTable("users", fetchRows, "users-live");
}

export function subscribeWarRoom(
  roomId: string,
  callback: (room: WarRoom | null) => void
): Unsubscribe {
  const fetchRow = async () => {
    const { data, error } = await supabase
      .from("war_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    if (error) {
      console.error("subscribeWarRoom:", error);
      return;
    }
    callback(data ? toWarRoom(data) : null);
  };
  return subscribeTable("war_rooms", fetchRow, `war_room-${roomId}`);
}

export function subscribeBugsByRoom(
  roomId: string,
  callback: (bugs: Bug[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("bugs")
      .select("*")
      .eq("war_room_id", roomId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("subscribeBugsByRoom:", error);
      return;
    }
    callback((data || []).map(toBug));
  };
  fetchRows();
  const channel = supabase
    .channel(`bugs-room-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bugs" },
      () => fetchRows()
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeBug(
  bugId: string,
  callback: (bug: Bug | null) => void
): Unsubscribe {
  const fetchRow = async () => {
    const { data, error } = await supabase
      .from("bugs")
      .select("*")
      .eq("id", bugId)
      .maybeSingle();
    if (error) {
      console.error("subscribeBug:", error);
      return;
    }
    callback(data ? toBug(data) : null);
  };
  return subscribeTable("bugs", fetchRow, `bug-${bugId}`);
}

export function subscribeBugComments(
  bugId: string,
  callback: (comments: BugComment[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("bug_comments")
      .select("*")
      .eq("bug_id", bugId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("subscribeBugComments:", error);
      return;
    }
    callback((data || []).map(toBugComment));
  };
  return subscribeTable("bug_comments", fetchRows, `comments-${bugId}`);
}

export function subscribeActivityLogs(
  bugId: string,
  callback: (logs: ActivityLog[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("bug_id", bugId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("subscribeActivityLogs:", error);
      return;
    }
    callback((data || []).map(toActivityLog));
  };
  return subscribeTable("activity_logs", fetchRows, `logs-${bugId}`);
}

export function subscribeBoardViews(
  projectId: string,
  callback: (views: BoardView[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("board_views")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (error) {
      console.error("subscribeBoardViews:", error);
      return;
    }
    callback((data || []).map(toBoardView));
  };
  return subscribeTable("board_views", fetchRows, `board-views-${projectId}`);
}

export function subscribeAllBoardViews(
  projectId: string | null,
  callback: (views: BoardView[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    let query = supabase.from("board_views").select("*").order("order_index", { ascending: true });
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("subscribeAllBoardViews:", error);
      return;
    }
    callback((data || []).map(toBoardView));
  };
  const channelKey = projectId ? `board-views-admin-${projectId}` : "board-views-admin-all";
  return subscribeTable("board_views", fetchRows, channelKey);
}

export function subscribeProjects(callback: (projects: Project[]) => void): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("subscribeProjects:", error);
      return;
    }
    callback((data || []).map(toProject));
  };
  return subscribeTable("projects", fetchRows, "projects-live");
}

export function subscribeProjectByWarRoomId(
  warRoomId: string,
  callback: (project: Project | null) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("war_room_id", warRoomId)
      .maybeSingle();
    if (error) {
      console.error("subscribeProjectByWarRoomId:", error);
      callback(null);
      return;
    }
    callback(data ? toProject(data) : null);
  };
  return subscribeTable("projects", fetchRows, `project-room-${warRoomId}`);
}

// ---------------------------------------------------------------------------
// War room lookup
// ---------------------------------------------------------------------------

export async function findWarRoomByIdOrName(
  input: string
): Promise<WarRoom | null> {
  const trimmed = input.trim();

  const { data: byId } = await supabase
    .from("war_rooms")
    .select("*")
    .eq("id", trimmed)
    .maybeSingle();
  if (byId) return toWarRoom(byId);

  const { data: byName } = await supabase
    .from("war_rooms")
    .select("*")
    .eq("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (byName) return toWarRoom(byName);

  const { data: all } = await supabase.from("war_rooms").select("*");
  const match = (all || []).find(
    (r) => (r.name as string)?.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return match ? toWarRoom(match) : null;
}
