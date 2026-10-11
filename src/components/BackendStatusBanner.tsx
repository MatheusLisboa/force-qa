import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { checkBackendHealth, type BackendHealth } from "../lib/health";

/** Na tela de login: avisa quando o servidor não responde (projeto pausado, rede, deploy sem variáveis). */
export const BackendStatusBanner: React.FC = () => {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setHealth(
      await checkBackendHealth({
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      })
    );
    setChecking(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // "misconfigured" já tem aviso próprio na tela de login.
  if (!health || health.status === "ok" || health.status === "misconfigured") return null;

  const text =
    "Não conseguimos falar com o servidor. Verifique sua conexão (bloqueadores e VPN também contam). Se estiver tudo certo, o projeto pode estar pausado: avise um administrador.";

  return (
    <div role="alert" className="fq-alert-error mb-4 flex items-start gap-2 text-[12px]" data-testid="backend-status">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
      <button type="button" className="fq-btn-ghost !min-h-0 !px-2 !py-1" onClick={() => void check()} disabled={checking}>
        <RotateCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} aria-hidden />
        Tentar de novo
      </button>
    </div>
  );
};
