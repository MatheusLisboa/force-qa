-- ForceQA Supabase schema
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bdvpzgrgwgcvfgflelbn/sql

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
  email TEXT NOT NULL CHECK (char_length(email) > 0 AND char_length(email) <= 150),
  role TEXT NOT NULL CHECK (role IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer')),
  squad TEXT NOT NULL DEFAULT '' CHECK (char_length(squad) <= 100),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.war_rooms (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_\-]+$' AND char_length(id) <= 128),
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 200),
  project TEXT NOT NULL CHECK (char_length(project) > 0 AND char_length(project) <= 200),
  squad TEXT NOT NULL CHECK (char_length(squad) > 0 AND char_length(squad) <= 200),
  date TEXT NOT NULL DEFAULT '',
  period_end TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('blocker', 'critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'paused')),
  room_type TEXT NOT NULL DEFAULT 'war_room' CHECK (room_type IN ('war_room', 'board')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT,
  guest_access_disabled BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.bugs (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_\-]+$' AND char_length(id) <= 128),
  war_room_id TEXT NOT NULL REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
  description TEXT NOT NULL DEFAULT '',
  criticism TEXT NOT NULL CHECK (criticism IN ('blocker', 'critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('new', 'under_analysis', 'in_progress', 'ready_for_qa', 'validated', 'reopened')),
  evidence_url TEXT,
  prototype_url TEXT,
  owner_id UUID,
  owner_name TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('production', 'homologation', 'dev')),
  affected_url TEXT,
  build_version TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('immediate', 'high', 'medium', 'low')),
  type TEXT NOT NULL CHECK (type IN ('bug', 'improvement', 'ui_adjustment', 'performance', 'security')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  reopen_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bug_comments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_\-]+$' AND char_length(id) <= 128),
  bug_id TEXT NOT NULL REFERENCES public.bugs(id) ON DELETE CASCADE,
  war_room_id TEXT NOT NULL REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_\-]+$' AND char_length(id) <= 128),
  bug_id TEXT NOT NULL REFERENCES public.bugs(id) ON DELETE CASCADE,
  war_room_id TEXT NOT NULL REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bugs_war_room_id ON public.bugs(war_room_id);
CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON public.bugs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_comments_bug_id ON public.bug_comments(bug_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_bug_id ON public.activity_logs(bug_id);
CREATE INDEX IF NOT EXISTS idx_war_rooms_name ON public.war_rooms(name);
CREATE INDEX IF NOT EXISTS idx_war_rooms_room_type ON public.war_rooms(room_type);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.war_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bugs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.war_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bug_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert" ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "users_update" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "users_delete" ON public.users FOR DELETE TO authenticated
  USING (public.is_admin());

-- war_rooms
CREATE POLICY "war_rooms_select" ON public.war_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "war_rooms_insert" ON public.war_rooms FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
    AND created_by = auth.uid()
  );
CREATE POLICY "war_rooms_update" ON public.war_rooms FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());
CREATE POLICY "war_rooms_delete" ON public.war_rooms FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- bugs
CREATE POLICY "bugs_select" ON public.bugs FOR SELECT TO authenticated USING (true);
CREATE POLICY "bugs_insert" ON public.bugs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "bugs_update" ON public.bugs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "bugs_delete" ON public.bugs FOR DELETE TO authenticated USING (true);

-- bug_comments
CREATE POLICY "comments_select" ON public.bug_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON public.bug_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_update" ON public.bug_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "comments_delete" ON public.bug_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- activity_logs (immutable audit trail)
CREATE POLICY "logs_select" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_insert" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
