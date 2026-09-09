import React, { useEffect, useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { fetchRolePermissionMatrix, saveRolePermissionMatrix } from "../lib/services";
import {
  cloneRoleMatrix,
  PERMISSION_CAPABILITIES,
  PERMISSION_CAPABILITY_META,
  PERMISSION_ROLES,
  type PermissionCapability,
  type RolePermissionMatrix,
} from "../lib/permissions";
import { formatRoleLabel } from "../lib/format";

interface AdminPermissionsPageProps {
  onBack: () => void;
}

export const AdminPermissionsPage: React.FC<AdminPermissionsPageProps> = ({ onBack }) => {
  const { permissionEpoch } = useAuth();
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<RolePermissionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchRolePermissionMatrix()
      .then((loaded) => setMatrix(cloneRoleMatrix(loaded)))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Não foi possível carregar as permissões.")
      )
      .finally(() => setLoading(false));
  }, [permissionEpoch]);

  const toggle = (role: (typeof PERMISSION_ROLES)[number], capability: PermissionCapability) => {
    setMatrix((current) => {
      if (!current) return current;
      const next = cloneRoleMatrix(current);
      next[role][capability] = !next[role][capability];
      return next;
    });
  };

  const handleSave = async () => {
    if (!matrix) return;
    setSaving(true);
    setError("");
    try {
      await saveRolePermissionMatrix(matrix);
      toast("Permissões salvas.", { kind: "success" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
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
            <Shield className="w-3.5 h-3.5" />
            Superadmin
          </p>
          <h1 className="fq-page-title mt-1">Permissões</h1>
          <p className="text-neutral-500 text-sm mt-1 max-w-2xl">
            O que cada perfil pode fazer em todas as orgs. Superadmin sempre atravessa.
            Promover a Admin e a tela Organizações continuam só com superadmin / admin da org.
          </p>
        </div>
        <button type="button" className="fq-btn-primary text-sm" disabled={!matrix || saving} onClick={() => void handleSave()}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>
      )}

      {loading || !matrix ? (
        <p className="text-sm text-neutral-500">Carregando matriz…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/20">
          <table className="min-w-[720px] w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="sticky left-0 bg-[#101118] px-3 py-2.5 font-medium">Ação</th>
                {PERMISSION_ROLES.map((role) => (
                  <th key={role} className="px-2 py-2.5 text-center font-medium">
                    {formatRoleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CAPABILITIES.map((capability) => (
                <tr key={capability} className="border-b border-white/[0.05] last:border-0">
                  <td className="sticky left-0 bg-[#101118] px-3 py-2.5">
                    <p className="text-[13px] font-medium text-neutral-200">
                      {PERMISSION_CAPABILITY_META[capability].label}
                    </p>
                    <p className="text-[11px] text-neutral-500 leading-snug">
                      {PERMISSION_CAPABILITY_META[capability].hint}
                    </p>
                  </td>
                  {PERMISSION_ROLES.map((role) => (
                    <td key={role} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-400"
                        checked={matrix[role][capability]}
                        onChange={() => toggle(role, capability)}
                        aria-label={`${PERMISSION_CAPABILITY_META[capability].label} para ${formatRoleLabel(role)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
