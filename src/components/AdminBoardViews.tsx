import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, LayoutGrid, Plus, Trash2, X } from "lucide-react";
import { subscribeAllBoardViews, subscribeProjects } from "../lib/supabase";
import {
  createBoardView,
  updateBoardView,
  deleteBoardView,
  reorderBoardViews,
} from "../lib/services";
import { BoardView, BoardViewFilters, BugStatus, BugType, Project, SeverityLevel } from "../types";
import {
  BUG_TYPE_OPTIONS,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  getBugTypeConfig,
  getSeverityConfig,
  getStatusConfig,
} from "../lib/bugLabels";
import { slugifyBoardViewName } from "../lib/boardViews";
import { useConfirm } from "../context/ConfirmContext";

interface AdminBoardViewsProps {
  onBack: () => void;
  initialProjectId?: string | null;
}

const BUG_TYPES = BUG_TYPE_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

const BUG_STATUSES = (Object.keys(STATUS_CONFIG) as BugStatus[]).map((value) => ({
  value,
  label: STATUS_CONFIG[value].label,
}));

const SEVERITIES = (Object.keys(SEVERITY_CONFIG) as SeverityLevel[]).map((value) => ({
  value,
  label: SEVERITY_CONFIG[value].label,
}));

function toggleArrayValue<T extends string>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

function FilterToggles({
  types,
  statuses,
  severity,
  onTypes,
  onStatuses,
  onSeverity,
  columns,
}: {
  types: string[];
  statuses: BugStatus[];
  severity: SeverityLevel[];
  onTypes: (v: string[]) => void;
  onStatuses: (v: BugStatus[]) => void;
  onSeverity: (v: SeverityLevel[]) => void;
  columns?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${columns ? "md:grid-cols-3" : ""}`}>
      <div>
        <p className="fq-label fq-label--xs mb-2">Tipos</p>
        <div className="flex flex-wrap gap-1.5">
          {BUG_TYPES.map((t) => {
            const on = types.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                className={`fq-toggle ${on ? "fq-toggle--on" : ""}`}
                onClick={() => onTypes(toggleArrayValue(types, t.value))}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="fq-label fq-label--xs mb-2">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {BUG_STATUSES.map((s) => {
            const on = statuses.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                className={`fq-toggle ${on ? "fq-toggle--on" : ""}`}
                onClick={() => onStatuses(toggleArrayValue(statuses, s.value))}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="fq-label fq-label--xs mb-2">Severidade</p>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => {
            const on = severity.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                className={`fq-toggle ${on ? "fq-toggle--on" : ""}`}
                onClick={() => onSeverity(toggleArrayValue(severity, s.value))}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilterPreview({ filters }: { filters: BoardViewFilters }) {
  const types = filters.types ?? [];
  const statuses = filters.statuses ?? [];
  const severity = filters.severity ?? [];
  const empty = types.length === 0 && statuses.length === 0 && severity.length === 0;

  if (empty) {
    return <p className="text-[13px] text-neutral-500">Todos os cards do board</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((type) => {
        const config = getBugTypeConfig(type as BugType);
        return (
          <span key={`t-${type}`} className={`fq-badge ${config.className}`}>
            {config.label}
          </span>
        );
      })}
      {statuses.map((status) => {
        const config = getStatusConfig(status);
        return (
          <span key={`s-${status}`} className={`fq-badge ${config.className}`}>
            {config.label}
          </span>
        );
      })}
      {severity.map((level) => {
        const config = getSeverityConfig(level);
        return (
          <span key={`v-${level}`} className={`fq-badge ${config.className}`}>
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

export const AdminBoardViews: React.FC<AdminBoardViewsProps> = ({ onBack, initialProjectId }) => {
  const { confirm } = useConfirm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
  const [views, setViews] = useState<BoardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newName, setNewName] = useState("");
  const [newTypes, setNewTypes] = useState<string[]>([]);
  const [newStatuses, setNewStatuses] = useState<BugStatus[]>([]);
  const [newSeverity, setNewSeverity] = useState<SeverityLevel[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editTypes, setEditTypes] = useState<string[]>([]);
  const [editStatuses, setEditStatuses] = useState<BugStatus[]>([]);
  const [editSeverity, setEditSeverity] = useState<SeverityLevel[]>([]);

  const newSlug = slugifyBoardViewName(newName);

  useEffect(() => {
    const unsub = subscribeProjects((rows) => {
      setProjects(rows);
      setSelectedProjectId((current) => {
        if (current && rows.some((p) => p.id === current)) return current;
        if (initialProjectId && rows.some((p) => p.id === initialProjectId)) return initialProjectId;
        return rows[0]?.id ?? null;
      });
    });
    return unsub;
  }, [initialProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setViews([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeAllBoardViews(selectedProjectId, (rows) => {
      setViews(rows);
      setLoading(false);
    });
    return unsub;
  }, [selectedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const startEdit = (view: BoardView) => {
    setEditingId(view.id);
    setEditName(view.name);
    setEditSlug(view.slug);
    setEditTypes(view.filters.types ?? []);
    setEditStatuses(view.filters.statuses ?? []);
    setEditSeverity(view.filters.severity ?? []);
    setError("");
    setSuccess("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const slug = newSlug || slugifyBoardViewName(name);
    if (!name || !slug) {
      setError("Dê um nome para a visão.");
      return;
    }

    if (!selectedProjectId) {
      setError("Selecione um projeto.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await createBoardView({
        projectId: selectedProjectId,
        name,
        slug,
        orderIndex: views.length,
        filters: {
          types: newTypes.length ? newTypes : undefined,
          statuses: newStatuses.length ? newStatuses : undefined,
          severity: newSeverity.length ? newSeverity : undefined,
        },
      });
      setNewName("");
      setNewTypes([]);
      setNewStatuses([]);
      setNewSeverity([]);
      setSuccess("Visão criada. Ela aparece no Kanban deste projeto.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar visão.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    const slug = (editSlug.trim() || slugifyBoardViewName(name));
    if (!name || !slug) {
      setError("Dê um nome para a visão.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateBoardView(editingId, {
        name,
        slug,
        filters: {
          types: editTypes.length ? editTypes : undefined,
          statuses: editStatuses.length ? editStatuses : undefined,
          severity: editSeverity.length ? editSeverity : undefined,
        },
      });
      setEditingId(null);
      setSuccess("Visão atualizada.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar visão.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (view: BoardView) => {
    setError("");
    try {
      await updateBoardView(view.id, { isActive: !view.isActive });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao alterar a visão.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Excluir visão",
      message: `A visão "${name}" será removida deste projeto.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await deleteBoardView(id);
      if (editingId === id) setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao excluir visão.");
    } finally {
      setSaving(false);
    }
  };

  const moveView = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= views.length) return;
    const next = [...views];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setViews(next);
    try {
      await reorderBoardViews(next.map((v) => v.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao reordenar.");
    }
  };

  return (
    <div className="fq-page fq-page--operational">
      <div className="fq-page-header">
        <div>
          <button type="button" onClick={onBack} className="fq-btn-ghost text-sm mb-3">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <p className="fq-page-eyebrow flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5 text-teal-400" /> Admin
          </p>
          <h1 className="fq-page-title mt-1">Visões</h1>
          <p className="text-neutral-500 text-sm mt-1 max-w-xl">
            Filtros salvos no Kanban do projeto. Não alteram cards nem colunas.
          </p>
        </div>
        {projects.length > 0 && (
          <div className="w-full md:w-72">
            <label className="fq-label fq-label--xs" htmlFor="board-views-project">
              Projeto
            </label>
            <select
              id="board-views-project"
              className="fq-select"
              value={selectedProjectId ?? ""}
              onChange={(e) => {
                setSelectedProjectId(e.target.value || null);
                setEditingId(null);
                setError("");
                setSuccess("");
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} · {project.squad}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div className="fq-alert-error text-sm">{error}</div>}
      {success && <div className="fq-alert-success text-sm">{success}</div>}

      {projects.length === 0 ? (
        <div className="fq-empty-state">
          <h4 className="text-neutral-200 font-medium text-[15px]">Nenhum projeto ainda</h4>
          <p className="text-neutral-500 text-sm mt-1 max-w-sm mx-auto">
            Crie um projeto no painel. Depois você define as visões daquele board.
          </p>
        </div>
      ) : selectedProject ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-8">
          <div className="fq-panel p-5 space-y-4 h-fit xl:sticky xl:top-20">
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-100">Nova visão</h2>
              <p className="text-neutral-500 text-[13px] mt-0.5 leading-relaxed">
                Nada marcado = todos os cards. A ordem da lista é a ordem no Kanban.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="fq-label fq-label--xs" htmlFor="new-view-name">
                  Nome
                </label>
                <input
                  id="new-view-name"
                  className="fq-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Apenas bugs críticos"
                  required
                />
                {newSlug ? (
                  <p className="mt-1.5 text-[11px] text-neutral-600 tabular-nums">{newSlug}</p>
                ) : null}
              </div>
              <FilterToggles
                types={newTypes}
                statuses={newStatuses}
                severity={newSeverity}
                onTypes={setNewTypes}
                onStatuses={setNewStatuses}
                onSeverity={setNewSeverity}
              />
              <button type="submit" disabled={saving} className="fq-btn-primary w-full">
                <Plus className="w-4 h-4" />
                {saving ? "Criando..." : "Criar visão"}
              </button>
            </form>
          </div>

          <div className="fq-panel p-5 space-y-4">
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-100">
                Visões de {selectedProject.name} ({views.length})
              </h2>
              <p className="text-neutral-500 text-[13px] mt-0.5">
                Inativas somem do Kanban. Reordene com as setas.
              </p>
            </div>

            {loading ? (
              <div className="fq-empty-state py-10">
                <div className="fq-spinner mx-auto mb-2" />
                <p className="text-sm text-neutral-500">Carregando visões...</p>
              </div>
            ) : views.length === 0 ? (
              <div className="fq-empty-state py-10">
                <h4 className="text-neutral-200 font-medium text-[15px]">Nenhuma visão ainda</h4>
                <p className="text-neutral-500 text-sm mt-1 max-w-sm mx-auto">
                  O Kanban continua no modo padrão, com todos os cards.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {views.map((view, index) => {
                  const isEditing = editingId === view.id;
                  return (
                    <motion.div
                      key={view.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={isEditing ? "fq-table-row--editing" : "fq-table-row !grid-cols-1 !items-stretch"}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-neutral-100 text-sm">{view.name}</p>
                            {!view.isActive && (
                              <span className="fq-badge bg-white/[0.04] border-white/[0.08] text-neutral-500">
                                Oculta
                              </span>
                            )}
                          </div>
                          {!isEditing && <FilterPreview filters={view.filters} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={view.isActive}
                            aria-label={view.isActive ? "Ocultar visão" : "Mostrar visão"}
                            className={`fq-switch ${view.isActive ? "fq-switch--on" : ""}`}
                            onClick={() => handleToggleActive(view)}
                          >
                            <span className="fq-switch-knob" />
                          </button>
                          <button
                            type="button"
                            className="fq-btn-icon"
                            onClick={() => moveView(index, -1)}
                            disabled={index === 0}
                            aria-label="Mover para cima"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="fq-btn-icon"
                            onClick={() => moveView(index, 1)}
                            disabled={index === views.length - 1}
                            aria-label="Mover para baixo"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="fq-btn-primary text-sm py-1.5 px-2"
                                title="Salvar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="fq-btn-ghost text-sm py-1.5 px-2"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="fq-btn-secondary text-sm py-1.5 px-2"
                              onClick={() => startEdit(view)}
                            >
                              Editar
                            </button>
                          )}
                          <button
                            type="button"
                            className="fq-btn-icon hover:text-red-400 hover:bg-red-500/10"
                            onClick={() => handleDelete(view.id, view.name)}
                            aria-label={`Excluir ${view.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isEditing && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 space-y-3">
                              <div>
                                <label className="fq-label fq-label--xs">Nome</label>
                                <input
                                  className="fq-input"
                                  value={editName}
                                  onChange={(e) => {
                                    setEditName(e.target.value);
                                    setEditSlug(slugifyBoardViewName(e.target.value));
                                  }}
                                />
                              </div>
                              <FilterToggles
                                columns
                                types={editTypes}
                                statuses={editStatuses}
                                severity={editSeverity}
                                onTypes={setEditTypes}
                                onStatuses={setEditStatuses}
                                onSeverity={setEditSeverity}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
