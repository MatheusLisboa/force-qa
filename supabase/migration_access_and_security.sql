-- ForceQA: membership, RLS, evidências, archive, notificações, papéis
-- Execute no SQL Editor do Supabase (uma vez) em cima do schema atual.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.bugs
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bugs_archived ON public.bugs (archived);
CREATE INDEX IF NOT EXISTS idx_bugs_war_room_archived ON public.bugs (war_room_id, archived);

-- ---------------------------------------------------------------------------
-- room_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.room_members (
  war_room_id TEXT NOT NULL REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (war_room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members (user_id);

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'assignment',
  title TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  body TEXT NOT NULL DEFAULT '',
  war_room_id TEXT REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  bug_id TEXT REFERENCES public.bugs(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_guest_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_guest FROM public.users WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.room_members
      WHERE war_room_id = p_room_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_join_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.war_rooms wr
    WHERE wr.id = p_room_id
      AND (
        NOT COALESCE(wr.guest_access_disabled, false)
        OR NOT public.is_guest_user()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guest_join_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_guest_user()
    AND EXISTS (
      SELECT 1 FROM public.war_rooms wr
      WHERE wr.id = p_room_id
        AND NOT COALESCE(wr.guest_access_disabled, false)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_bugs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IS NOT NULL
    AND public.current_user_role() <> 'viewer';
$$;

-- Creator becomes member
CREATE OR REPLACE FUNCTION public.add_creator_as_room_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.room_members (war_room_id, user_id, added_by)
  VALUES (NEW.id, NEW.created_by, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS war_rooms_add_creator_member ON public.war_rooms;
CREATE TRIGGER war_rooms_add_creator_member
  AFTER INSERT ON public.war_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_room_member();

-- Role protection (cannot self-promote, especially to admin)
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- service_role (auth.uid() nulo) pode inserir admin; o client nunca.
    IF NEW.role = 'admin' AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      NEW.role := 'viewer';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis de usuários.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_role ON public.users;
CREATE TRIGGER users_protect_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role();

-- Auth signup: never trust user_metadata for admin
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role TEXT;
  app_role TEXT;
  user_role TEXT;
  non_admin_roles TEXT[] := ARRAY['qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer'];
BEGIN
  app_role := NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '');
  user_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');

  IF app_role IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
    assigned_role := app_role;
  ELSIF user_role = ANY(non_admin_roles) THEN
    assigned_role := user_role;
  ELSE
    assigned_role := 'viewer';
  END IF;

  INSERT INTO public.users (id, name, email, role, squad, is_guest)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    LOWER(NEW.email),
    assigned_role,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), ''),
    COALESCE((NEW.raw_user_meta_data->>'is_guest')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    squad = CASE WHEN EXCLUDED.squad <> '' THEN EXCLUDED.squad ELSE public.users.squad END,
    is_guest = public.users.is_guest OR EXCLUDED.is_guest;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Backfill membership from history
-- ---------------------------------------------------------------------------

INSERT INTO public.room_members (war_room_id, user_id, added_by)
SELECT id, created_by, created_by FROM public.war_rooms
ON CONFLICT DO NOTHING;

INSERT INTO public.room_members (war_room_id, user_id)
SELECT DISTINCT war_room_id, created_by FROM public.bugs
WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.room_members (war_room_id, user_id)
SELECT DISTINCT war_room_id, user_id FROM public.bug_comments
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.room_members (war_room_id, user_id)
SELECT DISTINCT war_room_id, user_id FROM public.activity_logs
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "war_rooms_select" ON public.war_rooms;
DROP POLICY IF EXISTS "war_rooms_insert" ON public.war_rooms;
DROP POLICY IF EXISTS "war_rooms_update" ON public.war_rooms;
DROP POLICY IF EXISTS "war_rooms_delete" ON public.war_rooms;

CREATE POLICY "war_rooms_select" ON public.war_rooms
  FOR SELECT TO authenticated
  USING (public.is_room_member(id));

CREATE POLICY "war_rooms_insert" ON public.war_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

CREATE POLICY "war_rooms_update" ON public.war_rooms
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "war_rooms_delete" ON public.war_rooms
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "room_members_select" ON public.room_members;
DROP POLICY IF EXISTS "room_members_insert" ON public.room_members;
DROP POLICY IF EXISTS "room_members_delete" ON public.room_members;

CREATE POLICY "room_members_select" ON public.room_members
  FOR SELECT TO authenticated
  USING (public.is_room_member(war_room_id) OR user_id = auth.uid());

CREATE POLICY "room_members_insert" ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND public.can_guest_join_room(war_room_id)
    )
    OR public.is_admin()
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

CREATE POLICY "room_members_delete" ON public.room_members
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

DROP POLICY IF EXISTS "bugs_select" ON public.bugs;
DROP POLICY IF EXISTS "bugs_insert" ON public.bugs;
DROP POLICY IF EXISTS "bugs_update" ON public.bugs;
DROP POLICY IF EXISTS "bugs_delete" ON public.bugs;

CREATE POLICY "bugs_select" ON public.bugs
  FOR SELECT TO authenticated
  USING (public.is_room_member(war_room_id));

CREATE POLICY "bugs_insert" ON public.bugs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_room_member(war_room_id)
    AND public.can_write_bugs()
  );

CREATE POLICY "bugs_update" ON public.bugs
  FOR UPDATE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND public.can_write_bugs()
  );

CREATE POLICY "bugs_delete" ON public.bugs
  FOR DELETE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

DROP POLICY IF EXISTS "comments_select" ON public.bug_comments;
DROP POLICY IF EXISTS "comments_insert" ON public.bug_comments;
DROP POLICY IF EXISTS "comments_update" ON public.bug_comments;
DROP POLICY IF EXISTS "comments_delete" ON public.bug_comments;

CREATE POLICY "comments_select" ON public.bug_comments
  FOR SELECT TO authenticated
  USING (public.is_room_member(war_room_id));

CREATE POLICY "comments_insert" ON public.bug_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(war_room_id));

CREATE POLICY "comments_update" ON public.bug_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "comments_delete" ON public.bug_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;

CREATE POLICY "logs_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_room_member(war_room_id));

CREATE POLICY "logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(war_room_id));

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;

CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_room_member(war_room_id));

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_room_member(war_room_id)
    AND (
      public.is_admin()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> auth.uid()
    AND public.can_write_bugs()
    AND (war_room_id IS NULL OR public.is_room_member(war_room_id))
  );

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: evidence bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

DROP POLICY IF EXISTS "evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "evidence_delete" ON storage.objects;

CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'evidence');

CREATE POLICY "evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND public.can_write_bugs()
  );

CREATE POLICY "evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'evidence' AND public.can_write_bugs());

CREATE POLICY "evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'evidence' AND (public.is_admin() OR public.can_write_bugs()));
