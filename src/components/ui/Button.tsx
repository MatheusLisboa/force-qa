import React from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "fq-btn-primary",
  secondary: "fq-btn-secondary",
  ghost: "fq-btn-ghost",
  danger: "fq-btn-danger",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Ícone à esquerda do texto. */
  icon?: React.ReactNode;
  /** Botão compacto (sem altura mínima de 36px). */
  compact?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading, icon, compact, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(VARIANT_CLASS[variant], compact && "!min-h-0 !px-2 !py-1.5", className)}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Obrigatório: botão só com ícone precisa de nome acessível. */
  label: string;
  variant?: ButtonVariant;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", className, children, type = "button", title, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx(VARIANT_CLASS[variant], "!min-h-0 !px-2 !py-2", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
