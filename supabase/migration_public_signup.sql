-- ForceQA — o cadastro da tela de login (API admin createUser) não pode
-- abortar o INSERT em auth.users. Rode no SQL Editor depois de
-- migration_guest_invite_lock.sql. Só troca a function; sem lock de tabela.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role TEXT;
  app_role TEXT;
  meta_role TEXT;
  org_id UUID;
  is_service_guest BOOLEAN;
BEGIN
  is_service_guest := COALESCE((NEW.raw_app_meta_data->>'guest')::boolean, false);
  app_role := NULLIF(TRIM(NEW.raw_app_meta_data->>'role'), '');
  meta_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');

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
  IF meta_role IS NOT NULL AND meta_role NOT IN ('admin', 'qa', 'developer', 'dba', 'devops', 'scrum_master', 'viewer') THEN
    meta_role := NULL;
  END IF;

  assigned_role := COALESCE(app_role, meta_role, 'viewer');

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
