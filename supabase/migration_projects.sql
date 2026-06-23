-- Projects: substituem boards permanentes como entidade de topo.
-- Cada projeto possui um war_room (board) e board_views escopadas por project_id.

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 200),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) > 0 AND char_length(slug) <= 120),
  squad TEXT NOT NULL CHECK (char_length(squad) > 0 AND char_length(squad) <= 200),
  description TEXT NOT NULL DEFAULT '',
  war_room_id TEXT NOT NULL UNIQUE REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_war_room ON public.projects (war_room_id);
CREATE INDEX IF NOT EXISTS idx_projects_squad ON public.projects (squad);

ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- Escopo de board_views por projeto
ALTER TABLE public.board_views
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_board_views_project
  ON public.board_views (project_id, order_index);

-- Backfill: boards existentes viram projetos
INSERT INTO public.projects (name, slug, squad, description, war_room_id, created_by)
SELECT
  wr.name,
  'project-' || wr.id,
  wr.squad,
  COALESCE(wr.description, ''),
  wr.id,
  wr.created_by
FROM public.war_rooms wr
WHERE wr.room_type = 'board'
  AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.war_room_id = wr.id
  );

-- Slug único por projeto (substitui unique global em slug)
ALTER TABLE public.board_views DROP CONSTRAINT IF EXISTS board_views_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS board_views_project_slug_unique
  ON public.board_views (project_id, slug)
  WHERE project_id IS NOT NULL;
