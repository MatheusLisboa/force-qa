import React from "react";
import { Inbox, LayoutGrid } from "lucide-react";
import { PulseBug } from "../lib/dashboardPulse";
import {
  decorateSpaces,
  groupSpacesByProject,
  railVisibleSpaces,
  SpaceRow,
  UNGROUPED_PROJECT_LABEL,
} from "../lib/spaces";

interface RoomRailProps {
  spaces: SpaceRow[];
  bugs: PulseBug[];
  currentRoomId: string | null;
  inboxOpen?: boolean;
  loading?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectRoom: (roomId: string) => void;
  onOpenDashboard: () => void;
  onOpenInbox: () => void;
}

export const RoomRail: React.FC<RoomRailProps> = ({
  spaces,
  bugs,
  currentRoomId,
  inboxOpen = false,
  loading = false,
  mobileOpen,
  onCloseMobile,
  onSelectRoom,
  onOpenDashboard,
  onOpenInbox,
}) => {
  const groups = groupSpacesByProject(railVisibleSpaces(decorateSpaces(spaces, bugs), currentRoomId));
  const onDashboard = !currentRoomId && !inboxOpen;

  const select = (roomId: string) => {
    onSelectRoom(roomId);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fq-rail-backdrop md:hidden"
          aria-label="Fechar lista de salas"
          onClick={onCloseMobile}
        />
      )}
      <aside className={`fq-rail ${mobileOpen ? "fq-rail--open" : ""}`} aria-label="Salas">
        <div className="px-2">
          <button
            type="button"
            className={`fq-rail-item ${onDashboard ? "fq-rail-item--current" : ""}`}
            onClick={() => {
              onOpenDashboard();
              onCloseMobile();
            }}
          >
            <span className="fq-rail-item-name">Todas as salas</span>
          </button>
          <button
            type="button"
            className={`fq-rail-item ${inboxOpen ? "fq-rail-item--current" : ""}`}
            onClick={() => {
              onOpenInbox();
              onCloseMobile();
            }}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="fq-rail-item-name">Meus cards</span>
          </button>
        </div>

        {loading ? (
          <p className="px-3 py-4 text-[12px] text-neutral-500">Carregando salas...</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-4 text-[12px] leading-relaxed text-neutral-500">
            Nenhuma sala ativa. Abra uma no painel.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="fq-rail-group">
              {(groups.length > 1 || group.title !== UNGROUPED_PROJECT_LABEL) && (
                <p className="fq-rail-group-title">{group.title}</p>
              )}
              {group.items.map(({ space, roomPulse }) => {
                const current = space.roomId === currentRoomId;
                return (
                  <button
                    key={space.key}
                    type="button"
                    className={`fq-rail-item ${current ? "fq-rail-item--current" : ""}`}
                    onClick={() => select(space.roomId)}
                    title={space.name}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="fq-rail-item-name">{space.name}</span>
                      {space.kind === "board" && (
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-500">
                          <LayoutGrid className="h-3 w-3" />
                          Permanente
                        </span>
                      )}
                    </span>
                    {roomPulse.blockers > 0 && (
                      <span className="fq-rail-count" title="Blockers">
                        {roomPulse.blockers}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </aside>
    </>
  );
};
