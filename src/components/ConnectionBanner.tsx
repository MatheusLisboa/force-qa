import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { subscribeConnection } from "../lib/supabase";
import type { ConnectionState } from "../lib/connection";

/** Faixa discreta que avisa quando a conexão cai ou está reconectando. */
export const ConnectionBanner: React.FC = () => {
  const [state, setState] = useState<ConnectionState>("online");
  useEffect(() => subscribeConnection(setState), []);

  if (state === "online") return null;
  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b px-3 py-1.5 text-[12px]"
      style={{
        background: offline ? "var(--color-fq-danger-muted)" : "var(--color-fq-accent-muted)",
        borderColor: "var(--color-fq-border)",
        color: "var(--color-fq-text-primary)",
      }}
    >
      {offline ? <WifiOff className="h-3.5 w-3.5" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {offline
        ? "Você está offline. Alterações só serão salvas quando a conexão voltar."
        : "Reconectando ao tempo real… os cards serão atualizados em seguida."}
    </div>
  );
};
