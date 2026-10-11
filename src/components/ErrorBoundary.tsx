import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { logger } from "../lib/logger";

interface State {
  error: Error | null;
}

/** Evita a tela preta quando um componente quebra: mostra recuperação e registra o erro. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("ErrorBoundary", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Deploy novo apaga chunks antigos: o erro típico é falha ao importar módulo dinâmico.
    const staleChunk = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(this.state.error.message);
    return (
      <div className="fq-loading" role="alert">
        <div className="fq-auth-card max-w-md text-center">
          <span className="fq-empty-icon mx-auto mb-3" aria-hidden>
            <AlertTriangle className="h-4 w-4" />
          </span>
          <h1 className="font-display text-lg font-semibold text-white">
            {staleChunk ? "Há uma versão nova do ForceQA" : "Algo deu errado"}
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            {staleChunk
              ? "Recarregue a página para carregar a versão mais recente."
              : "O erro foi registrado. Recarregue a página; se persistir, avise o time."}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="fq-btn-primary" onClick={() => window.location.reload()}>
              <RotateCw className="h-3.5 w-3.5" /> Recarregar
            </button>
            {!staleChunk && (
              <button type="button" className="fq-btn-secondary" onClick={() => this.setState({ error: null })}>
                Tentar de novo
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
