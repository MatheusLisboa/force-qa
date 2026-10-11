-- ForceQA — o trigger em auth.users aborta o createUser (GoTrue devolve {}).
-- Cole o arquivo INTEIRO no SQL Editor. Os COMMIT separam os passos: se o
-- DROP do trigger falhar, a function nova já ficou gravada.
-- O perfil em public.users é gravado pela API (service role).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  assigned_role TEXT;
  app_role TEXT;
  meta_role TEXT;
  org_id UUID;
  is_service_guest BOOLEAN;
  display_name TEXT;
BEGIN
  BEGIN
    is_service_guest := lower(coalesce(NEW.raw_app_meta_data->>'guest', '')) IN ('true', 't', '1');
    app_role := NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '');
    meta_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');
    display_name := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Usuario'
    );
    IF char_length(display_name) > 100 THEN
      display_name := left(display_name, 100);
    END IF;

    IF app_role IS NOT NULL AND app_role NOT IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
      app_role := NULL;
    END IF;
    IF meta_role IS NOT NULL AND meta_role NOT IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
      meta_role := NULL;
    END IF;
    assigned_role := COALESCE(app_role, meta_role, 'viewer');

    BEGIN
      org_id := NULLIF(TRIM(NEW.raw_app_meta_data->>'organization_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      org_id := NULL;
    END;

    IF org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
      org_id := NULL;
    END IF;
    BEGIN
      org_id := COALESCE(org_id, public.default_organization_id());
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    IF is_service_guest THEN
      INSERT INTO public.users (id, name, email, role, squad, is_guest, organization_id)
      VALUES (
        NEW.id,
        display_name,
        LOWER(COALESCE(NEW.email, '')),
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
    ELSE
      INSERT INTO public.users (id, name, email, role, squad, is_guest, organization_id)
      VALUES (
        NEW.id,
        display_name,
        LOWER(COALESCE(NEW.email, '')),
        assigned_role,
        COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), ''),
        false,
        org_id
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        squad = CASE WHEN EXCLUDED.squad <> '' THEN EXCLUDED.squad ELSE public.users.squad END,
        is_guest = public.users.is_guest,
        organization_id = COALESCE(public.users.organization_id, EXCLUDED.organization_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMIT;

GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, supabase_auth_admin, service_role;

COMMIT;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

COMMIT;
