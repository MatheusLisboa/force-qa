import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastKind = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, options?: { kind?: ToastKind; action?: ToastAction; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>((message, options) => {
    const id = crypto.randomUUID();
    const item: ToastItem = {
      id,
      message,
      kind: options?.kind ?? "info",
      action: options?.action,
    };
    setItems((current) => [...current.slice(-4), item]);
    const duration = options?.durationMs ?? (options?.action ? 8000 : 4000);
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fq-toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`fq-toast fq-toast--${item.kind}`}>
            <span className="fq-toast-message">{item.message}</span>
            <div className="fq-toast-actions">
              {item.action && (
                <button
                  type="button"
                  className="fq-toast-action"
                  onClick={async () => {
                    await item.action?.onClick();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button type="button" className="fq-toast-dismiss" onClick={() => dismiss(item.id)} aria-label="Fechar">
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
