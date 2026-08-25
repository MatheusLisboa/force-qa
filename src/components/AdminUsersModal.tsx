import React, { useEffect, useRef, useState } from "react";
import { Check, Edit2, Trash2, UserPlus, X } from "lucide-react";
import { motion } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y";
import { useAuth } from "../context/AuthContext";
import { subscribeUsers } from "../lib/supabase";
import { deleteUserProfile, updateUserProfile } from "../lib/services";
import { UserProfile, UserRole } from "../types";
import { RoleBadge } from "./BugBadges";
import { SquadSelect } from "./SquadSelect";

interface AdminUsersModalProps {
  open: boolean;
  onClose: () => void;
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

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({ open, onClose }) => {
  const { adminCreateUser } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

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

  useEffect(() => {
    if (!open) return;
    return subscribeUsers(setUsersList);
  }, [open]);

  if (!open) return null;

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
      await adminCreateUser(
        newUserName.trim(),
        newUserEmail.trim(),
        newUserPassword,
        newUserRole,
        newUserSquad.trim()
      );
      setUserCreationSuccess(`Usuário ${newUserName.trim()} cadastrado com sucesso.`);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserSquad("");
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
    <div className="fq-modal-overlay">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-modal-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fq-modal fq-modal--lg max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="fq-modal-header">
          <h3 id="admin-users-modal-title" className="fq-modal-title">
            <UserPlus className="w-5 h-5 text-neutral-400" /> Usuários
          </h3>
          <button onClick={onClose} className="fq-btn-ghost text-xs font-mono font-bold" aria-label="Fechar">
            FECHAR (ESC)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-neutral-500">
          <div className="space-y-4">
            <div className="border-b border-white/[0.03] pb-2">
              <h4 className="font-mono text-xs font-bold uppercase text-indigo-400 tracking-wider">
                Novo usuário
              </h4>
              <p className="text-neutral-500 text-[11px] mt-0.5 leading-relaxed">
                Cria a conta no Auth e o perfil no ForceQA.
              </p>
            </div>

            {userCreationError && <div className="fq-alert-error text-xs font-mono">{userCreationError}</div>}
            {userCreationSuccess && (
              <div className="fq-alert-success text-xs font-mono">{userCreationSuccess}</div>
            )}

            <form onSubmit={handleAdminCreateUserSubmit} className="space-y-4">
              <div>
                <label className="fq-label fq-label--xs">Nome completo</label>
                <input
                  required
                  type="text"
                  className="fq-input text-xs font-mono"
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
                  className="fq-input text-xs font-mono"
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
                  className="fq-input text-xs font-mono"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="fq-label fq-label--xs">Função</label>
                  <select
                    className="fq-select text-xs font-mono"
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
                  <SquadSelect
                    required
                    className="fq-input text-xs font-mono"
                    value={newUserSquad}
                    onChange={setNewUserSquad}
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="fq-btn-primary w-full text-xs font-bold uppercase font-mono tracking-wider"
                >
                  {isCreatingUser ? "Cadastrando..." : "Cadastrar usuário"}
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4 flex flex-col justify-start">
            <div className="border-b border-white/[0.03] pb-2">
              <h4 className="font-mono text-xs font-bold uppercase text-neutral-500 tracking-wider">
                Usuários ({usersList.length})
              </h4>
              <p className="text-neutral-500 text-[11px] mt-0.5 leading-relaxed">
                Perfis cadastrados. Excluir remove também a conta no Auth.
              </p>
            </div>

            <div className="overflow-y-auto pr-1 max-h-[350px]">
              {usersList.length === 0 ? (
                <div className="fq-empty-state py-10">
                  <span className="text-xs text-neutral-500 font-mono">Carregando usuários...</span>
                </div>
              ) : (
                <>
                  <div className="fq-table-header mb-2">
                    <span>Usuário</span>
                    <span>Squad</span>
                    <span className="text-right">Ações</span>
                  </div>
                  <div className="space-y-2">
                    {usersList.map((usr) => {
                      const isEditing = editingUserId === usr.id;
                      if (isEditing) {
                        return (
                          <div key={usr.id} className="fq-table-row--editing font-mono">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="fq-label fq-label--xs !text-[9px] !mb-1">Nome</label>
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="fq-input text-xs py-1.5"
                                />
                              </div>
                              <div>
                                <label className="fq-label fq-label--xs !text-[9px] !mb-1">Squad</label>
                                <SquadSelect
                                  required
                                  className="fq-input text-xs py-1.5"
                                  value={editingSquad}
                                  onChange={setEditingSquad}
                                />
                              </div>
                            </div>
                            <div className="flex justify-between items-end gap-2">
                              <div className="flex-1">
                                <label className="fq-label fq-label--xs !text-[9px] !mb-1">Função</label>
                                <select
                                  value={editingRole}
                                  onChange={(e) => setEditingRole(e.target.value as UserRole)}
                                  className="fq-select text-xs py-1.5"
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
                                  className="fq-btn-primary text-xs py-1.5 px-2"
                                  title="Confirmar"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingUserId(null)}
                                  className="fq-btn-ghost text-xs py-1.5 px-2"
                                  title="Cancelar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={usr.id} className="fq-table-row group">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-neutral-100 text-xs truncate">{usr.name}</span>
                              <RoleBadge role={usr.role} />
                            </div>
                            <div className="text-[10px] font-mono text-neutral-500 leading-none truncate">
                              {usr.email}
                            </div>
                          </div>
                          <div className="text-right font-mono text-[9px] uppercase text-neutral-400 fq-badge bg-white/[0.03] border-white/[0.06] py-0.5 px-2">
                            {usr.squad || "Sem Squad"}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingUserId(usr.id);
                                setEditingName(usr.name || "");
                                setEditingRole(usr.role || "developer");
                                setEditingSquad(usr.squad || "");
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
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
