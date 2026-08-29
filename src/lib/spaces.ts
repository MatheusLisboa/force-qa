import { BoardView, Project, WarRoom } from "../types";
import {
  comparePulseActivity,
  dashboardPulse,
  PulseBug,
  PulseCounts,
  PulseKind,
  pulseMatchesCounts,
} from "./dashboardPulse";

export const UNGROUPED_PROJECT_LABEL = "Sem projeto";

export type SpaceRow = {
  key: string;
  roomId: string;
  name: string;
  squad: string;
  projectLabel?: string;
  kind: "war_room" | "board";
  status?: WarRoom["status"];
  dateLine?: string;
  viewCount?: number;
};

export type DecoratedSpace = {
  space: SpaceRow;
  roomPulse: PulseCounts;
};

export type SpaceGroup = {
  key: string;
  title: string;
  pinned: boolean;
  items: DecoratedSpace[];
};

export function buildSpaces(
  orgRooms: WarRoom[],
  orgProjects: Project[],
  allBoardViews: BoardView[]
): SpaceRow[] {
  const viewCountByProject = allBoardViews.reduce<Record<string, number>>((acc, view) => {
    if (view.projectId && view.isActive) {
      acc[view.projectId] = (acc[view.projectId] || 0) + 1;
    }
    return acc;
  }, {});

  const warRoomRows: SpaceRow[] = orgRooms
    .filter((room) => (room.roomType || "war_room") === "war_room")
    .map((room) => ({
      key: `room-${room.id}`,
      roomId: room.id,
      name: room.name,
      squad: room.squad,
      projectLabel: room.project,
      kind: "war_room",
      status: room.status,
      dateLine: room.date
        ? `${room.date}${room.periodEnd ? ` → ${room.periodEnd}` : ""}`
        : undefined,
    }));

  const projectRows: SpaceRow[] = orgProjects.map((project) => ({
    key: `project-${project.id}`,
    roomId: project.warRoomId,
    name: project.name,
    squad: project.squad,
    kind: "board",
    viewCount: viewCountByProject[project.id] || 0,
  }));

  return [...warRoomRows, ...projectRows];
}

export function decorateSpaces(
  spaces: SpaceRow[],
  scopedBugs: PulseBug[],
  options: { query?: string; pulseFilter?: PulseKind } = {}
): DecoratedSpace[] {
  const query = (options.query || "").trim().toLowerCase();
  const pulseFilter = options.pulseFilter ?? "all";

  return spaces
    .filter((space) => {
      if (!query) return true;
      return [space.name, space.squad, space.projectLabel, space.roomId].some((value) =>
        (value || "").toLowerCase().includes(query)
      );
    })
    .map((space) => ({
      space,
      roomPulse: dashboardPulse(scopedBugs.filter((bug) => bug.warRoomId === space.roomId)),
    }))
    .filter(({ roomPulse }) => pulseMatchesCounts(roomPulse, pulseFilter))
    .sort((a, b) => {
      const byActivity = comparePulseActivity(a.roomPulse, b.roomPulse);
      if (byActivity !== 0) return byActivity;
      return a.space.name.localeCompare(b.space.name, "pt-BR");
    });
}

export function spaceGroupKey(space: SpaceRow): string {
  if (space.kind === "board") return space.name.trim() || UNGROUPED_PROJECT_LABEL;
  const label = (space.projectLabel || "").trim();
  return label || UNGROUPED_PROJECT_LABEL;
}

function spaceRankInGroup(space: SpaceRow): number {
  if (space.kind === "war_room") {
    const status = space.status || "active";
    if (status === "active") return 0;
    if (status === "paused") return 1;
    return 3;
  }
  return 2;
}

function compareSpaceInGroup(a: DecoratedSpace, b: DecoratedSpace): number {
  const rank = spaceRankInGroup(a.space) - spaceRankInGroup(b.space);
  if (rank !== 0) return rank;
  const byActivity = comparePulseActivity(a.roomPulse, b.roomPulse);
  if (byActivity !== 0) return byActivity;
  return a.space.name.localeCompare(b.space.name, "pt-BR");
}

function groupPulse(items: DecoratedSpace[]): PulseCounts {
  return items.reduce(
    (acc, item) => ({
      open: acc.open + item.roomPulse.open,
      blockers: acc.blockers + item.roomPulse.blockers,
      overdue: acc.overdue + item.roomPulse.overdue,
    }),
    { open: 0, blockers: 0, overdue: 0 }
  );
}

export function groupSpacesByProject(rows: DecoratedSpace[]): SpaceGroup[] {
  const map = new Map<string, DecoratedSpace[]>();
  for (const row of rows) {
    const key = spaceGroupKey(row.space);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  const groups: SpaceGroup[] = [];
  for (const [title, items] of map) {
    const sorted = [...items].sort(compareSpaceInGroup);
    const pinned = sorted.some(
      (item) => item.space.kind === "war_room" && (item.space.status || "active") === "active"
    );
    groups.push({ key: title, title, pinned, items: sorted });
  }

  return groups.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.title === UNGROUPED_PROJECT_LABEL && b.title !== UNGROUPED_PROJECT_LABEL) return 1;
    if (b.title === UNGROUPED_PROJECT_LABEL && a.title !== UNGROUPED_PROJECT_LABEL) return -1;
    const byActivity = comparePulseActivity(groupPulse(a.items), groupPulse(b.items));
    if (byActivity !== 0) return byActivity;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

export function railVisibleSpaces(rows: DecoratedSpace[], currentRoomId: string | null): DecoratedSpace[] {
  return rows.filter(({ space }) => {
    if (space.roomId === currentRoomId) return true;
    if (space.kind === "board") return true;
    return (space.status || "active") !== "ended";
  });
}
