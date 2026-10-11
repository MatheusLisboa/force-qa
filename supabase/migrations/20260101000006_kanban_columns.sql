-- Colunas customizáveis do Kanban + posicionamento de cards por coluna

ALTER TABLE public.war_rooms
  ADD COLUMN IF NOT EXISTS kanban_columns JSONB;

ALTER TABLE public.bugs
  ADD COLUMN IF NOT EXISTS kanban_column_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bugs_kanban_column_id ON public.bugs(kanban_column_id);
