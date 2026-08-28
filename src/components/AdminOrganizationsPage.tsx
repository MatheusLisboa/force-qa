import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Building2, Check, Plus, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  createOrganizationAdmin,
  createOrganizationWithAdmin,
  fetchOrganizationOverviews,
  renameOrganization,
} from "../lib/services";
import { DEFAULT_ORGANIZATION_ID, slugifyOrganizationName } from "../lib/organizations";
import { OrganizationOverview } from "../types";

interface AdminOrganizationsPageProps {
  onBack: () => void;
}

export const AdminOrganizationsPage: React.FC<AdminOrganizationsPageProps> = ({ onBack }) => {
  const { profile } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addingAdminId, setAddingAdminId] = useState<string | null>(null);
  const [extraAdminName, setExtraAdminName] = useState("");
  const [extraAdminEmail, setExtraAdminEmail] = useState("");
  const [extraAdminPassword, setExtraAdminPassword] = useState("");
  const [savingExtra, setSavingExtra] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrgs(await fetchOrganizationOverviews());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as organizações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const derivedSlug = slugTouched ? slug : slugifyOrganizationName(name);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (adminPassword.length < 6) {
      setError("A senha do admin deve ter no mínimo 6 caracteres.");
      return;
    }
    setCreating(true);
    try {
      const result = await createOrganizationWithAdmin({
        name: name.trim(),
        slug: derivedSlug,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
      });
      setSuccess(`Organização criada. O admin entra com ${adminEmail.trim()} (slug ${result.slug}).`);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar organização.");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (organizationId: string) => {
    setError("");
    try {
      await renameOrganization(organizationId, editingName);
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao renomear.");
    }
  };

  const handleAddAdmin = async (e: React.FormEvent, organizationId: string) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (extraAdminPassword.length < 6) {
      setError("A senha do admin deve ter no mínimo 6 caracteres.");
      return;
    }
    setSavingExtra(true);
    try {
      await createOrganizationAdmin({
        organizationId,
        name: extraAdminName.trim(),
        email: extraAdminEmail.trim(),
        password: extraAdminPassword,
      });
      setSuccess(`Admin ${extraAdminEmail.trim()} criado.`);
      setAddingAdminId(null);
      setExtraAdminName("");
      setExtraAdminEmail("");
      setExtraAdminPassword("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar admin.");
    } finally {
      setSavingExtra(false);
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
            <Building2 className="w-3.5 h-3.5 text-teal-400" /> Superadmin
          </p>
          <h1 className="fq-page-title mt-1">Organizações</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Cada empresa vê só os próprios boards e usuários. O primeiro admin entra com o e-mail que você cadastrar.
          </p>
        </div>
      </div>

      {error && <div className="fq-alert-error text-sm">{error}</div>}
      {success && <div className="fq-alert-success text-sm">{success}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-8">
        <div className="fq-panel p-5 space-y-4 h-fit">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">Nova organização</h2>
            <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
              Cria o tenant e a conta do admin. Sem cadastro público: o resto entra por Usuários ou convite.
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="fq-label fq-label--xs">Nome da empresa</label>
              <input
                required
                type="text"
                className="fq-input"
                placeholder="Ex: Acme QA"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">Slug</label>
              <input
                required
                type="text"
                className="fq-input font-mono text-xs"
                placeholder="acme-qa"
                value={derivedSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">Nome do admin</label>
              <input
                required
                type="text"
                className="fq-input"
                placeholder="Ex: Ana Silva"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">E-mail do admin</label>
              <input
                required
                type="email"
                className="fq-input"
                placeholder="ana@acme.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">Senha inicial (mínimo 6 caracteres)</label>
              <input
                required
                type="password"
                minLength={6}
                className="fq-input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <button type="submit" disabled={creating} className="fq-btn-primary w-full">
              {creating ? "Criando..." : "Criar organização"}
            </button>
          </form>
        </div>

        <div className="fq-panel p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">
              Empresas ({orgs.length})
            </h2>
            <p className="text-neutral-500 text-[13px] mt-0.5">
              Seu painel continua na org da casa. O admin de cada empresa gerencia o restante.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-500 py-8">Carregando organizações...</p>
          ) : orgs.length === 0 ? (
            <div className="fq-empty-state py-10">
              <span className="text-sm text-neutral-500">Nenhuma organização encontrada.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {orgs.map((org) => {
                const isHome = org.id === profile?.organizationId;
                const isDefault = org.id === DEFAULT_ORGANIZATION_ID;
                const isEditing = editingId === org.id;
                const isAdding = addingAdminId === org.id;
                return (
                  <div key={org.id} className="fq-table-row--editing">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              className="fq-input text-sm py-1.5"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                            />
                            <button
                              type="button"
                              className="fq-btn-primary text-sm py-1.5 px-2"
                              onClick={() => void handleRename(org.id)}
                              title="Confirmar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="fq-btn-ghost text-sm py-1.5 px-2"
                              onClick={() => setEditingId(null)}
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-neutral-100 text-sm truncate">{org.name}</span>
                            {isHome && (
                              <span className="text-[10px] uppercase tracking-wide text-teal-300">sua org</span>
                            )}
                            {isDefault && !isHome && (
                              <span className="text-[10px] uppercase tracking-wide text-neutral-500">padrão</span>
                            )}
                          </div>
                        )}
                        <div className="text-[12px] text-neutral-500 font-mono">{org.slug}</div>
                      </div>
                      {!isEditing && (
                        <button
                          type="button"
                          className="fq-btn-ghost text-xs"
                          onClick={() => {
                            setEditingId(org.id);
                            setEditingName(org.name);
                          }}
                        >
                          Renomear
                        </button>
                      )}
                    </div>
                    <div className="text-[12px] text-neutral-400">
                      {org.userCount} pessoa(s) · {org.roomCount} board(s)
                    </div>
                    <div className="text-[12px] text-neutral-500 space-y-0.5">
                      {org.admins.length === 0 ? (
                        <p>Nenhum admin ainda.</p>
                      ) : (
                        org.admins.map((admin) => (
                          <p key={admin.id} className="truncate">
                            {admin.name} · {admin.email}
                          </p>
                        ))
                      )}
                    </div>
                    {isAdding ? (
                      <form className="space-y-2 pt-1" onSubmit={(e) => void handleAddAdmin(e, org.id)}>
                        <input
                          required
                          className="fq-input text-sm"
                          placeholder="Nome do admin"
                          value={extraAdminName}
                          onChange={(e) => setExtraAdminName(e.target.value)}
                        />
                        <input
                          required
                          type="email"
                          className="fq-input text-sm"
                          placeholder="E-mail"
                          value={extraAdminEmail}
                          onChange={(e) => setExtraAdminEmail(e.target.value)}
                        />
                        <input
                          required
                          type="password"
                          minLength={6}
                          className="fq-input text-sm"
                          placeholder="Senha inicial"
                          value={extraAdminPassword}
                          onChange={(e) => setExtraAdminPassword(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button type="submit" disabled={savingExtra} className="fq-btn-primary text-sm">
                            {savingExtra ? "Salvando..." : "Cadastrar admin"}
                          </button>
                          <button
                            type="button"
                            className="fq-btn-ghost text-sm"
                            onClick={() => setAddingAdminId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="fq-btn-ghost text-sm w-fit"
                        onClick={() => {
                          setAddingAdminId(org.id);
                          setExtraAdminName("");
                          setExtraAdminEmail("");
                          setExtraAdminPassword("");
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar admin
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
