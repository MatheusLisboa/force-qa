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
      <div className="flex items-center gap-2 text-[13px] text-neutral-500">
        <span className="fq-spinner !h-4 !w-4" />
        Carregando visões...
      </div>
    );
  }

  if (views.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-500">
        <LayoutGrid className="w-3.5 h-3.5 text-teal-400" />
        Visão
      </span>
      <div className="fq-switcher-track" role="tablist" aria-label="Visões do board">
        <button
          type="button"
          role="tab"
          aria-selected={activeViewId === null}
          onClick={() => onSelect(null)}
          className={`fq-segment !px-2.5 !py-1.5 !text-[12px] ${
            activeViewId === null ? "fq-segment--active" : ""
          }`}
        >
          Todos
        </button>
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeViewId === view.id}
            onClick={() => onSelect(view.id)}
            className={`fq-segment !px-2.5 !py-1.5 !text-[12px] ${
              activeViewId === view.id ? "fq-segment--active" : ""
            }`}
            title={view.name}
          >
            {view.name}
          </button>
        ))}
      </div>
    </div>
  );
};
