import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, History, Inbox, Keyboard, LayoutGrid, LogOut, Moon, Plug, Shield, Sun, Users, Kanban, Columns3 } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";
import { matchScoreWithKeywords, normalizeText } from "../lib/search";
import type { SpaceRow } from "../lib/spaces";
import type { AdminPagePath } from "../lib/routes";

export interface PaletteCommand {
  id: string;
  group: "Ir para" | "Salas" | "Ações";
  label: string;
  /** Texto extra considerado na busca (squad, projeto…). */
  keywords?: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

const GROUP_ORDER: PaletteCommand["group"][] = ["Ir para", "Salas", "Ações"];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useModalA11y(open, onClose, dialogRef);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const ranked = normalizeText(query)
      ? commands
          .map((command, index) => ({ command, index, score: matchScoreWithKeywords(command.label, command.keywords ?? "", query) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .map((entry) => entry.command)
      : commands;
    // Mantém os grupos contíguos para a navegação por setas bater com o visual.
    return GROUP_ORDER.flatMap((group) => ranked.filter((c) => c.group === group)).slice(0, 40);
  }, [commands, query]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runAt(active);
    }
  };

  let lastGroup = "";
  return createPortal(
    <div
      className="fq-palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="fq-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="fq-palette-input"
          placeholder="Buscar sala, página ou ação…"
          role="combobox"
          aria-expanded="true"
          aria-controls="fq-palette-list"
          aria-activedescendant={results[active] ? `fq-palette-${results[active].id}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
        />
        <div ref={listRef} id="fq-palette-list" role="listbox" className="fq-palette-list">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-neutral-500">Nada encontrado para “{query}”.</p>
          ) : (
            results.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <React.Fragment key={command.id}>
                  {header && <div className="fq-palette-group" role="presentation">{header}</div>}
                  <button
                    type="button"
                    id={`fq-palette-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    className="fq-palette-item"
                    onMouseMove={() => setActive(index)}
                    onClick={() => runAt(index)}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-500" aria-hidden>
                      {command.icon}
                    </span>
                    <span className="truncate">{command.label}</span>
                    {command.hint && <span className="fq-palette-hint">{command.hint}</span>}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export function buildPaletteCommands(args: {
  spaces: SpaceRow[];
  isDark: boolean;
  canUsers: boolean;
  canViews: boolean;
  canOrgs: boolean;
  canIntegrations: boolean;
  go: {
    dashboard: () => void;
    inbox: () => void;
    admin: (path: AdminPagePath) => void;
    room: (roomId: string) => void;
  };
  toggleTheme: () => void;
  openShortcuts: () => void;
  logout: () => void;
}): PaletteCommand[] {
  const { go } = args;
  const nav: PaletteCommand[] = [
    { id: "go-dashboard", group: "Ir para", label: "Painel de salas", icon: <LayoutGrid className="h-4 w-4" />, run: go.dashboard },
    { id: "go-inbox", group: "Ir para", label: "Meus cards (Inbox)", icon: <Inbox className="h-4 w-4" />, run: go.inbox },
  ];
  if (args.canUsers) {
    nav.push({ id: "go-users", group: "Ir para", label: "Usuários", icon: <Users className="h-4 w-4" />, run: () => go.admin("/admin/users") });
    nav.push({ id: "go-audit", group: "Ir para", label: "Auditoria", keywords: "histórico log quem mudou", icon: <History className="h-4 w-4" />, run: () => go.admin("/admin/audit") });
  }
  if (args.canViews) nav.push({ id: "go-views", group: "Ir para", label: "Visões dos boards", icon: <Columns3 className="h-4 w-4" />, run: () => go.admin("/admin/board-views") });
  if (args.canIntegrations) nav.push({ id: "go-integrations", group: "Ir para", label: "Integrações", icon: <Plug className="h-4 w-4" />, run: () => go.admin("/admin/integrations") });
  if (args.canOrgs) {
    nav.push({ id: "go-orgs", group: "Ir para", label: "Organizações", icon: <Building2 className="h-4 w-4" />, run: () => go.admin("/admin/organizations") });
    nav.push({ id: "go-perms", group: "Ir para", label: "Permissões", icon: <Shield className="h-4 w-4" />, run: () => go.admin("/admin/permissions") });
  }

  const rooms: PaletteCommand[] = args.spaces.map((space) => ({
    id: `room-${space.roomId}`,
    group: "Salas",
    label: space.name,
    keywords: `${space.squad} ${space.projectLabel ?? ""}`,
    hint: space.kind === "board" ? "Board" : "War room",
    icon: <Kanban className="h-4 w-4" />,
    run: () => go.room(space.roomId),
  }));

  const actions: PaletteCommand[] = [
    {
      id: "act-theme",
      group: "Ações",
      label: args.isDark ? "Mudar para tema claro" : "Mudar para tema escuro",
      keywords: "tema aparência claro escuro dark light",
      icon: args.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      run: args.toggleTheme,
    },
    { id: "act-shortcuts", group: "Ações", label: "Ver atalhos de teclado", hint: "?", icon: <Keyboard className="h-4 w-4" />, run: args.openShortcuts },
    { id: "act-logout", group: "Ações", label: "Sair", icon: <LogOut className="h-4 w-4" />, run: args.logout },
  ];

  return [...nav, ...rooms, ...actions];
}
