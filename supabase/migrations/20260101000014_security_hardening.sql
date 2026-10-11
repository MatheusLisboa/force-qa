-- ForceQA: endurecimento (issues #1–#5, #8–#9).
-- Rode no SQL Editor depois de migration_room_organization_from_creator.sql.

-- ---------------------------------------------------------------------------
-- #9 GRANT anon desnecessário
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.organizations FROM anon;

-- ---------------------------------------------------------------------------
-- #1 / #2 is_superadmin e organization_id só via service_role / superadmin
--         signup ignora role/org de user_metadata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_superadmin BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_superadmin IS NOT DISTINCT FROM OLD.is_superadmin
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
      RETURN NEW;
    END IF;

    -- service_role / triggers: auth.uid() is null
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(u.is_superadmin, false)
      INTO caller_is_superadmin
      FROM public.users u
     WHERE u.id = auth.uid();

    IF NOT COALESCE(caller_is_superadmin, false) THEN
      RAISE EXCEPTION 'Não é permitido alterar superadmin ou organização.';
    END IF;

    IF NEW.id = auth.uid() AND NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
      RAISE EXCEPTION 'Não é permitido alterar o próprio superadmin.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_privileges ON public.users;
CREATE TRIGGER protect_user_privileges
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_privileges();

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
BEGIN
  app_role := NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '');

  IF app_role IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
    assigned_role := app_role;
  ELSE
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
-- #3 Guest membro da sala sem herdar organization_id
-- ---------------------------------------------------------------------------

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
        AND (
          (
            wr.organization_id IS NOT DISTINCT FROM public.current_organization_id()
            AND (
              public.current_user_role() = 'admin'
              OR EXISTS (
                SELECT 1 FROM public.room_members rm
                WHERE rm.war_room_id = p_room_id AND rm.user_id = auth.uid()
              )
            )
          )
          OR (
            public.is_guest_user()
            AND EXISTS (
              SELECT 1 FROM public.room_members rm
              WHERE rm.war_room_id = p_room_id AND rm.user_id = auth.uid()
            )
          )
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- #5 / #12 comentários e logs não mudam de sala
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_comment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.war_room_id IS DISTINCT FROM OLD.war_room_id
     OR NEW.bug_id IS DISTINCT FROM OLD.bug_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido mover ou reatribuir comentários.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_comment_identity ON public.bug_comments;
CREATE TRIGGER protect_comment_identity
  BEFORE UPDATE ON public.bug_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_comment_identity();

DROP POLICY IF EXISTS "comments_update" ON public.bug_comments;
CREATE POLICY "comments_update" ON public.bug_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_room_member(war_room_id))
  WITH CHECK (user_id = auth.uid() AND public.is_room_member(war_room_id));

CREATE OR REPLACE FUNCTION public.protect_activity_log_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bug_room TEXT;
BEGIN
  SELECT war_room_id INTO bug_room FROM public.bugs WHERE id = NEW.bug_id;
  IF bug_room IS NULL THEN
    RAISE EXCEPTION 'Card não encontrado para o log de atividade.';
  END IF;
  NEW.war_room_id := bug_room;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_activity_log_room ON public.activity_logs;
CREATE TRIGGER protect_activity_log_room
  BEFORE INSERT ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_activity_log_room();

-- ---------------------------------------------------------------------------
-- #8 URLs de evidência só https
-- ---------------------------------------------------------------------------

UPDATE public.bugs
SET evidence_url = NULL
WHERE evidence_url IS NOT NULL
  AND evidence_url !~* '^https://';

UPDATE public.bugs
SET prototype_url = NULL
WHERE prototype_url IS NOT NULL
  AND prototype_url !~* '^https://';

ALTER TABLE public.bugs DROP CONSTRAINT IF EXISTS bugs_evidence_url_https;
ALTER TABLE public.bugs
  ADD CONSTRAINT bugs_evidence_url_https
  CHECK (evidence_url IS NULL OR evidence_url ~* '^https://');

ALTER TABLE public.bugs DROP CONSTRAINT IF EXISTS bugs_prototype_url_https;
ALTER TABLE public.bugs
  ADD CONSTRAINT bugs_prototype_url_https
  CHECK (prototype_url IS NULL OR prototype_url ~* '^https://');

-- ---------------------------------------------------------------------------
-- #4 / #8 bucket evidence privado + path amarrado à sala
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
SET public = false
WHERE id = 'evidence';

DROP POLICY IF EXISTS "evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "evidence_delete" ON storage.objects;

CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.is_room_member(split_part(name, '/', 1))
  );

CREATE POLICY "evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND public.can_write_bugs()
    AND public.is_room_member(split_part(name, '/', 1))
  );

CREATE POLICY "evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.can_write_bugs()
    AND public.is_room_member(split_part(name, '/', 1))
  );

CREATE POLICY "evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.is_room_member(split_part(name, '/', 1))
    AND (public.is_admin() OR public.can_write_bugs())
  );
