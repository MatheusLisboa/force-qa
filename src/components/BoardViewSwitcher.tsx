import React from "react";
import { BoardView } from "../types";
import { LayoutGrid } from "lucide-react";

interface BoardViewSwitcherProps {
  views: BoardView[];
  activeViewId: string | null;
  onSelect: (viewId: string | null) => void;
  loading?: boolean;
}

export const BoardViewSwitcher: React.FC<BoardViewSwitcherProps> = ({
  views,
  activeViewId,
  onSelect,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="fq-filter-chip text-xs font-mono text-neutral-500">
        <LayoutGrid className="w-3.5 h-3.5" />
        Carregando views...
      </div>
    );
  }

  if (views.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-mono font-bold uppercase text-neutral-500 tracking-wider flex items-center gap-1">
        <LayoutGrid className="w-3.5 h-3.5" />
        View:
      </span>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`fq-segment !text-xs ${activeViewId === null ? "fq-segment--active" : ""}`}
      >
        Padrão (todos)
      </button>
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onSelect(view.id)}
          className={`fq-segment !text-xs ${activeViewId === view.id ? "fq-segment--active" : ""}`}
          title={view.slug}
        >
          {view.name}
        </button>
      ))}
    </div>
  );
};
