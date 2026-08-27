import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useModalA11y } from "../hooks/useModalA11y";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((current) => {
        current?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  useModalA11y(!!pending, () => close(false), dialogRef);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div className="fq-confirm-overlay" onClick={() => close(false)}>
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fq-confirm-title"
            aria-describedby="fq-confirm-message"
            tabIndex={-1}
            className="fq-modal fq-modal--sm"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="fq-confirm-title" className="fq-modal-title !mb-2">
              {pending.title}
            </h2>
            <p id="fq-confirm-message" className="text-sm text-neutral-400 leading-relaxed">
              {pending.message}
            </p>
            <div className="fq-modal-footer !pt-5">
              <button type="button" className="fq-btn-ghost text-xs" onClick={() => close(false)}>
                {pending.cancelLabel || "Cancelar"}
              </button>
              <button
                type="button"
                className={pending.danger ? "fq-btn-danger text-xs" : "fq-btn-primary text-xs"}
                onClick={() => close(true)}
              >
                {pending.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
