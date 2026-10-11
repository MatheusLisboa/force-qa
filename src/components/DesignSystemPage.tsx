import React from "react";
import { Inbox, Plus, Search, Trash2 } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { RoomStatusBadge, RoomTypeBadge, SeverityBadge, StatusBadge } from "./BugBadges";
import { BugTypeTag } from "./BugTypeTag";
import { Avatar, Button, CardGridSkeleton, EmptyState, IconButton, Kbd, KanbanSkeleton, ListSkeleton, MenuItem } from "./ui";

const TOKENS: Array<[string, string]> = [
  ["base", "--color-fq-base"],
  ["surface", "--color-fq-surface"],
  ["elevated", "--color-fq-elevated"],
  ["border", "--color-fq-border"],
  ["text", "--color-fq-text"],
  ["text-secondary", "--color-fq-text-secondary"],
  ["text-tertiary", "--color-fq-text-tertiary"],
  ["accent", "--color-fq-accent"],
  ["danger", "--color-fq-danger"],
  ["success", "--color-fq-success"],
  ["warning", "--color-fq-warning"],
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="fq-section-title">{title}</h2>
    <div className="fq-panel space-y-4">{children}</div>
  </section>
);

/** Vitrine do design system. Só existe em desenvolvimento (`/design`). */
export const DesignSystemPage: React.FC = () => {
  const { resolved, toggle } = useTheme();
  return (
    <div className="fq-shell">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="fq-page-eyebrow">Design system</p>
            <h1 className="fq-page-title">ForceQA UI</h1>
          </div>
          <Button onClick={toggle} data-testid="theme-toggle">
            Tema: {resolved === "dark" ? "escuro" : "claro"}
          </Button>
        </header>

        <Section title="Tokens de cor">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TOKENS.map(([name, variable]) => (
              <div key={name} className="space-y-1.5">
                <div className="h-10 rounded-md border" style={{ background: `var(${variable})`, borderColor: "var(--color-fq-border)" }} />
                <p className="text-[11px] text-neutral-400">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Botões">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>Primário</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />}>Perigo</Button>
            <Button variant="primary" loading>Salvando</Button>
            <Button variant="secondary" disabled>Desabilitado</Button>
            <IconButton label="Buscar"><Search className="h-4 w-4" /></IconButton>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            {(["blocker", "critical", "high", "medium", "low"] as const).map((s) => <SeverityBadge key={s} severity={s} size="md" />)}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["new", "under_analysis", "in_progress", "ready_for_qa", "validated", "reopened"] as const).map((s) => <StatusBadge key={s} status={s} size="md" />)}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["bug", "requirement", "ihc", "product", "improvement", "ui_adjustment", "performance", "security"] as const).map((t) => <BugTypeTag key={t} type={t} />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <RoomTypeBadge type="war_room" />
            <RoomTypeBadge type="board" />
            <RoomStatusBadge status="active" />
            <RoomStatusBadge status="paused" />
            <RoomStatusBadge status="ended" />
          </div>
        </Section>

        <Section title="Formulário">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="fq-label">Título</span>
              <input className="fq-input" placeholder="Ex.: Botão de pagar não responde" />
            </label>
            <label className="space-y-1">
              <span className="fq-label">Ambiente</span>
              <select className="fq-select" defaultValue="homologation">
                <option value="production">Produção</option>
                <option value="homologation">Homologação</option>
              </select>
            </label>
          </div>
        </Section>

        <Section title="Avatar, atalhos e menu">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Marina Souza" size="xs" />
            <Avatar name="Marina Souza" size="sm" />
            <Avatar name="Marina Souza" size="md" />
            <span className="flex items-center gap-1 text-[13px] text-neutral-400">Paleta <Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          </div>
          <div className="fq-menu !static w-56 overflow-hidden" role="menu">
            <MenuItem icon={<Inbox className="h-4 w-4" />}>Meus cards</MenuItem>
            <MenuItem icon={<Trash2 className="h-4 w-4" />} danger>Excluir sala</MenuItem>
          </div>
        </Section>

        <Section title="Estados vazios">
          <EmptyState
            icon={<Inbox className="h-4 w-4" />}
            title="Nada na sua fila"
            description="Quando alguém te atribuir um card, ele aparece aqui até ser validado."
            action={<Button variant="primary">Ver salas</Button>}
          />
        </Section>

        <Section title="Skeletons">
          <CardGridSkeleton count={3} />
          <ListSkeleton rows={3} />
          <div className="overflow-hidden"><KanbanSkeleton columns={3} /></div>
        </Section>
      </div>
    </div>
  );
};
