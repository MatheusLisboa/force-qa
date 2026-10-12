-- ForceQA — permissões e visibilidade (último admin, visibilidade da sala, convidado, somente leitura,
-- escopo do token de extração e trilha de auditoria).
--
-- Compatibilidade: salas e convites que já existem mantêm o comportamento atual
-- (visibilidade "organization", convidado só lê e comenta, convite sem validade).

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------

-- "organization": qualquer pessoa da organização entra com o link/ID (comportamento de hoje).
-- "members": só entra quem foi convidado/adicionado (a API recusa a auto-entrada).
ALTER TABLE public.war_rooms ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'organization';
ALTER TABLE public.war_rooms DROP CONSTRAINT IF EXISTS war_rooms_visibility_check;
ALTER TABLE public.war_rooms ADD CONSTRAINT war_rooms_visibility_check CHECK (visibility IN ('organization', 'members'));

-- Convidado: "read" (lê e comenta, como já acontecia: a API cria convidados com papel viewer) ou
-- "write" (opt-in por sala, para testadores externos: cria cards e edita os que ele mesmo criou).
ALTER TABLE public.war_rooms ADD COLUMN IF NOT EXISTS guest_permission TEXT NOT NULL DEFAULT 'read';
ALTER TABLE public.war_rooms DROP CONSTRAINT IF EXISTS war_rooms_guest_permission_check;
ALTER TABLE public.war_rooms ADD CONSTRAINT war_rooms_guest_permission_check CHECK (guest_permission IN ('write', 'read'));

-- Papel por sala: um membro pode ser rebaixado a "somente leitura" só nesta sala.
-- (Por desenho só restringe; promover acima do papel global não é possível.)
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;

-- Convite de convidado com validade (NULL = sem validade, como os convites atuais).
ALTER TABLE public.room_guest_invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Token de extração: NULL = todas as salas da organização; senão, só estas.
ALTER TABLE public.organization_integrations ADD COLUMN IF NOT EXISTS export_room_ids TEXT[];

-- ---------------------------------------------------------------------------
-- 2. Nunca deixar a organização sem admin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  losing_admin BOOLEAN := false;
  other_admins INTEGER;
BEGIN
  IF OLD.role IS DISTINCT FROM 'admin' OR COALESCE(OLD.is_guest, false) OR OLD.organization_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    losing_admin := true;
  ELSE
    losing_admin :=
      NEW.role IS DISTINCT FROM 'admin'
      OR COALESCE(NEW.is_guest, false)
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id;
  END IF;

  IF NOT losing_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Apagar a própria organização leva os usuários junto: aí não há o que proteger.
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = OLD.organization_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO other_admins
  FROM public.users u
  WHERE u.organization_id = OLD.organization_id
    AND u.role = 'admin'
    AND NOT COALESCE(u.is_guest, false)
    AND u.id <> OLD.id;

  IF other_admins = 0 THEN
    RAISE EXCEPTION 'last_admin: não é possível remover, rebaixar ou mover o último admin da organização. Promova outro admin antes.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_last_admin_update ON public.users;
CREATE TRIGGER protect_last_admin_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

DROP TRIGGER IF EXISTS protect_last_admin_delete ON public.users;
CREATE TRIGGER protect_last_admin_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- ---------------------------------------------------------------------------
-- 3. Escrita por sala: papel global + somente leitura da sala + regra do convidado
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_write_in_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.room_members rm
        WHERE rm.war_room_id = p_room_id AND rm.user_id = auth.uid() AND rm.read_only
      )
      AND CASE
        -- Convidado não depende do papel (é viewer): vale o que a sala liberou.
        WHEN public.is_guest_user() THEN
          COALESCE((SELECT wr.guest_permission = 'write' FROM public.war_rooms wr WHERE wr.id = p_room_id), false)
        ELSE public.can_write_bugs()
      END
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_in_room(TEXT) TO authenticated;

DROP POLICY IF EXISTS "bugs_insert" ON public.bugs;
CREATE POLICY "bugs_insert" ON public.bugs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_room_member(war_room_id)
    AND public.can_write_in_room(war_room_id)
  );

DROP POLICY IF EXISTS "bugs_update" ON public.bugs;
CREATE POLICY "bugs_update" ON public.bugs
  FOR UPDATE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND public.can_write_in_room(war_room_id)
    -- Convidado liberado só edita o que ele mesmo criou.
    AND (NOT public.is_guest_user() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "bugs_delete" ON public.bugs;
CREATE POLICY "bugs_delete" ON public.bugs
  FOR DELETE TO authenticated
  USING (
    public.is_room_member(war_room_id)
    AND (
      public.can_admin_org(public.room_organization_id(war_room_id))
      OR (
        public.can_write_in_room(war_room_id)
        AND (created_by = auth.uid() OR public.has_capability('archive_cards'))
      )
    )
  );

DROP POLICY IF EXISTS "evidence_insert" ON storage.objects;
CREATE POLICY "evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND public.can_write_in_room(split_part(name, '/', 1))
    AND public.is_room_member(split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "evidence_update" ON storage.objects;
CREATE POLICY "evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.can_write_in_room(split_part(name, '/', 1))
    AND public.is_room_member(split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "evidence_delete" ON storage.objects;
CREATE POLICY "evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.is_room_member(split_part(name, '/', 1))
    AND (public.is_admin() OR public.can_write_in_room(split_part(name, '/', 1)))
  );

-- ---------------------------------------------------------------------------
-- 4. Auditoria
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID,
  actor_id UUID,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON public.audit_events (organization_id, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_events_select" ON public.audit_events;
CREATE POLICY "audit_events_select" ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.can_admin_org(organization_id));

-- Ninguém grava nem apaga pelo cliente: só triggers e o service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM anon, authenticated;
REVOKE ALL ON public.audit_events FROM anon;
REVOKE ALL ON SEQUENCE public.audit_events_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_org UUID,
  p_actor UUID,
  p_actor_name TEXT,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_detail JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_events (organization_id, actor_id, actor_name, action, target_type, target_id, detail)
  VALUES (p_org, p_actor, p_actor_name, p_action, p_target_type, p_target_id, COALESCE(p_detail, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Atalho para os triggers: o ator é quem fez a requisição (JWT). Chamadas do service_role
-- (auth.uid() nulo) NÃO são registradas aqui: a API registra explicitamente, com o ator real.
CREATE OR REPLACE FUNCTION public.audit_from_trigger(
  p_org UUID,
  p_action TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_detail JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_name TEXT;
BEGIN
  IF actor IS NULL THEN
    RETURN;
  END IF;
  SELECT u.name INTO actor_name FROM public.users u WHERE u.id = actor;
  PERFORM public.log_audit_event(p_org, actor, actor_name, p_action, p_target_type, p_target_id, p_detail);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_from_trigger(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_users_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.audit_from_trigger(COALESCE(NEW.organization_id, OLD.organization_id), 'user.role_changed', 'user', NEW.id::text,
        jsonb_build_object('name', NEW.name, 'from', OLD.role, 'to', NEW.role));
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      PERFORM public.audit_from_trigger(COALESCE(NEW.organization_id, OLD.organization_id), 'user.org_changed', 'user', NEW.id::text,
        jsonb_build_object('name', NEW.name, 'from', OLD.organization_id, 'to', NEW.organization_id));
    END IF;
    IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
      PERFORM public.audit_from_trigger(COALESCE(NEW.organization_id, OLD.organization_id), 'user.superadmin_changed', 'user', NEW.id::text,
        jsonb_build_object('name', NEW.name, 'to', NEW.is_superadmin));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_from_trigger(OLD.organization_id, 'user.deleted', 'user', OLD.id::text,
      jsonb_build_object('name', OLD.name, 'role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_users_change ON public.users;
CREATE TRIGGER audit_users_change
  AFTER UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_users_change();

CREATE OR REPLACE FUNCTION public.audit_room_members_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid TEXT := COALESCE(NEW.war_room_id, OLD.war_room_id);
  uid UUID := COALESCE(NEW.user_id, OLD.user_id);
  org UUID := public.room_organization_id(COALESCE(NEW.war_room_id, OLD.war_room_id));
  member_name TEXT;
BEGIN
  SELECT u.name INTO member_name FROM public.users u WHERE u.id = uid;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_from_trigger(org, 'room.member_added', 'room', rid, jsonb_build_object('user_id', uid, 'name', member_name));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_from_trigger(org, 'room.member_removed', 'room', rid, jsonb_build_object('user_id', uid, 'name', member_name));
  ELSIF NEW.read_only IS DISTINCT FROM OLD.read_only THEN
    PERFORM public.audit_from_trigger(org, 'room.member_read_only', 'room', rid,
      jsonb_build_object('user_id', uid, 'name', member_name, 'read_only', NEW.read_only));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_room_members_change ON public.room_members;
CREATE TRIGGER audit_room_members_change
  AFTER INSERT OR UPDATE OR DELETE ON public.room_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_room_members_change();

CREATE OR REPLACE FUNCTION public.audit_war_rooms_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_from_trigger(NEW.organization_id, 'room.created', 'room', NEW.id,
      jsonb_build_object('name', NEW.name, 'visibility', NEW.visibility, 'guest_permission', NEW.guest_permission));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_from_trigger(OLD.organization_id, 'room.deleted', 'room', OLD.id, jsonb_build_object('name', OLD.name));
    RETURN OLD;
  ELSE
    IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
      PERFORM public.audit_from_trigger(NEW.organization_id, 'room.visibility_changed', 'room', NEW.id,
        jsonb_build_object('name', NEW.name, 'from', OLD.visibility, 'to', NEW.visibility));
    END IF;
    IF NEW.guest_permission IS DISTINCT FROM OLD.guest_permission THEN
      PERFORM public.audit_from_trigger(NEW.organization_id, 'room.guest_permission_changed', 'room', NEW.id,
        jsonb_build_object('name', NEW.name, 'from', OLD.guest_permission, 'to', NEW.guest_permission));
    END IF;
    IF NEW.guest_access_disabled IS DISTINCT FROM OLD.guest_access_disabled THEN
      PERFORM public.audit_from_trigger(NEW.organization_id, 'room.guest_access_changed', 'room', NEW.id,
        jsonb_build_object('name', NEW.name, 'guest_access_disabled', NEW.guest_access_disabled));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_war_rooms_change ON public.war_rooms;
CREATE TRIGGER audit_war_rooms_change
  AFTER INSERT OR UPDATE OR DELETE ON public.war_rooms
  FOR EACH ROW EXECUTE FUNCTION public.audit_war_rooms_change();

CREATE OR REPLACE FUNCTION public.audit_role_permissions_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A matriz é global da plataforma (organization_id nulo): só o superadmin enxerga estes eventos.
  PERFORM public.audit_from_trigger(NULL, 'permissions.changed', 'role', COALESCE(NEW.role, OLD.role),
    jsonb_build_object('capability', COALESCE(NEW.capability, OLD.capability), 'allowed', NEW.allowed, 'was', OLD.allowed));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_role_permissions_change ON public.role_permissions;
CREATE TRIGGER audit_role_permissions_change
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_permissions_change();

-- Convite de convidado: registra renovação/validade, NUNCA o token.
CREATE OR REPLACE FUNCTION public.audit_guest_invite_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.token IS DISTINCT FROM OLD.token OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    PERFORM public.audit_from_trigger(public.room_organization_id(NEW.war_room_id), 'room.guest_invite_changed', 'room', NEW.war_room_id,
      jsonb_build_object('rotated', NEW.token IS DISTINCT FROM OLD.token, 'expires_at', NEW.expires_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_guest_invite_change ON public.room_guest_invites;
CREATE TRIGGER audit_guest_invite_change
  AFTER UPDATE ON public.room_guest_invites
  FOR EACH ROW EXECUTE FUNCTION public.audit_guest_invite_change();

-- ---------------------------------------------------------------------------
-- 5. Quem pode marcar um membro como "somente leitura" nesta sala
-- ---------------------------------------------------------------------------
-- Não havia policy de UPDATE em room_members. Mesma regra do INSERT (admin da org, ou quem tem
-- "convidar" e é membro), com duas travas: ninguém altera a si mesmo (não dá para se "liberar")
-- e quem só convida não restringe um admin.

DROP POLICY IF EXISTS "room_members_update" ON public.room_members;
CREATE POLICY "room_members_update" ON public.room_members
  FOR UPDATE TO authenticated
  USING (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
      AND user_id <> auth.uid()
      AND COALESCE((SELECT u.role FROM public.users u WHERE u.id = room_members.user_id), '') <> 'admin'
    )
  )
  WITH CHECK (
    public.can_admin_org(public.room_organization_id(war_room_id))
    OR (
      public.has_capability('invite_members')
      AND public.is_room_member(war_room_id)
      AND user_id <> auth.uid()
    )
  );

-- Só read_only é editável: a linha não pode trocar de sala nem de pessoa.
CREATE OR REPLACE FUNCTION public.protect_room_member_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.war_room_id IS DISTINCT FROM OLD.war_room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido mover um membro para outra sala ou trocar a pessoa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_room_member_identity ON public.room_members;
CREATE TRIGGER protect_room_member_identity
  BEFORE UPDATE ON public.room_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_room_member_identity();

-- ---------------------------------------------------------------------------
-- 6. A matriz nunca tira permissão do papel admin
-- ---------------------------------------------------------------------------
-- A tela Permissões deixava desmarcar qualquer coisa do admin; um clique errado do superadmin
-- poderia travar a administração de todas as organizações. O admin sempre tem tudo.

CREATE OR REPLACE FUNCTION public.protect_admin_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'O papel admin sempre tem todas as permissões.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.role = 'admin' AND NOT NEW.allowed THEN
    RAISE EXCEPTION 'O papel admin sempre tem todas as permissões.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_admin_permissions ON public.role_permissions;
CREATE TRIGGER protect_admin_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_permissions();
