-- ForceQA — convidado não pode se promover a usuário interno.
--
-- Achado da auditoria de RLS (supabase/tests): protect_user_privileges só travava
-- is_superadmin e organization_id. Um convidado (is_guest = true, sem organização) conseguia
-- fazer UPDATE no próprio registro com is_guest = false: o RLS deixa cada um editar o próprio
-- perfil. A API então o trata como membro da organização padrão, e /api/rooms/join aceita
-- qualquer sala dessa organização só pelo ID, sem o token de convite que a migration 18 exige.
--
-- Agora is_guest segue a mesma regra de superadmin/organização: só o service_role (API)
-- ou um superadmin altera. Gravar o MESMO valor continua permitido (o app regrava o perfil
-- inteiro em saveProfile).

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
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND COALESCE(NEW.is_guest, false) IS NOT DISTINCT FROM COALESCE(OLD.is_guest, false) THEN
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
      RAISE EXCEPTION 'Não é permitido alterar superadmin, organização ou condição de convidado.';
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
