import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  WarRoom,
  Bug,
  BugComment,
  ActivityLog,
  UserProfile,
  BoardView,
  Project,
  AppNotification,
} from "../types";
import { applyRealtimeChange, isIncompleteRow, RealtimeEvent } from "./realtime";
import { PulseBug } from "./dashboardPulse";
import { normalizeArea } from "./squads";
import { resolveOrganizationId } from "./organizations";
import { withSignedMedia } from "./evidence";

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
    squad: normalizeArea((row.squad as string) || ""),
    organizationId: resolveOrganizationId(row.organization_id as string | undefined),
    isSuperadmin: Boolean(row.is_superadmin),
    avatarUrl: (row.avatar_url as string) || undefined,
    isGuest: Boolean(row.is_guest),
    createdAt: row.created_at as string,
  };
}

export function toWarRoom(row: Record<string, unknown>): WarRoom {
  return {
    id: row.id as string,
    name: row.name as string,
    project: row.project as string,
    squad: normalizeArea((row.squad as string) || ""),
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
    organizationId: resolveOrganizationId(row.organization_id as string | undefined),
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
    archived: Boolean(row.archived),
  };
}

export function toNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: (row.type as string) || "assignment",
    title: row.title as string,
    body: (row.body as string) || "",
    warRoomId: (row.war_room_id as string) || undefined,
    bugId: (row.bug_id as string) || undefined,
    readAt: (row.read_at as string) || null,
    createdAt: row.created_at as string,
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
    organizationId: resolveOrganizationId(row.organization_id as string | undefined),
    createdAt: row.created_at as string,
  };
}

export function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    squad: normalizeArea((row.squad as string) || ""),
    description: (row.description as string) || "",
    warRoomId: row.war_room_id as string,
    organizationId: resolveOrganizationId(row.organization_id as string | undefined),
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

type Unsubscribe = () => void;

export const DASHBOARD_BUGS_LIMIT = 1500;
export const DASHBOARD_EXPORT_LIMIT = 5000;

export function toPulseBug(row: Record<string, unknown>): PulseBug {
  return {
    id: row.id as string,
    warRoomId: row.war_room_id as string,
    status: row.status as PulseBug["status"],
    criticism: row.criticism as PulseBug["criticism"],
    createdAt: row.created_at as string,
    ownerId: (row.owner_id as string) || null,
    archived: Boolean(row.archived),
  };
}

function subscribeMappedList<T>(options: {
  table: string;
  channelName: string;
  fetchRows: () => Promise<T[]>;
  mapRow: (row: Record<string, unknown>) => T;
  getId: (item: T) => string;
  onChange: (items: T[]) => void;
  matches?: (item: T) => boolean;
  requiredKeys?: string[];
  insertAt?: "start" | "end";
  alwaysRefetch?: boolean;
}): Unsubscribe {
  let items: T[] = [];
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  const requiredKeys = options.requiredKeys ?? ["id"];

  const publish = (next: T[]) => {
    items = next;
    options.onChange(items);
  };

  const load = async () => {
    try {
      publish(await options.fetchRows());
    } catch (error) {
      console.error(`${options.channelName}:`, error);
    }
  };

  const scheduleRefetch = () => {
    if (refetchTimer) return;
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      void load();
    }, 80);
  };

  void load();

  const channel = supabase
    .channel(options.channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: options.table },
      (payload) => {
        const event = payload.eventType as RealtimeEvent;
        const raw = (event === "DELETE" ? payload.old : payload.new) as Record<string, unknown> | null;
        if (!raw || isIncompleteRow(raw, event === "DELETE" ? ["id"] : requiredKeys)) {
          scheduleRefetch();
          return;
        }
        const mapped = options.mapRow(raw);
        if (options.alwaysRefetch) scheduleRefetch();
        if (options.matches && event !== "DELETE" && !options.matches(mapped)) {
          publish(items.filter((item) => options.getId(item) !== options.getId(mapped)));
          return;
        }
        if (event === "INSERT" && options.insertAt === "end") {
          const id = options.getId(mapped);
          if (items.some((item) => options.getId(item) === id)) {
            publish(items.map((item) => (options.getId(item) === id ? mapped : item)));
          } else {
            publish([...items, mapped]);
          }
          return;
        }
        publish(applyRealtimeChange(items, event, mapped, options.getId));
      }
    )
    .subscribe();

  return () => {
    if (refetchTimer) clearTimeout(refetchTimer);
    supabase.removeChannel(channel);
  };
}

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
  return subscribeMappedList({
    table: "war_rooms",
    channelName: "war_rooms-live",
    fetchRows: async () => {
      const { data, error } = await supabase
        .from("war_rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(toWarRoom);
    },
    mapRow: toWarRoom,
    getId: (room) => room.id,
    onChange: callback,
    requiredKeys: ["id", "name"],
  });
}

export function subscribeDashboardPulse(callback: (bugs: PulseBug[]) => void): Unsubscribe {
  return subscribeMappedList({
    table: "bugs",
    channelName: "bugs-pulse-live",
    fetchRows: async () => {
      const { data, error } = await supabase
        .from("bugs")
        .select("id, war_room_id, status, criticism, created_at, owner_id, archived")
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(DASHBOARD_BUGS_LIMIT);
      if (error) throw error;
      return (data || []).map(toPulseBug);
    },
    mapRow: toPulseBug,
    getId: (bug) => bug.id,
    onChange: callback,
    matches: (bug) => !bug.archived,
    requiredKeys: ["id", "war_room_id", "status", "criticism", "created_at"],
  });
}

export type DashboardExportBug = {
  id: string;
  title: string;
  status: string;
  criticism: string;
  type: string;
  environment: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
};

export async function fetchDashboardExportBugs(): Promise<DashboardExportBug[]> {
  const { data, error } = await supabase
    .from("bugs")
    .select("id, title, status, criticism, type, environment, owner_id, owner_name, created_at, archived")
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_EXPORT_LIMIT);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || "",
    status: (row.status as string) || "",
    criticism: (row.criticism as string) || "",
    type: (row.type as string) || "",
    environment: (row.environment as string) || "",
    ownerId: (row.owner_id as string) || null,
    ownerName: (row.owner_name as string) || null,
    createdAt: (row.created_at as string) || "",
  }));
}

export function subscribeUsers(
  callback: (users: UserProfile[]) => void
): Unsubscribe {
  return subscribeMappedList({
    table: "users",
    channelName: "users-live",
    fetchRows: async () => {
      const { data, error } = await supabase.from("users").select("*");
      if (error) throw error;
      return (data || []).map(toUserProfile);
    },
    mapRow: toUserProfile,
    getId: (user) => user.id,
    onChange: callback,
    requiredKeys: ["id", "email"],
  });
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
  return subscribeMappedList({
    table: "bugs",
    channelName: `bugs-room-${roomId}`,
    fetchRows: async () => {
      const { data, error } = await supabase
        .from("bugs")
        .select("*")
        .eq("war_room_id", roomId)
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all((data || []).map((row) => withSignedMedia(toBug(row))));
    },
    mapRow: toBug,
    getId: (bug) => bug.id,
    onChange: callback,
    matches: (bug) => bug.warRoomId === roomId && !bug.archived,
    requiredKeys: ["id", "war_room_id", "title", "status"],
    alwaysRefetch: true,
  });
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
    callback(data ? await withSignedMedia(toBug(data)) : null);
  };
  return subscribeTable("bugs", fetchRow, `bug-${bugId}`);
}

export function subscribeBugComments(
  bugId: string,
  callback: (comments: BugComment[]) => void
): Unsubscribe {
  return subscribeMappedList({
    table: "bug_comments",
    channelName: `comments-${bugId}`,
    fetchRows: async () => {
      const { data, error } = await supabase
        .from("bug_comments")
        .select("*")
        .eq("bug_id", bugId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(toBugComment);
    },
    mapRow: toBugComment,
    getId: (comment) => comment.id,
    onChange: callback,
    matches: (comment) => comment.bugId === bugId,
    requiredKeys: ["id", "bug_id", "text"],
    insertAt: "end",
  });
}

export function subscribeActivityLogs(
  bugId: string,
  callback: (logs: ActivityLog[]) => void
): Unsubscribe {
  return subscribeMappedList({
    table: "activity_logs",
    channelName: `logs-${bugId}`,
    fetchRows: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("bug_id", bugId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(toActivityLog);
    },
    mapRow: toActivityLog,
    getId: (log) => log.id,
    onChange: callback,
    matches: (log) => log.bugId === bugId,
    requiredKeys: ["id", "bug_id"],
  });
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

export function subscribeNotifications(
  userId: string,
  callback: (items: AppNotification[]) => void
): Unsubscribe {
  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.error("subscribeNotifications:", error);
      return;
    }
    callback((data || []).map(toNotification));
  };
  return subscribeTable("notifications", fetchRows, `notifications-${userId}`);
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
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (byName) return toWarRoom(byName);

  return null;
}
