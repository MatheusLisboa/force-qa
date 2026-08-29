import { useEffect, useMemo, useState } from "react";
import { belongsToOrganization } from "../lib/organizations";
import { PulseBug } from "../lib/dashboardPulse";
import { buildSpaces, SpaceRow } from "../lib/spaces";
import {
  subscribeAllBoardViews,
  subscribeDashboardPulse,
  subscribeProjects,
  subscribeWarRooms,
} from "../lib/supabase";
import { BoardView, Project, WarRoom } from "../types";

export function useOrgSpaces(organizationId: string | undefined, enabled = true) {
  const [warRooms, setWarRooms] = useState<WarRoom[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allBoardViews, setAllBoardViews] = useState<BoardView[]>([]);
  const [allBugs, setAllBugs] = useState<PulseBug[]>([]);
  const [loading, setLoading] = useState(true);

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
    () => warRooms.filter((room) => belongsToOrganization(room.organizationId, organizationId)),
    [warRooms, organizationId]
  );
  const orgProjects = useMemo(
    () =>
      projects.filter((project) => belongsToOrganization(project.organizationId, organizationId)),
    [projects, organizationId]
  );
  const spaces = useMemo<SpaceRow[]>(
    () => buildSpaces(orgRooms, orgProjects, allBoardViews),
    [orgRooms, orgProjects, allBoardViews]
  );

  return {
    loading,
    spaces,
    orgRooms,
    orgProjects,
    allBugs,
    allBoardViews,
  };
}
