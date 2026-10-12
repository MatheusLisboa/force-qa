import React, { useEffect, useState } from "react";
import { ArrowLeft, Copy, KeyRound, Lock, Webhook } from "lucide-react";
import {
  fetchAccessibleRooms,
  fetchOrgExportTokenMeta,
  fetchOrgWebhookUrl,
  revokeOrgExportToken,
  rotateOrgExportToken,
  saveOrgWebhookUrl,
  setOrgExportScope,
} from "../lib/services";
import { useAuth } from "../context/AuthContext";
import { canManageUsers } from "../lib/permissions";
import { describeExportScope } from "../lib/exportScope";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";

interface AdminIntegrationsPageProps {
  onBack: () => void;
}

export const AdminIntegrationsPage: React.FC<AdminIntegrationsPageProps> = ({ onBack }) => {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { profile } = useAuth();
  // O token lê todos os cards fora do login: só admin gerencia (o servidor também exige).
  const canManageToken = canManageUsers(profile?.role, profile?.isSuperadmin, profile?.isGuest);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [scopeMode, setScopeMode] = useState<"all" | "rooms">("all");
  const [scopeRoomIds, setScopeRoomIds] = useState<string[]>([]);
  const [savedScope, setSavedScope] = useState<string[] | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [error, setError] = useState("");
  const [tokenPrefix, setTokenPrefix] = useState<string | null>(null);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(null);
  const [plaintextToken, setPlaintextToken] = useState<string | null>(null);

  useEffect(() => {
    setError("");
    setPlaintextToken(null);
    setLoading(true);
    // O webhook carrega para quem tem "integrações"; o token só para admin (senão a API responde 403).
    Promise.all([
      fetchOrgWebhookUrl(),
      canManageToken ? fetchOrgExportTokenMeta() : Promise.resolve(null),
      canManageToken ? fetchAccessibleRooms() : Promise.resolve([]),
    ])
      .then(([webhookUrl, meta, accessibleRooms]) => {
        setUrl(webhookUrl);
        setRooms(accessibleRooms.map((room) => ({ id: room.id, name: room.name })));
        if (meta) {
          setTokenPrefix(meta.prefix);
          setTokenCreatedAt(meta.createdAt);
          setSavedScope(meta.roomIds);
          setScopeMode(meta.roomIds === null ? "all" : "rooms");
          setScopeRoomIds(meta.roomIds ?? []);
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
  }, [canManageToken]);

  const selectedScope: string[] | null = scopeMode === "all" ? null : scopeRoomIds;
  const roomNames = Object.fromEntries(rooms.map((room) => [room.id, room.name]));
  const scopeChanged = JSON.stringify(selectedScope) !== JSON.stringify(savedScope);
  const toggleScopeRoom = (id: string) =>
    setScopeRoomIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const handleSaveScope = async () => {
    setTokenBusy(true);
    setError("");
    try {
      await setOrgExportScope(selectedScope);
      setSavedScope(selectedScope);
      toast("Salas do token atualizadas.", { kind: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar as salas.");
    } finally {
      setTokenBusy(false);
    }
  };

  const origin = window.location.origin.replace(/\/$/, "");

  const handleSaveWebhook = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveOrgWebhookUrl(url.trim());
      toast("Webhook salvo.", { kind: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    const ok = await confirm({
      title: tokenPrefix ? "Trocar token" : "Gerar token",
      message: tokenPrefix
        ? "O token atual para de funcionar na hora. O GitLab precisa receber o novo."
        : "Gera uma chave de leitura desta org. Guarde — o valor completo só aparece agora.",
      confirmLabel: tokenPrefix ? "Trocar token" : "Gerar token",
      danger: Boolean(tokenPrefix),
    });
    if (!ok) return;
    setTokenBusy(true);
    setError("");
    try {
      const rotated = await rotateOrgExportToken(selectedScope);
      setPlaintextToken(rotated.token);
      setSavedScope(rotated.roomIds);
      setTokenPrefix(rotated.prefix);
      setTokenCreatedAt(new Date().toISOString());
      toast("Token gerado. Copie agora.", { kind: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o token.");
    } finally {
      setTokenBusy(false);
    }
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: "Revogar token",
      message: "Quem usa essa chave deixa de ler o board até você gerar outra.",
      confirmLabel: "Revogar",
      danger: true,
    });
    if (!ok) return;
    setTokenBusy(true);
    setError("");
    try {
      await revokeOrgExportToken();
      setPlaintextToken(null);
      setTokenPrefix(null);
      setTokenCreatedAt(null);
      toast("Token revogado.", { kind: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível revogar.");
    } finally {
      setTokenBusy(false);
    }
  };

  const copyToken = async () => {
    if (!plaintextToken) return;
    await navigator.clipboard.writeText(plaintextToken);
    toast("Token copiado.", { kind: "success" });
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
            <Webhook className="w-3.5 h-3.5 text-teal-400" />
            Org
          </p>
          <h1 className="fq-page-title mt-1">Integrações</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Webhook Slack/Discord (quem tem a permissão de integrações) e token para o GitLab puxar os cards (só admin).
          </p>
        </div>
      </div>

      {error && <div className="fq-alert-error text-sm">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-5xl">
        <form onSubmit={handleSaveWebhook} className="fq-panel p-5 space-y-4 h-fit">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">Webhook Slack / Discord</h2>
            <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
              Dispara quando um card vira blocker ou entra em Pronto para QA. Só aceita webhook https do Slack ou Discord.
            </p>
          </div>
          <input
            type="url"
            className="fq-input"
            placeholder="https://hooks.slack.com/... ou https://discord.com/api/webhooks/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <p className="text-[12px] text-neutral-500">Deixe em branco para desativar.</p>
          <button type="submit" className="fq-btn-primary text-sm" disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar webhook"}
          </button>
        </form>

        {!canManageToken ? (
          <div className="fq-panel p-5 space-y-2 h-fit" data-testid="export-token-locked">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-400">
                <Lock className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-100">API de extração</h2>
                <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
                  O token lê os cards da organização fora do login e das salas. Por isso só um <strong>admin</strong> gera, troca ou revoga.
                  Peça a um admin se precisar de uma chave para o GitLab.
                </p>
              </div>
            </div>
          </div>
        ) : (
        <div className="fq-panel p-5 space-y-4 h-fit">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-400/10 text-teal-300">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-100">API de extração</h2>
              <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
                Token da org para o GitLab puxar salas e cards. Só leitura. O valor completo aparece uma vez.
              </p>
            </div>
          </div>

          {tokenPrefix ? (
            <p className="text-[13px] text-neutral-400">
              Ativo: <span className="font-mono text-neutral-200">{tokenPrefix}…</span>
              {tokenCreatedAt ? ` · ${new Date(tokenCreatedAt).toLocaleDateString("pt-BR")}` : ""}
            </p>
          ) : (
            <p className="text-[13px] text-neutral-500">Nenhum token ainda.</p>
          )}

          {plaintextToken && (
            <div className="space-y-1.5">
              <label className="fq-label fq-label--xs" htmlFor="export-token-once">
                Copie agora — não mostramos de novo
              </label>
              <div className="flex gap-2">
                <input
                  id="export-token-once"
                  readOnly
                  className="fq-input font-mono !text-[12px]"
                  value={plaintextToken}
                />
                <button type="button" className="fq-btn-secondary shrink-0" onClick={() => void copyToken()}>
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
              </div>
            </div>
          )}

          <fieldset className="space-y-2" data-testid="export-scope">
            <legend className="fq-label fq-label--xs">Quais salas o token enxerga</legend>
            <label className="flex items-center gap-2 text-[13px] text-neutral-300">
              <input type="radio" name="export-scope" checked={scopeMode === "all"} onChange={() => setScopeMode("all")} />
              Todas as salas da organização
            </label>
            <label className="flex items-center gap-2 text-[13px] text-neutral-300">
              <input type="radio" name="export-scope" checked={scopeMode === "rooms"} onChange={() => setScopeMode("rooms")} />
              Somente as salas escolhidas
            </label>
            {scopeMode === "rooms" && (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/[0.08] p-2">
                {rooms.length === 0 ? (
                  <p className="text-[12px] text-neutral-500">Nenhuma sala encontrada.</p>
                ) : (
                  rooms.map((room) => (
                    <label key={room.id} className="flex items-center gap-2 text-[12px] text-neutral-300">
                      <input type="checkbox" checked={scopeRoomIds.includes(room.id)} onChange={() => toggleScopeRoom(room.id)} />
                      {room.name}
                    </label>
                  ))
                )}
              </div>
            )}
            {scopeMode === "rooms" && scopeRoomIds.length === 0 && (
              <p className="text-[12px] text-amber-400">Sem nenhuma sala marcada, o token não enxerga nada.</p>
            )}
            {tokenPrefix && (
              <p className="text-[12px] text-neutral-500" data-testid="export-scope-current">
                Escopo atual: {describeExportScope(savedScope, roomNames)}
              </p>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            {tokenPrefix && scopeChanged && (
              <button type="button" className="fq-btn-primary text-sm" disabled={loading || tokenBusy} onClick={() => void handleSaveScope()}>
                Salvar salas
              </button>
            )}
            <button
              type="button"
              className="fq-btn-secondary text-sm"
              disabled={loading || tokenBusy}
              onClick={() => void handleRotate()}
            >
              {tokenBusy ? "Gerando..." : tokenPrefix ? "Trocar token" : "Gerar token"}
            </button>
            {tokenPrefix && (
              <button
                type="button"
                className="fq-btn-ghost text-sm text-red-400"
                disabled={loading || tokenBusy}
                onClick={() => void handleRevoke()}
              >
                Revogar
              </button>
            )}
          </div>

          <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[color:var(--color-fq-elevated)] p-3 text-[11px] leading-relaxed text-neutral-400">
{`curl -s "${origin}/api/export/rooms" \\
  -H "Authorization: Bearer fqex_…"

curl -s "${origin}/api/export/cards?roomId=ID_DA_SALA" \\
  -H "Authorization: Bearer fqex_…"`}
          </pre>
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Cada card traz `attachments` com URL do print. Link do Storage expira em 24h — baixe no mesmo job.
          </p>
        </div>
        )}
      </div>
    </div>
  );
};
