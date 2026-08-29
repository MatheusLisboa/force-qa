import React, { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { subscribeInboxBugs, InboxBug } from "../lib/supabase";
import { getStatusLabel } from "../lib/bugLabels";
import { SeverityBadge, StatusBadge } from "./BugBadges";

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
        <div className="fq-empty-state">
          <div className="fq-spinner mx-auto mb-2" />
          <p className="text-neutral-500 text-sm">Carregando inbox...</p>
        </div>
      ) : bugs.length === 0 ? (
        <div className="fq-empty-state">
          <Inbox className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <h4 className="text-neutral-200 font-medium text-[15px]">Nada na sua fila</h4>
          <p className="text-neutral-500 text-sm mt-1 max-w-sm mx-auto">
            Quando alguém te atribuir um card, ele aparece aqui até ser validado.
          </p>
        </div>
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
