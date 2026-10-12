import React, { useEffect, useState } from "react";
import { ArrowLeft, Lock, RotateCcw, Shield } from "lucide-react";
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
import { describeMatrixChange, diffMatrix, groupEquivalentRoles, summarizeRole } from "../lib/roleSummary";

interface AdminPermissionsPageProps {
  onBack: () => void;
}

export const AdminPermissionsPage: React.FC<AdminPermissionsPageProps> = ({ onBack }) => {
  const { permissionEpoch } = useAuth();
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<RolePermissionMatrix | null>(null);
  const [savedMatrix, setSavedMatrix] = useState<RolePermissionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchRolePermissionMatrix()
      .then((loaded) => {
        setMatrix(cloneRoleMatrix(loaded));
        setSavedMatrix(cloneRoleMatrix(loaded));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Não foi possível carregar as permissões.")
      )
      .finally(() => setLoading(false));
  }, [permissionEpoch]);

  const changes = matrix && savedMatrix ? diffMatrix(savedMatrix, matrix) : [];
  const equivalentGroups = matrix ? groupEquivalentRoles(matrix) : [];

  const toggle = (role: (typeof PERMISSION_ROLES)[number], capability: PermissionCapability) => {
    // O admin sempre tem tudo (o banco também recusa): evita travar a administração das organizações.
    if (role === "admin") return;
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
      setSavedMatrix(cloneRoleMatrix(matrix));
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
        <div className="flex items-center gap-2">
          {changes.length > 0 && (
            <button type="button" className="fq-btn-ghost text-sm" onClick={() => savedMatrix && setMatrix(cloneRoleMatrix(savedMatrix))}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Descartar
            </button>
          )}
          <button type="button" className="fq-btn-primary text-sm" disabled={!matrix || saving || changes.length === 0} onClick={() => void handleSave()}>
            {saving ? "Salvando..." : changes.length ? `Salvar (${changes.length})` : "Salvar"}
          </button>
        </div>
      </div>

      {changes.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" data-testid="pending-changes" aria-live="polite">
          <p className="text-[13px] font-medium text-amber-300">
            {changes.length} {changes.length === 1 ? "alteração" : "alterações"} ainda não salva{changes.length === 1 ? "" : "s"}. Vale para todas as organizações assim que você salvar.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] text-amber-200/90">
            {changes.map((change) => (
              <li key={`${change.role}-${change.capability}`}>{describeMatrixChange(change)}</li>
            ))}
          </ul>
        </section>
      )}

      {equivalentGroups.length > 0 && (
        <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-neutral-400" data-testid="equivalent-roles">
          Hoje estes papéis têm <strong className="text-neutral-200">exatamente as mesmas permissões</strong>:{" "}
          {equivalentGroups.map((group) => group.map(formatRoleLabel).join(" = ")).join("; ")}. O cargo serve só de rótulo.
          Se quiser que um deles faça algo diferente, ajuste a coluna dele abaixo.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p>
      )}

      {loading || !matrix ? (
        <p className="text-sm text-neutral-500">Carregando matriz…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[color:var(--color-fq-surface)]">
          <table className="min-w-[720px] w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="sticky left-0 bg-[color:var(--color-fq-surface)] px-3 py-2.5 font-medium">Ação</th>
                {PERMISSION_ROLES.map((role) => (
                  <th key={role} className="px-2 py-2.5 text-center font-medium">
                    <span className="inline-flex items-center gap-1">
                      {role === "admin" && <Lock className="h-3 w-3" aria-hidden />}
                      {formatRoleLabel(role)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CAPABILITIES.map((capability) => (
                <tr key={capability} className="border-b border-white/[0.05] last:border-0">
                  <td className="sticky left-0 bg-[color:var(--color-fq-surface)] px-3 py-2.5">
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
                        disabled={role === "admin"}
                        title={role === "admin" ? "O admin sempre tem todas as permissões" : undefined}
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

      {matrix && (
        <section aria-label="O que cada papel pode fazer" className="space-y-3">
          <h2 className="fq-section-title">O que cada papel pode fazer</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PERMISSION_ROLES.map((role) => {
              const summary = summarizeRole(matrix, role);
              return (
                <article key={role} className="fq-panel space-y-2" data-testid={`role-summary-${role}`}>
                  <h3 className="text-[13px] font-semibold text-neutral-100">{formatRoleLabel(role)}</h3>
                  <p className="text-[12px] leading-relaxed text-neutral-300">
                    <span className="text-emerald-400">Pode:</span> {summary.can.length ? summary.can.join(", ") : "apenas ler e comentar"}
                  </p>
                  {summary.cannot.length > 0 && (
                    <p className="text-[12px] leading-relaxed text-neutral-500">
                      <span className="text-neutral-400">Não pode:</span> {summary.cannot.join(", ")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <p className="text-[12px] leading-relaxed text-neutral-500">
            Convidados nunca usam IA, nem criam salas, convidam, gerenciam usuários, visões ou integrações, qualquer que seja a matriz.
            Quando e se podem criar cards é decidido por sala.
          </p>
        </section>
      )}
    </div>
  );
};
