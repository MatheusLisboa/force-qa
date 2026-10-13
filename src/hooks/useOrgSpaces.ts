import { useEffect, useMemo, useState } from "react";
import { belongsToOrganization } from "../lib/organizations";
import { PulseBug } from "../lib/dashboardPulse";
import { buildSpaces, SpaceRow } from "../lib/spaces";
import {
  subscribeAllBoardViews,
  subscribeDashboardPulse,
  subscribeMyMemberships,
  subscribeProjects,
  subscribeWarRooms,
} from "../lib/supabase";
import { BoardView, Project, WarRoom } from "../types";

export function useOrgSpaces(
  organizationId: string | undefined,
  enabled = true,
  viewer?: { userId?: string; isAdmin?: boolean }
) {
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allBoardViews, setAllBoardViews] = useState<BoardView[]>([]);
  const [allBugs, setAllBugs] = useState<PulseBug[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRoomIds, setMyRoomIds] = useState<Set<string> | null>(null);
  const viewerId = viewer?.userId;
  const viewerIsAdmin = Boolean(viewer?.isAdmin);

  useEffect(() => {
    if (!enabled || !viewerId) {
      setMyRoomIds(null);
      return;
    }
    return subscribeMyMemberships(viewerId, setMyRoomIds);
  }, [enabled, viewerId]);

  useEffect(() => {
    if (!enabled) {
      setWarRooms([]);
      setProjects([]);
      setAllBoardViews([]);
      setAllBugs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribeRooms = subscribeWarRooms((rooms) => {
      setWarRooms(rooms);
      setLoading(false);
    });
    const unsubscribeProjects = subscribeProjects(setProjects);
    const unsubscribeBugs = subscribeDashboardPulse(setAllBugs);
    const unsubscribeViews = subscribeAllBoardViews(null, setAllBoardViews);
    return () => {
      unsubscribeRooms();
      unsubscribeProjects();
      unsubscribeBugs();
      unsubscribeViews();
    };
  }, [enabled]);

  const orgRooms = useMemo(
    () =>
      organizationId
        ? warRooms.filter((room) => belongsToOrganization(room.organizationId, organizationId))
        : warRooms,
    [warRooms, organizationId]
  );
  const orgProjects = useMemo(
    () =>
      organizationId
        ? projects.filter((project) => belongsToOrganization(project.organizationId, organizationId))
        : projects,
    [projects, organizationId]
  );
  const spaces = useMemo<SpaceRow[]>(() => {
    const built = buildSpaces(orgRooms, orgProjects, allBoardViews);
    // Admin da organização acessa tudo (conta como membro); os demais, só o que têm na lista de membros.
    if (viewerIsAdmin || !myRoomIds) return built;
    return built.map((space) => ({ ...space, isMember: myRoomIds.has(space.roomId) }));
  }, [orgRooms, orgProjects, allBoardViews, myRoomIds, viewerIsAdmin]);

  return {
    loading,
    spaces,
    orgRooms,
    orgProjects,
    allBugs,
    allBoardViews,
  };
}
