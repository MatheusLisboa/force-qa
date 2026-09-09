-- ForceQA — matriz de permissões por papel (global, o superadmin edita).
-- Rode no SQL Editor depois de migration_export_api.sql.
-- Sem essa tabela o app usa o padrão atual (admin/QA/Scrum operam a sala, viewer só lê).

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role TEXT NOT NULL CHECK (role IN ('admin', 'qa', 'scrum_master', 'developer', 'dba', 'devops', 'viewer')),
  capability TEXT NOT NULL CHECK (capability IN (
    'write_cards',
    'assign_cards',
    'archive_cards',
    'use_ai',
    'manage_spaces',
    'invite_members',
    'manage_users',
    'manage_views',
    'manage_integrations'
  )),
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, capability)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_select" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_write" ON public.role_permissions;

CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "role_permissions_write" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

INSERT INTO public.role_permissions (role, capability, allowed) VALUES
  ('admin', 'write_cards', true),
  ('admin', 'assign_cards', true),
  ('admin', 'archive_cards', true),
  ('admin', 'use_ai', true),
  ('admin', 'manage_spaces', true),
  ('admin', 'invite_members', true),
  ('admin', 'manage_users', true),
  ('admin', 'manage_views', true),
  ('admin', 'manage_integrations', true),
  ('qa', 'write_cards', true),
  ('qa', 'assign_cards', true),
  ('qa', 'archive_cards', true),
  ('qa', 'use_ai', true),
  ('qa', 'manage_spaces', true),
  ('qa', 'invite_members', true),
  ('qa', 'manage_users', false),
  ('qa', 'manage_views', false),
  ('qa', 'manage_integrations', true),
  ('scrum_master', 'write_cards', true),
  ('scrum_master', 'assign_cards', true),
  ('scrum_master', 'archive_cards', true),
  ('scrum_master', 'use_ai', true),
  ('scrum_master', 'manage_spaces', true),
  ('scrum_master', 'invite_members', true),
  ('scrum_master', 'manage_users', false),
  ('scrum_master', 'manage_views', false),
  ('scrum_master', 'manage_integrations', true),
  ('developer', 'write_cards', true),
  ('developer', 'assign_cards', true),
  ('developer', 'archive_cards', false),
  ('developer', 'use_ai', true),
  ('developer', 'manage_spaces', false),
  ('developer', 'invite_members', false),
  ('developer', 'manage_users', false),
  ('developer', 'manage_views', false),
  ('developer', 'manage_integrations', false),
  ('dba', 'write_cards', true),
  ('dba', 'assign_cards', true),
  ('dba', 'archive_cards', false),
  ('dba', 'use_ai', true),
  ('dba', 'manage_spaces', false),
  ('dba', 'invite_members', false),
  ('dba', 'manage_users', false),
  ('dba', 'manage_views', false),
  ('dba', 'manage_integrations', false),
  ('devops', 'write_cards', true),
  ('devops', 'assign_cards', true),
  ('devops', 'archive_cards', false),
  ('devops', 'use_ai', true),
  ('devops', 'manage_spaces', false),
  ('devops', 'invite_members', false),
  ('devops', 'manage_users', false),
  ('devops', 'manage_views', false),
  ('devops', 'manage_integrations', false),
  ('viewer', 'write_cards', false),
  ('viewer', 'assign_cards', false),
  ('viewer', 'archive_cards', false),
  ('viewer', 'use_ai', false),
  ('viewer', 'manage_spaces', false),
  ('viewer', 'invite_members', false),
  ('viewer', 'manage_users', false),
  ('viewer', 'manage_views', false),
  ('viewer', 'manage_integrations', false)
ON CONFLICT (role, capability) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_capability(p_capability TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin()
    OR (
      NOT (
        public.is_guest_user()
        AND p_capability IN (
          'use_ai',
          'manage_spaces',
          'invite_members',
          'manage_users',
          'manage_views',
          'manage_integrations'
        )
      )
      AND COALESCE((
        SELECT rp.allowed
        FROM public.role_permissions rp
        WHERE rp.role = public.current_user_role()
          AND rp.capability = p_capability
      ), false)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_bugs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_capability('write_cards');
$$;

GRANT EXECUTE ON FUNCTION public.has_capability(TEXT) TO authenticated;

-- Role: promover/rebaixar admin continua só com admin da org / superadmin.
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND auth.uid() IS NOT NULL AND NOT public.can_admin_org(NEW.organization_id) THEN
      NEW.role := 'viewer';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF (NEW.role = 'admin' OR OLD.role = 'admin') AND NOT public.can_admin_org(NEW.organization_id) THEN
      RAISE EXCEPTION 'Apenas administradores da organização podem alterar o papel admin.';
    END IF;
    IF NOT public.can_admin_org(NEW.organization_id) AND NOT public.has_capability('manage_users') THEN
      RAISE EXCEPTION 'Você não pode alterar papéis de usuários.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- users
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR public.can_admin_org(organization_id)
    OR (
      public.has_capability('manage_users')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.can_admin_org(organization_id)
    OR (
      public.has_capability('manage_users')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR public.can_admin_org(organization_id)
    OR (
      public.has_capability('manage_users')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (
    public.can_admin_org(organization_id)
    OR (
      public.has_capability('manage_users')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

-- war_rooms / projects / members
DROP POLICY IF EXISTS "war_rooms_insert" ON public.war_rooms;
CREATE POLICY "war_rooms_insert" ON public.war_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_superadmin() OR organization_id IS NOT DISTINCT FROM public.current_organization_id())
    AND public.has_capability('manage_spaces')
  );

DROP POLICY IF EXISTS "room_members_insert" ON public.room_members;
DROP POLICY IF EXISTS "room_members_delete" ON public.room_members;

CREATE POLICY "room_members_insert" ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.can_guest_join_room(war_room_id))
    OR public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  );

CREATE POLICY "room_members_delete" ON public.room_members
  FOR DELETE TO authenticated
  USING (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR user_id = auth.uid()
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  );

DROP POLICY IF EXISTS "bugs_delete" ON public.bugs;
CREATE POLICY "bugs_delete" ON public.bugs
  FOR DELETE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND (
      public.can_admin_org(public.room_organization_id(war_room_id))
      OR created_by = auth.uid()
      OR public.has_capability('archive_cards')
    )
  );

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_room_member(war_room_id)
    AND public.has_capability('manage_spaces')
  );

DROP POLICY IF EXISTS "board_views_select" ON public.board_views;
DROP POLICY IF EXISTS "board_views_insert" ON public.board_views;
DROP POLICY IF EXISTS "board_views_update" ON public.board_views;
DROP POLICY IF EXISTS "board_views_delete" ON public.board_views;

CREATE POLICY "board_views_select" ON public.board_views
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (
      organization_id IS NOT DISTINCT FROM public.current_organization_id()
      AND (is_active = true OR public.has_capability('manage_views'))
    )
  );

CREATE POLICY "board_views_insert" ON public.board_views
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_capability('manage_views')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

CREATE POLICY "board_views_update" ON public.board_views
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.has_capability('manage_views')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.has_capability('manage_views')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

CREATE POLICY "board_views_delete" ON public.board_views
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.has_capability('manage_views')
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

COMMENT ON TABLE public.role_permissions IS
  'Matriz global papel × capacidade; só o superadmin grava. Organizações continuam só superadmin.';
