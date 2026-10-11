-- ForceQA: isolamento por organização (ainda uma org na prática).
-- Rode no SQL Editor depois de migration_organizations.sql.
--
-- is_admin() (role = admin) continua existindo, mas as policies passam a
-- usar can_admin_org(org_id): admin só na própria org, superadmin em todas.

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_superadmin FROM public.users WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_admin_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.current_user_role() = 'admin'
      AND public.current_organization_id() IS NOT DISTINCT FROM p_org_id
    );
$$;

CREATE OR REPLACE FUNCTION public.room_organization_id(p_room_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.war_rooms WHERE id = p_room_id;
$$;

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.war_rooms wr
      WHERE wr.id = p_room_id
        AND wr.organization_id IS NOT DISTINCT FROM public.current_organization_id()
        AND (
          public.current_user_role() = 'admin'
          OR EXISTS (
            SELECT 1 FROM public.room_members rm
            WHERE rm.war_room_id = p_room_id AND rm.user_id = auth.uid()
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_org(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_organization_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_room_member(TEXT) TO authenticated;

-- Role lock: only org admin / superadmin can grant admin in that org
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

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.can_admin_org(NEW.organization_id) THEN
    RAISE EXCEPTION 'Apenas administradores da organização podem alterar papéis de usuários.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_superadmin()
    OR organization_id IS NOT DISTINCT FROM public.current_organization_id()
  );

CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.can_admin_org(organization_id));

CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.can_admin_org(organization_id))
  WITH CHECK (id = auth.uid() OR public.can_admin_org(organization_id));

CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.can_admin_org(organization_id));

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IS NOT DISTINCT FROM public.current_organization_id() OR public.is_superadmin());

CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- war_rooms
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "war_rooms_insert" ON public.war_rooms;
DROP POLICY IF EXISTS "war_rooms_update" ON public.war_rooms;
DROP POLICY IF EXISTS "war_rooms_delete" ON public.war_rooms;

CREATE POLICY "war_rooms_insert" ON public.war_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_superadmin() OR organization_id IS NOT DISTINCT FROM public.current_organization_id())
    AND (
      public.can_admin_org(organization_id)
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

CREATE POLICY "war_rooms_update" ON public.war_rooms
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_admin_org(organization_id));

CREATE POLICY "war_rooms_delete" ON public.war_rooms
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.can_admin_org(organization_id));

-- ---------------------------------------------------------------------------
-- room_members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "room_members_insert" ON public.room_members;
DROP POLICY IF EXISTS "room_members_delete" ON public.room_members;

CREATE POLICY "room_members_insert" ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.can_guest_join_room(war_room_id))
    OR public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

CREATE POLICY "room_members_delete" ON public.room_members
  FOR DELETE TO authenticated
  USING (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR user_id = auth.uid()
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

-- ---------------------------------------------------------------------------
-- bugs / comments
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "bugs_delete" ON public.bugs;
CREATE POLICY "bugs_delete" ON public.bugs
  FOR DELETE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND (
      public.can_admin_org(public.room_organization_id(war_room_id))
      OR created_by = auth.uid()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

DROP POLICY IF EXISTS "comments_delete" ON public.bug_comments;
CREATE POLICY "comments_delete" ON public.bug_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_admin_org(public.room_organization_id(war_room_id))
  );

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;

CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_room_member(war_room_id)
    AND (
      public.can_admin_org(organization_id)
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
  );

CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_admin_org(organization_id))
  WITH CHECK (created_by = auth.uid() OR public.can_admin_org(organization_id));

CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.can_admin_org(organization_id));

-- ---------------------------------------------------------------------------
-- board_views
-- ---------------------------------------------------------------------------

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
      AND (is_active = true OR public.can_admin_org(organization_id))
    )
  );

CREATE POLICY "board_views_insert" ON public.board_views
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_org(organization_id));

CREATE POLICY "board_views_update" ON public.board_views
  FOR UPDATE TO authenticated
  USING (public.can_admin_org(organization_id))
  WITH CHECK (public.can_admin_org(organization_id));

CREATE POLICY "board_views_delete" ON public.board_views
  FOR DELETE TO authenticated
  USING (public.can_admin_org(organization_id));
