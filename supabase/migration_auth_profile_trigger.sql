-- Cria perfil automaticamente quando um usuário se registra no Auth.
-- Evita falha de cadastro por race condition entre signUp e insert manual.
-- Execute no SQL Editor do Supabase (uma vez).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, squad)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    LOWER(NEW.email),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'viewer'),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'squad'), ''), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    squad = EXCLUDED.squad;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
