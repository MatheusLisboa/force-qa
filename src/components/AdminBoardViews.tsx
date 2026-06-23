import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, LayoutGrid, Plus, Save, Trash2 } from "lucide-react";
import { subscribeAllBoardViews, subscribeProjects } from "../lib/supabase";
import {
  createBoardView,
  updateBoardView,
  deleteBoardView,
  reorderBoardViews,
} from "../lib/services";
import { BoardView, BugStatus, Project, SeverityLevel } from "../types";
import { BUG_TYPE_OPTIONS } from "../lib/bugLabels";
import { slugifyBoardViewName } from "../lib/boardViews";

interface AdminBoardViewsProps {
  onBack: () => void;
  initialProjectId?: string | null;
}

const BUG_TYPES = BUG_TYPE_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

const BUG_STATUSES: { value: BugStatus; label: string }[] = [
  { value: "new", label: "Novo" },
  { value: "under_analysis", label: "Em análise" },
  { value: "in_progress", label: "Em correção" },
  { value: "ready_for_qa", label: "Pronto para QA" },
  { value: "validated", label: "Validado" },
  { value: "reopened", label: "Reaberto" },
];

const SEVERITIES: { value: SeverityLevel; label: string }[] = [
  { value: "blocker", label: "Blocker" },
  { value: "critical", label: "Crítico" },
  { value: "high", label: "Alto" },
  { value: "medium", label: "Médio" },
  { value: "low", label: "Baixo" },
];

function toggleArrayValue<T extends string>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

export const AdminBoardViews: React.FC<AdminBoardViewsProps> = ({ onBack, initialProjectId }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
  const [views, setViews] = useState<BoardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTypes, setNewTypes] = useState<string[]>([]);
  const [newStatuses, setNewStatuses] = useState<BugStatus[]>([]);
  const [newSeverity, setNewSeverity] = useState<SeverityLevel[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editTypes, setEditTypes] = useState<string[]>([]);
  const [editStatuses, setEditStatuses] = useState<BugStatus[]>([]);
  const [editSeverity, setEditSeverity] = useState<SeverityLevel[]>([]);
  const [editActive, setEditActive] = useState(true);

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
    setEditActive(view.isActive);
    setError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const slug = (newSlug.trim() || slugifyBoardViewName(name));
    if (!name || !slug) {
      setError("Nome e slug são obrigatórios.");
      return;
    }

    if (!selectedProjectId) {
      setError("Selecione um projeto.");
      return;
    }

    setSaving(true);
    setError("");
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
      setNewSlug("");
      setNewTypes([]);
      setNewStatuses([]);
      setNewSeverity([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar view.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      await updateBoardView(editingId, {
        name: editName.trim(),
        slug: editSlug.trim(),
        isActive: editActive,
        filters: {
          types: editTypes.length ? editTypes : undefined,
          statuses: editStatuses.length ? editStatuses : undefined,
          severity: editSeverity.length ? editSeverity : undefined,
        },
      });
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar view.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Excluir a view "${name}"?`)) return;
    setSaving(true);
    try {
      await deleteBoardView(id);
      if (editingId === id) setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao excluir view.");
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

  const FilterCheckboxes = ({
    types,
    statuses,
    severity,
    onTypes,
    onStatuses,
    onSeverity,
  }: {
    types: string[];
    statuses: BugStatus[];
    severity: SeverityLevel[];
    onTypes: (v: string[]) => void;
    onStatuses: (v: BugStatus[]) => void;
    onSeverity: (v: SeverityLevel[]) => void;
  }) => (
    <div className="grid gap-3 md:grid-cols-3 text-xs">
      <div>
        <p className="fq-label fq-label--xs mb-2">Tipos</p>
        <div className="flex flex-wrap gap-2">
          {BUG_TYPES.map((t) => (
            <label key={t.value} className="fq-filter-chip cursor-pointer">
              <input
                type="checkbox"
                checked={types.includes(t.value)}
                onChange={() => onTypes(toggleArrayValue(types, t.value))}
                className="rounded border-neutral-700"
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="fq-label fq-label--xs mb-2">Status</p>
        <div className="flex flex-wrap gap-2">
          {BUG_STATUSES.map((s) => (
            <label key={s.value} className="fq-filter-chip cursor-pointer">
              <input
                type="checkbox"
                checked={statuses.includes(s.value)}
                onChange={() => onStatuses(toggleArrayValue(statuses, s.value))}
                className="rounded border-neutral-700"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="fq-label fq-label--xs mb-2">Severidade</p>
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map((s) => (
            <label key={s.value} className="fq-filter-chip cursor-pointer">
              <input
                type="checkbox"
                checked={severity.includes(s.value)}
                onChange={() => onSeverity(toggleArrayValue(severity, s.value))}
                className="rounded border-neutral-700"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fq-page fq-page--operational space-y-6">
      <div className="fq-page-header">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[12px] font-mono text-neutral-500 hover:text-neutral-300 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> VOLTAR AO PAINEL
          </button>
          <h1 className="fq-page-title flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-neutral-400" />
            Board Views
          </h1>
          <p className="text-neutral-500 text-[13px] mt-1">
            Views são filtros opcionais no Kanban de cada projeto — não alteram bugs nem colunas.
          </p>
        </div>
      </div>

      {error && <div className="fq-alert-error">{error}</div>}

      <div className="fq-analytics-panel">
        <label className="fq-label fq-label--xs">Projeto</label>
        {projects.length === 0 ? (
          <p className="text-neutral-500 text-xs font-mono mt-2">
            Nenhum projeto cadastrado. Crie um projeto no painel principal.
          </p>
        ) : (
          <select
            className="fq-select text-xs mt-1 max-w-md"
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              setSelectedProjectId(e.target.value || null);
              setEditingId(null);
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.squad})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedProject && (
      <>
      <div className="fq-analytics-panel space-y-4">
        <h3 className="fq-section-title !mb-0">
          <Plus className="w-4 h-4" /> Nova view
        </h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="fq-label fq-label--xs">Nome</label>
              <input
                className="fq-input text-xs mt-1"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug) setNewSlug(slugifyBoardViewName(e.target.value));
                }}
                placeholder="Ex: Apenas bugs críticos"
                required
              />
            </div>
            <div>
              <label className="fq-label fq-label--xs">Slug</label>
              <input
                className="fq-input text-xs mt-1 font-mono"
                value={newSlug}
                onChange={(e) => setNewSlug(slugifyBoardViewName(e.target.value))}
                placeholder="apenas-bugs-criticos"
                required
              />
            </div>
          </div>
          <FilterCheckboxes
            types={newTypes}
            statuses={newStatuses}
            severity={newSeverity}
            onTypes={setNewTypes}
            onStatuses={setNewStatuses}
            onSeverity={setNewSeverity}
          />
          <button type="submit" disabled={saving} className="fq-btn-primary text-xs">
            <Plus className="w-4 h-4" />
            Criar view
          </button>
        </form>
      </div>

      <div className="fq-analytics-panel">
        <h3 className="fq-section-title">Views cadastradas</h3>
        {loading ? (
          <p className="text-neutral-500 text-xs font-mono py-8 text-center">Carregando...</p>
        ) : views.length === 0 ? (
          <p className="text-neutral-500 text-xs font-mono py-8 text-center">
            Nenhuma view cadastrada. O Kanban continua no modo padrão.
          </p>
        ) : (
          <div className="space-y-3">
            {views.map((view, index) => (
              <div key={view.id} className="fq-panel space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-100">{view.name}</p>
                    <p className="text-[11px] font-mono text-neutral-500">{view.slug}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`fq-badge text-[10px] ${view.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-neutral-500/10 text-neutral-400"}`}
                    >
                      {view.isActive ? "ATIVA" : "INATIVA"}
                    </span>
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
                    <button
                      type="button"
                      className="fq-btn-secondary text-xs"
                      onClick={() => startEdit(view)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="fq-btn-danger text-xs"
                      onClick={() => handleDelete(view.id, view.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {editingId === view.id && (
                  <div className="border-t border-white/[0.06] pt-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        className="fq-input text-xs"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <input
                        className="fq-input text-xs font-mono"
                        value={editSlug}
                        onChange={(e) => setEditSlug(slugifyBoardViewName(e.target.value))}
                      />
                    </div>
                    <label className="fq-filter-chip cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                      View ativa
                    </label>
                    <FilterCheckboxes
                      types={editTypes}
                      statuses={editStatuses}
                      severity={editSeverity}
                      onTypes={setEditTypes}
                      onStatuses={setEditStatuses}
                      onSeverity={setEditSeverity}
                    />
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="fq-btn-primary text-xs"
                    >
                      <Save className="w-4 h-4" />
                      Salvar alterações
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};
