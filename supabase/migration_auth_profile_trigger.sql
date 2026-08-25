-- Cria perfil automaticamente quando um usuário se registra no Auth.
-- Nunca promove a admin a partir de user_metadata (apenas app_metadata via service_role).
-- Execute no SQL Editor do Supabase (uma vez).

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
