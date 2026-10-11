import React, { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { subscribeInboxBugs, InboxBug } from "../lib/supabase";
import { getStatusLabel } from "../lib/bugLabels";
import { SeverityBadge, StatusBadge } from "./BugBadges";
import { EmptyState, ListSkeleton } from "./ui";

interface InboxPageProps {
  onOpenCard: (roomId: string, bugId: string) => void;
}

export const InboxPage: React.FC<InboxPageProps> = ({ onOpenCard }) => {
  const { profile } = useAuth();
  const [bugs, setBugs] = useState<InboxBug[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) {
      setBugs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeInboxBugs(profile.id, (next) => {
      setBugs(next);
      setLoading(false);
    });
  }, [profile?.id]);

  return (
    <div className="fq-page space-y-5">
      <div className="fq-page-header">
        <div>
          <h1 className="font-display text-xl font-semibold text-neutral-50">Meus cards</h1>
          <p className="text-[13px] text-neutral-500 mt-0.5">
            Cards atribuídos a você em todas as salas, ainda abertos.
          </p>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : bugs.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-4 w-4" />}
          title="Nada na sua fila"
          description="Quando alguém te atribuir um card, ele aparece aqui até ser validado."
        />
      ) : (
        <ul className="space-y-2 max-w-3xl">
          {bugs.map((bug) => (
            <li key={bug.id}>
              <button
                type="button"
                className="fq-panel w-full text-left !p-4 hover:bg-white/[0.04] transition"
                onClick={() => onOpenCard(bug.warRoomId, bug.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-100 truncate">{bug.title}</p>
                    <p className="text-[12px] text-neutral-500 mt-1 truncate">{bug.roomName}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={bug.criticism} />
                    <StatusBadge status={bug.status} />
                  </div>
                </div>
                <p className="sr-only">{getStatusLabel(bug.status)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
