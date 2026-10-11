import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";
import { Kbd } from "./ui";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: "Geral",
    items: [
      { keys: [MOD, "K"], label: "Abrir a paleta de comandos" },
      { keys: ["?"], label: "Mostrar esta ajuda" },
      { keys: ["Esc"], label: "Fechar janela ou voltar" },
    ],
  },
  {
    title: "Dentro de uma sala",
    items: [
      { keys: ["N"], label: "Novo card" },
      { keys: ["/"], label: "Buscar cards" },
      { keys: ["M"], label: "Filtrar meus cards" },
    ],
  },
  {
    title: "Quadro Kanban (card em foco)",
    items: [
      { keys: ["↑", "↓"], label: "Card anterior / próximo da coluna" },
      { keys: ["←", "→"], label: "Ir para a coluna vizinha" },
      { keys: ["Shift", "←/→"], label: "Mover o card de coluna" },
      { keys: ["Enter"], label: "Abrir o card" },
    ],
  },
];

export const ShortcutsHelp: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, ref);
  if (!open) return null;

  return createPortal(
    <div
      className="fq-modal-overlay animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1} className="fq-modal fq-modal--sm">
        <div className="fq-modal-header">
          <h2 id="shortcuts-title" className="fq-modal-title">Atalhos de teclado</h2>
          <button type="button" className="fq-btn-ghost !min-h-0 !px-2 !py-2" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="fq-section-title mb-2">{group.title}</h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-4 text-[13px] text-neutral-300">
                    <span>{item.label}</span>
                    <span className="flex gap-1">
                      {item.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
