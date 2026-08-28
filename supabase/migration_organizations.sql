-- ForceQA: organização padrão (preparação multi-tenant, sem mudar RLS).
-- Execute no SQL Editor do Supabase (uma vez), depois das migrations de acesso.
--
-- Não altera is_admin() nem quem vê salas/usuários.
-- Carimba organization_id em users, war_rooms, projects e board_views.
-- Para marcar superadmin da plataforma (a UI ainda ignora):
--   UPDATE public.users SET is_superadmin = true WHERE email = 'seu@email';

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 200),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) > 0 AND char_length(slug) <= 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES ('11111111-1111-4111-8111-111111111111', 'ForceQA', 'default')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.default_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT '11111111-1111-4111-8111-111111111111'::uuid;
$$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.war_rooms
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.board_views
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

UPDATE public.users
SET organization_id = public.default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.war_rooms
SET organization_id = public.default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.projects
SET organization_id = public.default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.board_views bv
SET organization_id = p.organization_id
FROM public.projects p
WHERE bv.project_id = p.id
  AND bv.organization_id IS NULL
  AND p.organization_id IS NOT NULL;

UPDATE public.board_views
SET organization_id = public.default_organization_id()
WHERE organization_id IS NULL;

ALTER TABLE public.users
  ALTER COLUMN organization_id SET DEFAULT public.default_organization_id(),
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.war_rooms
  ALTER COLUMN organization_id SET DEFAULT public.default_organization_id(),
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.projects
  ALTER COLUMN organization_id SET DEFAULT public.default_organization_id(),
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.board_views
  ALTER COLUMN organization_id SET DEFAULT public.default_organization_id(),
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_organization ON public.users (organization_id);
CREATE INDEX IF NOT EXISTS idx_war_rooms_organization ON public.war_rooms (organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization ON public.projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_board_views_organization ON public.board_views (organization_id);

-- ---------------------------------------------------------------------------
-- Inherit org on insert (safety net if the app omits the column)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_organization ON public.users;
CREATE TRIGGER trg_users_organization
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_organization_id();

CREATE OR REPLACE FUNCTION public.set_war_room_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.users
    WHERE id = NEW.created_by;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_war_rooms_organization ON public.war_rooms;
CREATE TRIGGER trg_war_rooms_organization
  BEFORE INSERT ON public.war_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_war_room_organization_id();

CREATE OR REPLACE FUNCTION public.set_project_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.war_room_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.war_rooms
    WHERE id = NEW.war_room_id;
  END IF;
  IF NEW.organization_id IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.users
    WHERE id = NEW.created_by;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_organization ON public.projects;
CREATE TRIGGER trg_projects_organization
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_organization_id();

CREATE OR REPLACE FUNCTION public.set_board_view_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.projects
    WHERE id = NEW.project_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_views_organization ON public.board_views;
CREATE TRIGGER trg_board_views_organization
  BEFORE INSERT ON public.board_views
  FOR EACH ROW
  EXECUTE FUNCTION public.set_board_view_organization_id();

-- ---------------------------------------------------------------------------
-- Auth signup: keep the same profile rules, now with org
-- ---------------------------------------------------------------------------

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
  org_id UUID;
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

  BEGIN
    org_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'organization_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    org_id := NULL;
  END;

  INSERT INTO public.users (id, name, email, role, squad, is_guest, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    LOWER(NEW.email),
    assigned_role,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), ''),
    COALESCE((NEW.raw_user_meta_data->>'is_guest')::boolean, false),
    COALESCE(org_id, public.default_organization_id())
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    squad = CASE WHEN EXCLUDED.squad <> '' THEN EXCLUDED.squad ELSE public.users.squad END,
    is_guest = public.users.is_guest OR EXCLUDED.is_guest,
    organization_id = COALESCE(public.users.organization_id, EXCLUDED.organization_id);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: readable by everyone (still a single org). Writes stay admin-global.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;
CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_admin());
