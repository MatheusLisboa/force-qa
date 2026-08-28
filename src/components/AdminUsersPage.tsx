import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Building2, Check, Edit2, Trash2, UserPlus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase, subscribeUsers, toWarRoom } from "../lib/supabase";
import {
  deleteUserProfile,
  fetchMembershipPairs,
  fetchUserRoomIds,
  moveUserToOrganization,
  setUserRoomAccess,
  updateUserProfile,
} from "../lib/services";
import { UserProfile, UserRole, WarRoom } from "../types";
import { RoleBadge } from "./BugBadges";
import { SquadSelect } from "./SquadSelect";
import { useConfirm } from "../context/ConfirmContext";
import { filterManagedUsers, roomsForOrganization } from "../lib/adminUsersView";
import { formatRelativeTime } from "../lib/format";

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

function RoomAccessPicker({
  rooms,
  selectedIds,
  onChange,
}: {
  rooms: WarRoom[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = rooms.filter((room) => selectedIds.includes(room.id));
  const queryNorm = query.trim().toLowerCase();
  const matches = rooms
    .filter((room) => room?.id && !selectedIds.includes(room.id))
    .filter((room) => {
      if (!queryNorm) return false;
      return [room.name, room.project, room.squad].some((value) =>
        (value || "").toLowerCase().includes(queryNorm)
      );
    })
    .slice(0, 8);

  if (!Array.isArray(rooms) || rooms.length === 0) {
    return <p className="text-[13px] text-neutral-500">Nenhum board cadastrado ainda.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
        {selected.length === 0 ? (
          <p className="text-[13px] text-neutral-500">Nenhum board ainda. Busque o nome ou adicione na sala.</p>
        ) : (
          selected.map((room) => (
            <span
              key={room.id}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] pl-2 pr-1 py-0.5 text-[12px] text-neutral-200"
            >
              <span className="truncate max-w-[160px]">{room.name}</span>
              <button
                type="button"
                className="fq-btn-icon !p-0.5 hover:text-red-400"
                onClick={() => onChange(selectedIds.filter((id) => id !== room.id))}
                aria-label={`Remover ${room.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <input
        type="search"
        className="fq-input text-sm"
        placeholder="Buscar sala ou board para adicionar"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {queryNorm && (
        <div className="rounded-md border border-white/[0.06] overflow-hidden">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-neutral-500">Nenhuma sala com esse nome.</p>
          ) : (
            matches.map((room) => (
              <button
                key={room.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-white/[0.05]"
                onClick={() => {
                  onChange([...selectedIds, room.id]);
                  setQuery("");
                }}
              >
                <span className="truncate">{room.name}</span>
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {room.roomType === "board" ? "board" : "sala"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const AdminUsersPage: React.FC<AdminUsersPageProps> = ({ onBack }) => {
  const { adminCreateUser, profile } = useAuth();
  const { confirm } = useConfirm();
  const isSuperadmin = Boolean(profile?.isSuperadmin);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("developer");
  const [newUserSquad, setNewUserSquad] = useState("");
  const [newUserOrganizationId, setNewUserOrganizationId] = useState(profile?.organizationId || "");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreationError, setUserCreationError] = useState("");
  const [userCreationSuccess, setUserCreationSuccess] = useState("");
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingRole, setEditingRole] = useState<UserRole>("developer");
  const [editingSquad, setEditingSquad] = useState("");
  const [editingOrganizationId, setEditingOrganizationId] = useState("");
  const [editingRoomIds, setEditingRoomIds] = useState<string[]>([]);
  const [newUserRoomIds, setNewUserRoomIds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<WarRoom[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [roomIdsByUser, setRoomIdsByUser] = useState<Record<string, string[]>>({});
  const [userQuery, setUserQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [includeGuests, setIncludeGuests] = useState(!isSuperadmin);
  const [migratingUserId, setMigratingUserId] = useState<string | null>(null);
  const [migrateOrgId, setMigrateOrgId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkOrgId, setBulkOrgId] = useState("");
  const [migratingBusy, setMigratingBusy] = useState(false);

  useEffect(() => {
    if (profile?.organizationId && !newUserOrganizationId) {
      setNewUserOrganizationId(profile.organizationId);
    }
  }, [profile?.organizationId, newUserOrganizationId]);

  useEffect(() => {
    const unsubUsers = subscribeUsers(setUsersList);
    let cancelled = false;
    void (async () => {
      const [{ data: roomData, error: roomError }, { data: orgData, error: orgError }] = await Promise.all([
        supabase.from("war_rooms").select("*").order("created_at", { ascending: false }),
        supabase.from("organizations").select("id, name, slug").order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (roomError) {
        console.error("admin users rooms:", roomError);
      } else {
        setRooms((roomData || []).map(toWarRoom));
      }
      if (orgError) {
        console.error("admin users orgs:", orgError);
      } else {
        setOrganizations(
          (orgData || []).map((row) => ({
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
          }))
        );
      }
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

  const orgNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const org of organizations) map[org.id] = org.name;
    return map;
  }, [organizations]);

  const createOrgId = isSuperadmin ? newUserOrganizationId || profile?.organizationId : profile?.organizationId;
  const roomsForCreate = roomsForOrganization(rooms, createOrgId);
  const roomsForEdit = roomsForOrganization(rooms, editingOrganizationId || profile?.organizationId);

  const visibleUsers = filterManagedUsers(usersList, {
    homeOrganizationId: profile?.organizationId,
    isSuperadmin,
    organizationFilter: isSuperadmin ? organizationFilter : "all",
    query: userQuery,
    includeGuests,
    organizationNameById: orgNameById,
  });

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
    if (isSuperadmin && !createOrgId) {
      setUserCreationError("Escolha a organização do usuário.");
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
        newUserSquad.trim(),
        isSuperadmin ? createOrgId : undefined
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

  const handleSaveEdit = async (usr: UserProfile) => {
    if (!editingName.trim()) {
      setUserCreationError("O nome é obrigatório.");
      return;
    }
    if (!isSuperadmin && !editingSquad.trim()) {
      setUserCreationError("Todos os campos de edição são obrigatórios.");
      return;
    }
    const nextOrgId = isSuperadmin ? editingOrganizationId : usr.organizationId;
    if (isSuperadmin && nextOrgId && nextOrgId !== usr.organizationId) {
      const destination = orgNameById[nextOrgId] || "outra organização";
      const ok = await confirm({
        title: "Mover usuário",
        message: `${usr.name || usr.email} vai para ${destination} e perde o acesso às salas da organização atual.`,
        confirmLabel: "Mover",
      });
      if (!ok) return;
    }
    try {
      if (isSuperadmin && nextOrgId && nextOrgId !== usr.organizationId) {
        await moveUserToOrganization(usr.id, nextOrgId);
      }
      await updateUserProfile(usr.id, {
        name: editingName.trim(),
        role: editingRole,
        squad: editingSquad.trim(),
      });
      if (profile?.id) {
        await setUserRoomAccess(usr.id, editingRoomIds, profile.id);
        setRoomIdsByUser((prev) => ({ ...prev, [usr.id]: editingRoomIds }));
      }
      setEditingUserId(null);
      setUserCreationError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao atualizar usuário.";
      setUserCreationError(message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const ok = await confirm({
      title: "Remover usuário",
      message: "O usuário sai do Auth e do ForceQA. A ação é permanente.",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteUserProfile(userId);
      setUserCreationError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao deletar usuário.";
      setUserCreationError(message);
    }
  };

  const handleMigrateUsers = async (userIds: string[], organizationId: string) => {
    const destinationId = organizationId.trim();
    const destination = orgNameById[destinationId];
    if (!destinationId || !destination) {
      setUserCreationError("Escolha a organização de destino.");
      return;
    }
    const targets = usersList.filter(
      (usr) => userIds.includes(usr.id) && usr.organizationId !== destinationId
    );
    if (targets.length === 0) {
      setUserCreationError("Essas pessoas já estão nessa organização.");
      return;
    }
    const names = targets
      .slice(0, 3)
      .map((usr) => usr.name || usr.email)
      .join(", ");
    const extra = targets.length > 3 ? ` e mais ${targets.length - 3}` : "";
    const ok = await confirm({
      title: targets.length === 1 ? "Migrar usuário" : `Migrar ${targets.length} usuários`,
      message: `${names}${extra} ${targets.length === 1 ? "vai" : "vão"} para ${destination} e perde${targets.length === 1 ? "" : "m"} o acesso às salas da organização atual.`,
      confirmLabel: "Migrar",
    });
    if (!ok) return;
    setMigratingBusy(true);
    setUserCreationError("");
    setUserCreationSuccess("");
    try {
      for (const usr of targets) {
        await moveUserToOrganization(usr.id, destinationId);
      }
      setRoomIdsByUser((prev) => {
        const next = { ...prev };
        for (const usr of targets) next[usr.id] = [];
        return next;
      });
      setMigratingUserId(null);
      setSelectedUserIds((prev) => prev.filter((id) => !targets.some((usr) => usr.id === id)));
      setUserCreationSuccess(
        targets.length === 1
          ? `${targets[0].name || targets[0].email} migrado para ${destination}.`
          : `${targets.length} usuários migrados para ${destination}.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao migrar usuário.";
      setUserCreationError(message);
    } finally {
      setMigratingBusy(false);
    }
  };

  const otherOrganizations = (currentOrgId: string) =>
    organizations.filter((org) => org.id !== currentOrgId);

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <button type="button" onClick={onBack} className="fq-btn-ghost text-sm mb-3">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <p className="fq-page-eyebrow flex items-center gap-1.5">
            {isSuperadmin ? (
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <UserPlus className="w-3.5 h-3.5 text-teal-400" />
            )}
            {isSuperadmin ? "Superadmin" : "Admin"}
          </p>
          <h1 className="fq-page-title mt-1">Usuários</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {isSuperadmin
              ? "Todas as organizações, os mais recentes primeiro. Use Migrar para trocar a pessoa de tenant."
              : "Cadastre pessoas. O acesso ao board também pode ser dado em Administrar, na sala."}
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
              {isSuperadmin
                ? "Cria a conta já na organização escolhida."
                : "Cria a conta e o perfil. Busque o board se já souber o acesso."}
            </p>
          </div>

          <form onSubmit={handleAdminCreateUserSubmit} className="space-y-4">
            {isSuperadmin && (
              <div>
                <label className="fq-label fq-label--xs">Organização</label>
                <select
                  className="fq-select"
                  required
                  value={newUserOrganizationId}
                  onChange={(e) => {
                    setNewUserOrganizationId(e.target.value);
                    setNewUserRoomIds([]);
                  }}
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                <label className="fq-label fq-label--xs">Área</label>
                <SquadSelect required className="fq-input" value={newUserSquad} onChange={setNewUserSquad} />
              </div>
            </div>
            <div>
              <label className="fq-label fq-label--xs">Acesso aos boards</label>
              <RoomAccessPicker rooms={roomsForCreate} selectedIds={newUserRoomIds} onChange={setNewUserRoomIds} />
            </div>
            <button type="submit" disabled={isCreatingUser} className="fq-btn-primary w-full">
              {isCreatingUser ? "Cadastrando..." : "Cadastrar usuário"}
            </button>
          </form>
        </div>

        <div className="fq-panel p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">
              Pessoas ({visibleUsers.length})
            </h2>
            <p className="text-neutral-500 text-[13px] mt-0.5">
              {isSuperadmin
                ? "Recentes no topo. Edite para mudar papel, boards ou organização."
                : "Edite a pessoa. Boards: busque pelo nome. Excluir remove também a conta no Auth."}
            </p>
          </div>

          {isSuperadmin && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="fq-select text-sm max-w-xs"
                value={organizationFilter}
                onChange={(e) => setOrganizationFilter(e.target.value)}
              >
                <option value="all">Todas as organizações</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[13px] text-neutral-400">
                <input
                  type="checkbox"
                  checked={includeGuests}
                  onChange={(e) => setIncludeGuests(e.target.checked)}
                />
                Mostrar convidados
              </label>
            </div>
          )}

          {isSuperadmin && selectedUserIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
              <span className="text-[13px] text-neutral-300">
                {selectedUserIds.length} selecionado{selectedUserIds.length === 1 ? "" : "s"}
              </span>
              <select
                className="fq-select text-sm max-w-xs"
                value={bulkOrgId}
                onChange={(e) => setBulkOrgId(e.target.value)}
              >
                <option value="">Organização de destino</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="fq-btn-primary text-xs"
                disabled={migratingBusy || !bulkOrgId}
                onClick={() => void handleMigrateUsers(selectedUserIds, bulkOrgId)}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                {migratingBusy ? "Migrando..." : "Migrar"}
              </button>
              <button
                type="button"
                className="fq-btn-ghost text-xs"
                onClick={() => setSelectedUserIds([])}
              >
                Limpar
              </button>
            </div>
          )}

          <input
            type="search"
            className="fq-input text-sm"
            placeholder={isSuperadmin ? "Buscar por nome, e-mail, área ou papel" : "Buscar por nome, e-mail ou área"}
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
          />

          <div className="space-y-2">
            {visibleUsers.length === 0 ? (
              <div className="fq-empty-state py-10">
                <span className="text-sm text-neutral-500">
                  {usersList.length === 0 ? "Carregando usuários..." : "Ninguém corresponde à busca."}
                </span>
              </div>
            ) : (
              visibleUsers.map((usr) => {
                const isEditing = editingUserId === usr.id;
                const isMigrating = migratingUserId === usr.id;
                if (isMigrating) {
                  const destinations = otherOrganizations(usr.organizationId);
                  return (
                    <div key={usr.id} className="fq-table-row--editing">
                      <p className="text-sm text-neutral-200">
                        Migrar <span className="font-semibold">{usr.name || usr.email}</span> de{" "}
                        {orgNameById[usr.organizationId] || "organização atual"}
                      </p>
                      {destinations.length === 0 ? (
                        <p className="text-[13px] text-neutral-500">Não há outra organização para receber esta pessoa.</p>
                      ) : (
                        <select
                          className="fq-select text-sm"
                          value={migrateOrgId}
                          onChange={(e) => setMigrateOrgId(e.target.value)}
                        >
                          {destinations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="fq-btn-ghost text-sm py-1.5 px-2"
                          onClick={() => setMigratingUserId(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="fq-btn-primary text-sm py-1.5 px-2"
                          disabled={migratingBusy || destinations.length === 0}
                          onClick={() => void handleMigrateUsers([usr.id], migrateOrgId)}
                        >
                          {migratingBusy ? "Migrando..." : "Migrar"}
                        </button>
                      </div>
                    </div>
                  );
                }
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
                          <label className="fq-label fq-label--xs !mb-1">Área</label>
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
                            onClick={() => void handleSaveEdit(usr)}
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
                      {isSuperadmin && (
                        <div>
                          <label className="fq-label fq-label--xs !mb-1">Organização</label>
                          <select
                            className="fq-select text-sm py-1.5"
                            value={editingOrganizationId}
                            onChange={(e) => {
                              setEditingOrganizationId(e.target.value);
                              setEditingRoomIds([]);
                            }}
                          >
                            {organizations.map((org) => (
                              <option key={org.id} value={org.id}>
                                {org.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="fq-label fq-label--xs !mb-1">Boards e salas</label>
                        <RoomAccessPicker
                          rooms={roomsForEdit}
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
                        <span className="font-semibold text-neutral-100 text-sm truncate">{usr.name || "Sem nome"}</span>
                        <RoleBadge role={usr.role} />
                        {usr.isGuest && (
                          <span className="text-[10px] uppercase tracking-wide text-neutral-500">Convidado</span>
                        )}
                        {usr.isSuperadmin && (
                          <span className="text-[10px] uppercase tracking-wide text-teal-400">Superadmin</span>
                        )}
                      </div>
                      <div className="text-[12px] text-neutral-500 truncate">{usr.email}</div>
                      {isSuperadmin && (
                        <div className="text-[12px] text-neutral-400 truncate">
                          {orgNameById[usr.organizationId] || usr.organizationId}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-[12px] text-neutral-400">
                      <div>{usr.squad || "Sem área"}</div>
                      <div className="mt-0.5 text-neutral-500">
                        {(roomIdsByUser[usr.id] || []).length} board(s)
                      </div>
                      <div className="mt-0.5 text-neutral-500">{formatRelativeTime(usr.createdAt)}</div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {isSuperadmin && (
                        <input
                          type="checkbox"
                          className="mr-1"
                          checked={selectedUserIds.includes(usr.id)}
                          onChange={(e) => {
                            setSelectedUserIds((prev) =>
                              e.target.checked ? [...prev, usr.id] : prev.filter((id) => id !== usr.id)
                            );
                          }}
                          aria-label={`Selecionar ${usr.name || usr.email}`}
                        />
                      )}
                      {isSuperadmin && (
                        <button
                          onClick={() => {
                            setEditingUserId(null);
                            const destinations = otherOrganizations(usr.organizationId);
                            setMigratingUserId(usr.id);
                            setMigrateOrgId(destinations[0]?.id || "");
                          }}
                          className="fq-btn-icon !p-1"
                          title="Migrar de organização"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          setMigratingUserId(null);
                          setEditingUserId(usr.id);
                          setEditingName(usr.name || "");
                          setEditingRole(usr.role || "developer");
                          setEditingSquad(usr.squad || "");
                          setEditingOrganizationId(usr.organizationId);
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
