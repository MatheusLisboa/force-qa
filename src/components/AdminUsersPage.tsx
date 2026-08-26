import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, Edit2, Trash2, UserPlus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase, subscribeUsers, toWarRoom } from "../lib/supabase";
import {
  deleteUserProfile,
  fetchMembershipPairs,
  fetchUserRoomIds,
  setUserRoomAccess,
  updateUserProfile,
} from "../lib/services";
import { UserProfile, UserRole, WarRoom } from "../types";
import { RoleBadge } from "./BugBadges";
import { SquadSelect } from "./SquadSelect";

interface AdminUsersPageProps {
  onBack: () => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "developer", label: "Developer" },
  { value: "qa", label: "QA" },
  { value: "dba", label: "DBA" },
  { value: "devops", label: "DevOps" },
  { value: "scrum_master", label: "Scrum Master" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  if (checked) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((item) => item !== id);
}

function RoomAccessCheckboxes({
  rooms,
  selectedIds,
  onChange,
}: {
  rooms: WarRoom[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return <p className="text-[13px] text-neutral-500">Nenhum board cadastrado ainda.</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-md border border-white/[0.06] p-2">
      {rooms.filter((room) => room?.id).map((room) => (
        <label key={room.id} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedIds.includes(room.id)}
            onChange={(e) => onChange(toggleId(selectedIds, room.id, e.target.checked))}
            className="rounded border-neutral-700 text-teal-400 bg-transparent focus:ring-0"
          />
          <span className="truncate">{room.name}</span>
          <span className="ml-auto shrink-0 text-[11px] text-neutral-500">
            {room.roomType === "board" ? "board" : "sala"}
          </span>
        </label>
      ))}
    </div>
  );
}

export const AdminUsersPage: React.FC<AdminUsersPageProps> = ({ onBack }) => {
  const { adminCreateUser, profile } = useAuth();

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("developer");
  const [newUserSquad, setNewUserSquad] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreationError, setUserCreationError] = useState("");
  const [userCreationSuccess, setUserCreationSuccess] = useState("");
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingRole, setEditingRole] = useState<UserRole>("developer");
  const [editingSquad, setEditingSquad] = useState("");
  const [editingRoomIds, setEditingRoomIds] = useState<string[]>([]);
  const [newUserRoomIds, setNewUserRoomIds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<WarRoom[]>([]);
  const [roomIdsByUser, setRoomIdsByUser] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const unsubUsers = subscribeUsers(setUsersList);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("war_rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("admin users rooms:", error);
        return;
      }
      setRooms((data || []).map(toWarRoom));
    })();
    return () => {
      cancelled = true;
      unsubUsers();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMembershipPairs()
      .then((pairs) => {
        if (cancelled) return;
        const next: Record<string, string[]> = {};
        for (const pair of pairs) {
          if (!next[pair.userId]) next[pair.userId] = [];
          next[pair.userId].push(pair.roomId);
        }
        setRoomIdsByUser(next);
      })
      .catch((err) => console.error("fetchMembershipPairs:", err));
    return () => {
      cancelled = true;
    };
  }, [usersList.length]);

  const handleAdminCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim() || !newUserSquad.trim()) {
      setUserCreationError("Preencha todos os campos obrigatórios.");
      return;
    }
    if (newUserPassword.length < 6) {
      setUserCreationError("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setIsCreatingUser(true);
    setUserCreationError("");
    setUserCreationSuccess("");
    try {
      const userId = await adminCreateUser(
        newUserName.trim(),
        newUserEmail.trim(),
        newUserPassword,
        newUserRole,
        newUserSquad.trim()
      );
      if (userId && profile?.id && newUserRoomIds.length > 0) {
        await setUserRoomAccess(userId, newUserRoomIds, profile.id);
      }
      setUserCreationSuccess(`Usuário ${newUserName.trim()} cadastrado com sucesso.`);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserSquad("");
      setNewUserRoomIds([]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao cadastrar usuário.";
      setUserCreationError(message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveEdit = async (userId: string) => {
    if (!editingName.trim() || !editingSquad.trim()) {
      setUserCreationError("Todos os campos de edição são obrigatórios.");
      return;
    }
    try {
      await updateUserProfile(userId, {
        name: editingName.trim(),
        role: editingRole,
        squad: editingSquad.trim(),
      });
      if (profile?.id) {
        await setUserRoomAccess(userId, editingRoomIds, profile.id);
        setRoomIdsByUser((prev) => ({ ...prev, [userId]: editingRoomIds }));
      }
      setEditingUserId(null);
      setUserCreationError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar usuário.";
      setUserCreationError(message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Remover este usuário do Auth e do ForceQA? A ação é permanente.")) {
      return;
    }
    try {
      await deleteUserProfile(userId);
      setUserCreationError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao deletar usuário.";
      setUserCreationError(message);
    }
  };

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <button type="button" onClick={onBack} className="fq-btn-ghost text-sm mb-3">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <p className="fq-page-eyebrow flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-teal-400" /> Admin
          </p>
          <h1 className="fq-page-title mt-1">Usuários</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Cadastre pessoas e marque quais boards cada uma pode ver.
          </p>
        </div>
      </div>

      {userCreationError && <div className="fq-alert-error text-sm">{userCreationError}</div>}
      {userCreationSuccess && <div className="fq-alert-success text-sm">{userCreationSuccess}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-8">
        <div className="fq-panel p-5 space-y-4 h-fit">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">Novo usuário</h2>
            <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
              Cria a conta e o perfil. Marque abaixo os boards de acesso.
            </p>
          </div>

          <form onSubmit={handleAdminCreateUserSubmit} className="space-y-4">
            <div>
              <label className="fq-label fq-label--xs">Nome completo</label>
              <input
                required
                type="text"
                className="fq-input"
                placeholder="Ex: Matheus Lisboa"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">E-mail</label>
              <input
                required
                type="email"
                className="fq-input"
                placeholder="Ex: matheus@forceqa.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">Senha inicial (mínimo 6 caracteres)</label>
              <input
                required
                type="password"
                className="fq-input"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="fq-label fq-label--xs">Função</label>
                <select
                  className="fq-select"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fq-label fq-label--xs">Squad</label>
                <SquadSelect required className="fq-input" value={newUserSquad} onChange={setNewUserSquad} />
              </div>
            </div>
            <div>
              <label className="fq-label fq-label--xs">Acesso aos boards</label>
              <RoomAccessCheckboxes rooms={rooms} selectedIds={newUserRoomIds} onChange={setNewUserRoomIds} />
            </div>
            <button type="submit" disabled={isCreatingUser} className="fq-btn-primary w-full">
              {isCreatingUser ? "Cadastrando..." : "Cadastrar usuário"}
            </button>
          </form>
        </div>

        <div className="fq-panel p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">
              Pessoas ({usersList.length})
            </h2>
            <p className="text-neutral-500 text-[13px] mt-0.5">
              Edite para marcar os boards. Excluir remove também a conta no Auth.
            </p>
          </div>

          <div className="space-y-2">
            {usersList.length === 0 ? (
              <div className="fq-empty-state py-10">
                <span className="text-sm text-neutral-500">Carregando usuários...</span>
              </div>
            ) : (
              usersList.filter((usr) => usr?.id).map((usr) => {
                const isEditing = editingUserId === usr.id;
                if (isEditing) {
                  return (
                    <div key={usr.id} className="fq-table-row--editing">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="fq-label fq-label--xs !mb-1">Nome</label>
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="fq-input text-sm py-1.5"
                          />
                        </div>
                        <div>
                          <label className="fq-label fq-label--xs !mb-1">Squad</label>
                          <SquadSelect
                            required
                            className="fq-input text-sm py-1.5"
                            value={editingSquad}
                            onChange={setEditingSquad}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-end gap-2">
                        <div className="flex-1">
                          <label className="fq-label fq-label--xs !mb-1">Função</label>
                          <select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value as UserRole)}
                            className="fq-select text-sm py-1.5"
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-1.5 pb-[2px]">
                          <button
                            onClick={() => handleSaveEdit(usr.id)}
                            className="fq-btn-primary text-sm py-1.5 px-2"
                            title="Confirmar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className="fq-btn-ghost text-sm py-1.5 px-2"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="fq-label fq-label--xs !mb-1">Boards e salas</label>
                        <RoomAccessCheckboxes
                          rooms={rooms}
                          selectedIds={editingRoomIds}
                          onChange={setEditingRoomIds}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={usr.id} className="fq-table-row group">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-100 text-sm truncate">{usr.name}</span>
                        <RoleBadge role={usr.role} />
                      </div>
                      <div className="text-[12px] text-neutral-500 truncate">{usr.email}</div>
                    </div>
                    <div className="text-right text-[12px] text-neutral-400">
                      <div>{usr.squad || "Sem squad"}</div>
                      <div className="mt-0.5 text-neutral-500">
                        {(roomIdsByUser[usr.id] || []).length} board(s)
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={async () => {
                          setEditingUserId(usr.id);
                          setEditingName(usr.name || "");
                          setEditingRole(usr.role || "developer");
                          setEditingSquad(usr.squad || "");
                          try {
                            setEditingRoomIds(roomIdsByUser[usr.id] || (await fetchUserRoomIds(usr.id)));
                          } catch {
                            setEditingRoomIds([]);
                          }
                        }}
                        className="fq-btn-icon !p-1"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(usr.id)}
                        className="fq-btn-icon !p-1 hover:text-red-400 hover:bg-red-500/10"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
