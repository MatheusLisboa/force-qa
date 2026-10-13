-- ForceQA — salas visíveis a toda a organização (somente leitura + comentar para quem não é membro).
--
-- Antes: só membros enxergavam uma sala; os demais precisavam entrar pelo link/ID.
-- Agora a visibilidade tem três níveis:
--   organization : listada e legível por TODA a organização. Quem não é membro lê e comenta;
--                  para criar/editar cards precisa entrar na sala (vira membro com um clique).
--   link         : comportamento de antes: só membros veem; qualquer pessoa da organização entra
--                  com o link/ID.
--   members      : só quem for adicionado/convidado.
--
-- Compatibilidade: as salas que já existem viram "link" (exatamente o que eram), para NÃO abrir
-- dados antigos sem ninguém pedir. Só as salas criadas daqui para frente nascem "organization".

ALTER TABLE public.war_rooms DROP CONSTRAINT IF EXISTS war_rooms_visibility_check;
ALTER TABLE public.war_rooms
  ADD CONSTRAINT war_rooms_visibility_check CHECK (visibility IN ('organization', 'link', 'members'));

UPDATE public.war_rooms SET visibility = 'link' WHERE visibility = 'organization';

ALTER TABLE public.war_rooms ALTER COLUMN visibility SET DEFAULT 'organization';

-- ---------------------------------------------------------------------------
-- "Pode ver" (leitura e comentário) separado de "pode escrever" (membro + papel)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_room_member(p_room_id)
    OR (
      -- Convidado nunca enxerga sala por ser da organização: só a que foi convidado.
      NOT public.is_guest_user()
      AND EXISTS (
        SELECT 1
        FROM public.war_rooms wr
        WHERE wr.id = p_room_id
          AND wr.visibility = 'organization'
          AND wr.organization_id IS NOT DISTINCT FROM public.current_organization_id()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_room(TEXT) TO authenticated;

-- Leitura
DROP POLICY IF EXISTS "war_rooms_select" ON public.war_rooms;
CREATE POLICY "war_rooms_select" ON public.war_rooms
  FOR SELECT TO authenticated
  USING (public.can_view_room(id));

DROP POLICY IF EXISTS "bugs_select" ON public.bugs;
CREATE POLICY "bugs_select" ON public.bugs
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "comments_select" ON public.bug_comments;
CREATE POLICY "comments_select" ON public.bug_comments
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "logs_select" ON public.activity_logs;
CREATE POLICY "logs_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "evidence_select" ON storage.objects;
CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND public.can_view_room(split_part(name, '/', 1)));

-- Comentar (e o registro de atividade que o comentário gera) vale para quem pode ver.
DROP POLICY IF EXISTS "comments_insert" ON public.bug_comments;
CREATE POLICY "comments_insert" ON public.bug_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "comments_update" ON public.bug_comments;
CREATE POLICY "comments_update" ON public.bug_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.can_view_room(war_room_id))
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;
CREATE POLICY "logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));

-- Menção num comentário gera notificação para quem comentou, mesmo sem ser membro.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> auth.uid()
    AND public.can_write_bugs()
    AND (war_room_id IS NULL OR public.can_view_room(war_room_id))
  );

-- NÃO mudam (continuam exigindo ser membro): criar/editar/apagar cards e arquivos, gerenciar
-- membros, ver os membros da sala e os convites de convidado.
