-- ForceQA — fecha signup público, isola guest da org, convite com segredo.
-- Rode no SQL Editor depois de migration_role_permissions.sql.
--
-- Se deu 40P01: espere 10s e cole o arquivo inteiro de novo. É idempotente.
-- Não rode duas abas ao mesmo tempo. Os COMMIT separam locks de users /
-- war_rooms / room_members — numa transação só o app em uso deadlocka.

-- ---------------------------------------------------------------------------
-- Funções (sem AccessExclusive nas tabelas de dado)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_user_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_guest, false) THEN
    NEW.organization_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role TEXT;
  app_role TEXT;
  org_id UUID;
  is_service_guest BOOLEAN;
BEGIN
  is_service_guest := COALESCE((NEW.raw_app_meta_data->>'guest')::boolean, false);
  app_role := NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '');

  IF is_service_guest THEN
    INSERT INTO public.users (id, name, email, role, squad, is_guest, organization_id)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
      LOWER(NEW.email),
      'viewer',
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), ''),
      true,
      NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      squad = CASE WHEN EXCLUDED.squad <> '' THEN EXCLUDED.squad ELSE public.users.squad END,
      is_guest = true,
      organization_id = NULL;
    RETURN NEW;
  END IF;

  IF app_role IS NOT NULL AND app_role NOT IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
    app_role := NULL;
  END IF;

  assigned_role := COALESCE(app_role, NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'viewer');
  IF assigned_role NOT IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
    assigned_role := 'viewer';
  END IF;

  BEGIN
    org_id := NULLIF(TRIM(NEW.raw_app_meta_data->>'organization_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    org_id := NULL;
  END;

  IF org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    org_id := NULL;
  END IF;

  INSERT INTO public.users (id, name, email, role, squad, is_guest, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    LOWER(NEW.email),
    assigned_role,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), ''),
    false,
    COALESCE(org_id, public.default_organization_id())
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    squad = CASE WHEN EXCLUDED.squad <> '' THEN EXCLUDED.squad ELSE public.users.squad END,
    is_guest = public.users.is_guest,
    organization_id = COALESCE(public.users.organization_id, EXCLUDED.organization_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_room_guest_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.room_guest_invites (war_room_id, token)
  VALUES (
    NEW.id,
    'gst_' || replace(gen_random_uuid()::text || substr(gen_random_uuid()::text, 1, 8), '-', '')
  )
  ON CONFLICT (war_room_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- users: org nula no guest + SELECT sem diretório da org
-- ---------------------------------------------------------------------------

SET lock_timeout = '15s';
LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.users
  ALTER COLUMN organization_id DROP NOT NULL;

UPDATE public.users
SET organization_id = NULL
WHERE COALESCE(is_guest, false);

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_superadmin()
    OR (
      NOT public.is_guest_user()
      AND public.current_organization_id() IS NOT NULL
      AND organization_id IS NOT DISTINCT FROM public.current_organization_id()
    )
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- war_rooms: default bloqueia guest; tabela + token
-- ---------------------------------------------------------------------------

SET lock_timeout = '15s';
LOCK TABLE public.war_rooms IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.war_rooms
  ALTER COLUMN guest_access_disabled SET DEFAULT true;

CREATE TABLE IF NOT EXISTS public.room_guest_invites (
  war_room_id TEXT PRIMARY KEY REFERENCES public.war_rooms(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.room_guest_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_guest_invites_select" ON public.room_guest_invites;
DROP POLICY IF EXISTS "room_guest_invites_write" ON public.room_guest_invites;

CREATE POLICY "room_guest_invites_select" ON public.room_guest_invites
  FOR SELECT TO authenticated
  USING (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  );

CREATE POLICY "room_guest_invites_write" ON public.room_guest_invites
  FOR ALL TO authenticated
  USING (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  )
  WITH CHECK (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  );

DROP TRIGGER IF EXISTS war_rooms_guest_invite ON public.war_rooms;
CREATE TRIGGER war_rooms_guest_invite
  AFTER INSERT ON public.war_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_room_guest_invite();

INSERT INTO public.room_guest_invites (war_room_id, token)
SELECT
  wr.id,
  'gst_' || replace(gen_random_uuid()::text || substr(gen_random_uuid()::text, 1, 8), '-', '')
FROM public.war_rooms wr
ON CONFLICT (war_room_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_guest_invites TO authenticated;

COMMENT ON TABLE public.room_guest_invites IS
  'Segredo do link de convidado; o ID da sala sozinho não entra.';

COMMIT;

-- ---------------------------------------------------------------------------
-- room_members: guest não se adiciona sozinho
-- ---------------------------------------------------------------------------

SET lock_timeout = '15s';
LOCK TABLE public.room_members IN ACCESS EXCLUSIVE MODE;

DROP POLICY IF EXISTS "room_members_insert" ON public.room_members;
CREATE POLICY "room_members_insert" ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
    )
  );
