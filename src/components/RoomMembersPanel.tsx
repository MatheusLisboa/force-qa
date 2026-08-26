import React, { useEffect, useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { subscribeUsers } from "../lib/supabase";
import {
  addRoomMember,
  fetchRoomMemberIds,
  inviteToRoom,
  removeRoomMember,
} from "../lib/services";
import { UserProfile } from "../types";
import { RoleBadge } from "./BugBadges";

interface RoomMembersPanelProps {
  roomId: string;
}

export const RoomMembersPanel: React.FC<RoomMembersPanelProps> = ({ roomId }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reloadMembers = async () => {
    try {
      setMemberIds(await fetchRoomMemberIds(roomId));
    } catch (err) {
      console.error("fetchRoomMemberIds:", err);
    }
  };

  useEffect(() => {
    const unsub = subscribeUsers(setUsers);
    void fetchRoomMemberIds(roomId)
      .then(setMemberIds)
      .catch((err) => console.error("fetchRoomMemberIds:", err));
    return unsub;
  }, [roomId]);

  const members = useMemo(
    () => users.filter((user) => memberIds.includes(user.id)),
    [users, memberIds]
  );
  const candidates = useMemo(
    () => users.filter((user) => !memberIds.includes(user.id) && !user.isGuest),
    [users, memberIds]
  );

  const handleAddSelected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !profile?.id || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await addRoomMember(roomId, selectedUserId, profile.id);
      setSelectedUserId("");
      await reloadMembers();
      setMessage("Usuário adicionado à sala.");
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Falha ao adicionar.";
      toast(text, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleInviteEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await inviteToRoom(roomId, inviteEmail.trim());
      setInviteEmail("");
      await reloadMembers();
      if (result.alreadyMember) {
        setMessage("Já é membro desta sala.");
      } else if (result.invited) {
        setMessage("Convite enviado por e-mail.");
      } else {
        setMessage("Usuário adicionado à sala.");
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Falha ao convidar.";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!window.confirm(`Remover ${name} desta sala?`)) return;
    try {
      await removeRoomMember(roomId, userId);
      await reloadMembers();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Falha ao remover.", { kind: "error" });
    }
  };

  return (
    <div className="w-full basis-full pt-3 mt-1 border-t border-white/[0.06] space-y-3">
      <div>
        <p className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider mb-1">
          Quem acessa esta sala
        </p>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Só quem estiver nesta lista vê o board. Admins também definem isso em Usuários, por pessoa.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 ? (
          <span className="text-[11px] font-mono text-neutral-500">Nenhum membro listado.</span>
        ) : (
          members.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] pl-2 pr-1 py-1"
            >
              <span className="text-[11px] text-neutral-200 max-w-[140px] truncate">{user.name}</span>
              <RoleBadge role={user.role} />
              <button
                type="button"
                onClick={() => handleRemove(user.id, user.name)}
                className="fq-btn-icon !p-0.5 hover:text-red-400"
                title={`Remover ${user.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form onSubmit={handleAddSelected} className="flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="fq-select text-xs !py-1.5 w-52"
          >
            <option value="">Selecionar usuário…</option>
            {candidates.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
          <button type="submit" disabled={!selectedUserId || busy} className="fq-btn-secondary text-xs !py-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </form>

        <form onSubmit={handleInviteEmail} className="flex items-center gap-2">
          <input
            type="email"
            placeholder="ou e-mail já cadastrado"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="fq-input !py-1.5 !text-xs w-44"
          />
          <button type="submit" disabled={busy || !inviteEmail.trim()} className="fq-btn-secondary text-xs !py-1.5">
            {busy ? "..." : "Convidar"}
          </button>
        </form>
      </div>

      {message && (
        <p className="text-[10px] font-mono text-neutral-400" title={message}>
          {message}
        </p>
      )}
    </div>
  );
};
