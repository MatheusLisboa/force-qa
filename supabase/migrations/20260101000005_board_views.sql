-- Board views — filtros opcionais sobre o Kanban (retrocompatível)

CREATE TABLE IF NOT EXISTS public.board_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 120),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) > 0 AND char_length(slug) <= 120),
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_views_active_order
  ON public.board_views (is_active, order_index);

ALTER PUBLICATION supabase_realtime ADD TABLE public.board_views;

ALTER TABLE public.board_views ENABLE ROW LEVEL SECURITY;

-- Leitura: views ativas para todos; admins veem também inativas
CREATE POLICY "board_views_select" ON public.board_views
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

CREATE POLICY "board_views_insert" ON public.board_views
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "board_views_update" ON public.board_views
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "board_views_delete" ON public.board_views
  FOR DELETE TO authenticated
  USING (public.is_admin());
