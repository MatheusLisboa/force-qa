import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Search, UserPlus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { subscribeUsers } from "../lib/supabase";
import {
  addRoomMember,
  fetchRoomMemberIds,
  inviteToRoom,
  removeRoomMember,
} from "../lib/services";
import { UserProfile, UserRole } from "../types";
import { RoleBadge } from "./BugBadges";
import { formatRoleLabel } from "../lib/format";
import {
  DEFAULT_INVITE_ROLE,
  inviteRoleHint,
  inviteRolesForActor,
} from "../lib/inviteRole";

interface RoomMembersPanelProps {
  roomId: string;
}

export const RoomMembersPanel: React.FC<RoomMembersPanelProps> = ({ roomId }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>(DEFAULT_INVITE_ROLE);
  const [memberQuery, setMemberQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  const roleOptions = useMemo(
    () => inviteRolesForActor(profile?.role, profile?.isSuperadmin),
    [profile?.role, profile?.isSuperadmin]
  );

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

  useEffect(() => {
    if (!roleOptions.includes(inviteRole)) setInviteRole(DEFAULT_INVITE_ROLE);
  }, [inviteRole, roleOptions]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setMemberQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const members = useMemo(
    () => users.filter((user) => memberIds.includes(user.id)),
    [users, memberIds]
  );
  const candidates = useMemo(
    () => users.filter((user) => !memberIds.includes(user.id) && !user.isGuest),
    [users, memberIds]
  );
  const memberQueryNorm = memberQuery.trim().toLowerCase();
  const candidateMatches = useMemo(
    () =>
      candidates
        .filter((user) => {
          if (!memberQueryNorm) return false;
          return [user.name, user.email, user.squad].some((value) =>
            (value || "").toLowerCase().includes(memberQueryNorm)
          );
        })
        .slice(0, 8),
    [candidates, memberQueryNorm]
  );

  const handleAddUser = async (userId: string) => {
    if (!userId || !profile?.id || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await addRoomMember(roomId, userId, profile.id);
      setMemberQuery("");
      await reloadMembers();
      toast("Pessoa adicionada à sala.", { kind: "success" });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Falha ao adicionar.", { kind: "error" });
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
      const result = await inviteToRoom(roomId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      await reloadMembers();
      if (result.alreadyMember) {
        setMessage("Este e-mail já tem acesso a esta sala.");
      } else if (result.invited) {
        const label = formatRoleLabel(result.roleApplied || inviteRole);
        setMessage(`Convite enviado. A conta nasce como ${label}.`);
        toast(`Convite enviado como ${label}.`, { kind: "success" });
      } else {
        setMessage("Conta já existia na org. Entrou na sala com o papel atual.");
        toast("Pessoa adicionada à sala.", { kind: "success" });
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "Falha ao convidar.";
      setMessage(text);
      toast(text, { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    const ok = await confirm({
      title: "Remover da sala",
      message: `${name} perderá o acesso a esta sala.`,
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeRoomMember(roomId, userId);
      await reloadMembers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao remover.", { kind: "error" });
    }
  };

  return (
    <div className="w-full basis-full pt-3 mt-1 border-t border-white/[0.06]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-start">
        <div className="space-y-3">
          <div>
            <p className="text-[12px] font-medium text-neutral-300">Nesta sala</p>
            <p className="text-[12px] text-neutral-500 leading-relaxed mt-0.5">
              {members.length} {members.length === 1 ? "pessoa" : "pessoas"} com acesso a este Kanban.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
            {members.length === 0 ? (
              <span className="text-[12px] text-neutral-500">
                Ninguém além de você ainda. Convide por e-mail.
              </span>
            ) : (
              members.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-2 pr-1 py-1"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.08] text-[9px] font-semibold uppercase text-neutral-300">
                    {(user.name || "?").slice(0, 2)}
                  </span>
                  <span className="text-[12px] text-neutral-200 max-w-[120px] truncate">{user.name}</span>
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

          <div className="relative" ref={searchRef}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Adicionar alguém que já está na org"
              className="fq-input !py-1.5 !pl-8 !text-xs"
            />
            {memberQueryNorm && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[color:var(--color-fq-elevated)] shadow-lg">
                {candidateMatches.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12px] text-neutral-500">
                    Ninguém com esse nome fora da sala. Use o convite por e-mail.
                  </p>
                ) : (
                  candidateMatches.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      disabled={busy}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-neutral-300 hover:bg-white/[0.05]"
                      onClick={() => void handleAddUser(user.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-neutral-100">{user.name}</span>
                        <span className="block truncate text-[11px] text-neutral-500">{user.email}</span>
                      </span>
                      <RoleBadge role={user.role} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={handleInviteEmail}
          className="space-y-3 rounded-xl border border-teal-400/15 bg-[color:var(--color-fq-elevated)] p-4"
        >
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-neutral-100">Convidar por e-mail</p>
              <p className="text-[12px] text-neutral-500 leading-relaxed mt-0.5">
                Conta nova nasce nesta org, neste papel, e já entra nesta sala.
              </p>
            </div>
          </div>

          <div>
            <label className="fq-label fq-label--xs" htmlFor="room-invite-email">
              E-mail
            </label>
            <input
              id="room-invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder="nina.v@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="fq-input !py-2 !text-[13px]"
            />
          </div>

          <div>
            <p className="fq-label fq-label--xs">Papel na organização</p>
            <div className="grid grid-cols-3 gap-1.5">
              {roleOptions.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`fq-chip !px-2 !py-1 ${inviteRole === role ? "fq-chip--on" : ""}`}
                  onClick={() => setInviteRole(role)}
                >
                  {formatRoleLabel(role)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">
              {inviteRoleHint(inviteRole)} Quem já tem conta na org não muda de
              papel — só entra na sala.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy || !inviteEmail.trim()}
            className="fq-btn-primary w-full text-sm"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "Enviando..." : "Enviar convite"}
          </button>

          {message && (
            <p className="text-[12px] leading-relaxed text-neutral-400">{message}</p>
          )}
        </form>
      </div>
    </div>
  );
};
