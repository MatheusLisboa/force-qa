import React from "react";
import { cx } from "./cx";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Ação principal (normalmente um <Button>). */
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div className={cx("fq-empty", className)}>
    {icon && <span className="fq-empty-icon" aria-hidden>{icon}</span>}
    <p className="fq-empty-title">{title}</p>
    {description && <p className="fq-empty-desc">{description}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>
);
