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

--
-- Execução: cada passo é uma transação curta que bloqueia UMA tabela por vez (lock_timeout de 15 s).
-- Rodar tudo numa transação só pegava bloqueios exclusivos em várias tabelas enquanto o Realtime e o
-- PostgREST seguravam bloqueios de leitura em outra ordem: deadlock (40P01) no SQL Editor.
-- Se ainda assim der 40P01 ou "lock timeout", é só rodar de novo: todos os passos são idempotentes.

BEGIN;
SET LOCAL lock_timeout = '15s';
-- Passo 1: a função (não bloqueia nenhuma tabela)
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
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.war_rooms IN ACCESS EXCLUSIVE MODE;
-- Passo 2: salas (níveis de visibilidade, salas existentes viram "link", leitura)
ALTER TABLE public.war_rooms DROP CONSTRAINT IF EXISTS war_rooms_visibility_check;
ALTER TABLE public.war_rooms
  ADD CONSTRAINT war_rooms_visibility_check CHECK (visibility IN ('organization', 'link', 'members'));

UPDATE public.war_rooms SET visibility = 'link' WHERE visibility = 'organization';

ALTER TABLE public.war_rooms ALTER COLUMN visibility SET DEFAULT 'organization';

DROP POLICY IF EXISTS "war_rooms_select" ON public.war_rooms;
CREATE POLICY "war_rooms_select" ON public.war_rooms
  FOR SELECT TO authenticated
  USING (public.can_view_room(id));
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.bugs IN ACCESS EXCLUSIVE MODE;
-- Passo 3: cards
DROP POLICY IF EXISTS "bugs_select" ON public.bugs;
CREATE POLICY "bugs_select" ON public.bugs
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.bug_comments IN ACCESS EXCLUSIVE MODE;
-- Passo 4: comentários (ler, comentar, editar o próprio)
DROP POLICY IF EXISTS "comments_select" ON public.bug_comments;
CREATE POLICY "comments_select" ON public.bug_comments
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "comments_insert" ON public.bug_comments;
CREATE POLICY "comments_insert" ON public.bug_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "comments_update" ON public.bug_comments;
CREATE POLICY "comments_update" ON public.bug_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.can_view_room(war_room_id))
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE;
-- Passo 5: atividade (o comentário gera um registro de atividade)
DROP POLICY IF EXISTS "logs_select" ON public.activity_logs;
CREATE POLICY "logs_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));

DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;
CREATE POLICY "logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_room(war_room_id));
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.projects IN ACCESS EXCLUSIVE MODE;
-- Passo 6: projetos
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_view_room(war_room_id));
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.notifications IN ACCESS EXCLUSIVE MODE;
-- Passo 7: menção num comentário gera notificação para quem comentou, mesmo sem ser membro
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id <> auth.uid()
    AND public.can_write_bugs()
    AND (war_room_id IS NULL OR public.can_view_room(war_room_id))
  );
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
-- Passo 8: prints e anexos
DROP POLICY IF EXISTS "evidence_select" ON storage.objects;
CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND public.can_view_room(split_part(name, '/', 1)));
COMMIT;

-- NÃO mudam (continuam exigindo ser membro): criar/editar/apagar cards e arquivos, gerenciar
-- membros, ver os membros da sala e os convites de convidado.
