import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type PresenceMember = { id: string; name: string };

export function useRoomPresence(
  roomId: string | null,
  user: { id: string; name: string } | null
): PresenceMember[] {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!roomId || !user) {
      setMembers([]);
      return;
    }

    const channel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      const state = channel.presenceState<{ id: string; name: string }>();
      const next: PresenceMember[] = [];
      const seen = new Set<string>();
      for (const presences of Object.values(state)) {
        const first = presences[0];
        if (!first?.id || seen.has(first.id)) continue;
        seen.add(first.id);
        next.push({ id: first.id, name: first.name || "?" });
      }
      next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setMembers(next);
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ id: user.id, name: user.name });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, user?.id, user?.name]);

  return members;
}
