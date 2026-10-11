-- ForceQA: criar org + primeiro admin sem o Auth mascarar erro de e-mail.
-- Rode no SQL Editor depois de migration_organization_scope.sql.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO anon, authenticated, service_role;

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
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.can_admin_org(NEW.organization_id) THEN
      RAISE EXCEPTION 'Apenas administradores da organização podem alterar papéis de usuários.';
    END IF;
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
