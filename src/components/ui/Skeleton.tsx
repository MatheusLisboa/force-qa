import React from "react";
import { cx } from "./cx";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Bloco cinza animado. Decorativo: o contêiner é quem anuncia o carregamento. */
export const Skeleton: React.FC<SkeletonProps> = ({ className, style }) => (
  <span aria-hidden className={cx("fq-skeleton", className)} style={style} />
);

/** Contêiner que anuncia "carregando" para leitores de tela. */
export const SkeletonRegion: React.FC<{ label?: string; className?: string; children: React.ReactNode }> = ({
  label = "Carregando",
  className,
  children,
}) => (
  <div role="status" aria-live="polite" aria-busy="true" className={className}>
    <span className="sr-only">{label}…</span>
    {children}
  </div>
);

export const KanbanSkeleton: React.FC<{ columns?: number }> = ({ columns = 4 }) => (
  <SkeletonRegion label="Carregando quadro" className="fq-kanban-board">
    {Array.from({ length: columns }, (_, c) => (
      <div key={c} className="fq-kanban-column">
        <div className="fq-kanban-column-header">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-6" />
        </div>
        <div className="fq-kanban-column-body">
          {Array.from({ length: 3 - (c % 2) }, (_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-white/[0.06] p-3">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </SkeletonRegion>
);

export const CardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <SkeletonRegion label="Carregando salas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="space-y-3 rounded-lg border border-white/[0.06] p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    ))}
  </SkeletonRegion>
);

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <SkeletonRegion label="Carregando lista" className="space-y-2">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] p-3">
        <Skeleton className="h-8 w-8 !rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    ))}
  </SkeletonRegion>
);

export const PageSkeleton: React.FC = () => (
  <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-64" />
    </div>
    <CardGridSkeleton />
  </div>
);
