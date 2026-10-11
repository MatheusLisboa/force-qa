-- Auditoria de RLS. Cada linha roda como um usuário real (role "authenticated" + claim sub),
-- exatamente como o PostgREST faz. Falha (exit != 0) se qualquer asserção não bater.
-- Legenda: expect_none = NÃO pode ler/alterar; expect_some = caminho legítimo continua aberto.

-- Convidado realista: a API cria sem organização (migration 18). Fica fora do seed comum.
INSERT INTO rls_test.ids VALUES ('guestN', 'a6000000-0000-4000-8000-000000000006');
INSERT INTO auth.users (id, email) VALUES (rls_test.id('guestN'), 'guestN@teste.dev');
INSERT INTO public.users (id, name, email, role, squad, is_guest) VALUES (rls_test.id('guestN'), 'Guest N', 'guestN@teste.dev', 'qa', 'Externo', true);
INSERT INTO public.room_members VALUES ('room-a1', rls_test.id('guestN')) ON CONFLICT DO NOTHING;

-- ===== Isolamento de LEITURA entre organizações (qaA é da org A, membro da sala A1) =====
SELECT rls_test.expect_none('qaA', $q$select 1 from public.war_rooms where id = 'room-b1'$q$, 'não vê sala de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.bugs where war_room_id = 'room-b1'$q$, 'não vê bugs de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.bug_comments where war_room_id = 'room-b1'$q$, 'não vê comentários de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.activity_logs where war_room_id = 'room-b1'$q$, 'não vê atividade de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.room_members where war_room_id = 'room-b1'$q$, 'não vê membros de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.users where organization_id = rls_test.id('orgB')$q$, 'não lista usuários de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.projects p where p.organization_id = rls_test.id('orgB')$q$, 'não vê projetos de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.board_views v where v.organization_id = rls_test.id('orgB')$q$, 'não vê visões de outra org');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.notifications where user_id = rls_test.id('qaB')$q$, 'não lê notificações de outra pessoa');

-- ===== Caminho legítimo continua aberto =====
SELECT rls_test.expect_some('qaA', $q$select 1 from public.war_rooms where id = 'room-a1'$q$, 'vê a própria sala');
SELECT rls_test.expect_some('qaA', $q$select 1 from public.bugs where war_room_id = 'room-a1'$q$, 'vê bugs da própria sala');
SELECT rls_test.expect_some('qaA', $q$select 1 from public.bug_comments where war_room_id = 'room-a1'$q$, 'vê comentários da própria sala');
SELECT rls_test.expect_some('qaB', $q$select 1 from public.bugs where war_room_id = 'room-b1'$q$, 'org B enxerga os próprios bugs');
SELECT rls_test.expect_some('qaA', $q$select 1 from public.users where id = rls_test.id('qaA')$q$, 'lê o próprio perfil');

-- ===== Salas da mesma org às quais a pessoa NÃO pertence =====
SELECT rls_test.expect_none('qaA', $q$select 1 from public.bugs where war_room_id = 'room-a2'$q$, 'não lê bugs de sala da própria org em que não é membro');
SELECT rls_test.expect_none('devA', $q$select 1 from public.war_rooms where id = 'room-a2'$q$, 'não vê sala da própria org em que não é membro');

-- ===== Isolamento de ESCRITA entre organizações =====
SELECT rls_test.expect_none('qaA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('x1', 'room-b1', 'intruso', 'low', 'new', 'dev', 'bug', rls_test.id('qaA'))$q$, 'não cria bug em sala de outra org');
SELECT rls_test.expect_none('qaA', $q$update public.bugs set title = 'hackeado' where id = 'bug-b1'$q$, 'não edita bug de outra org');
SELECT rls_test.expect_none('qaA', $q$delete from public.bugs where id = 'bug-b1'$q$, 'não apaga bug de outra org');
SELECT rls_test.expect_none('qaA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('cx', 'bug-b1', 'room-b1', rls_test.id('qaA'), 'oi')$q$, 'não comenta em bug de outra org');
SELECT rls_test.expect_none('qaA', $q$insert into public.room_members (war_room_id, user_id) values ('room-b1', rls_test.id('qaA'))$q$, 'não se adiciona a sala de outra org');
SELECT rls_test.expect_none('qaA', $q$update public.war_rooms set name = 'tomada' where id = 'room-b1'$q$, 'não edita sala de outra org');
SELECT rls_test.expect_none('qaA', $q$delete from public.war_rooms where id = 'room-b1'$q$, 'não apaga sala de outra org');
-- O trigger set_war_room_organization_id reatribui a sala à organização de QUEM CRIOU: pedir orgB não adianta.
SELECT rls_test.q('qaA', $q$insert into public.war_rooms (id, name, project, squad, date, created_by, organization_id) values ('rx', 'x', 'x', 'x', '2026-10-01', rls_test.id('qaA'), rls_test.id('orgB'))$q$);
SELECT rls_test.expect_value((SELECT organization_id::text FROM public.war_rooms WHERE id = 'rx'), rls_test.id('orgA')::text, 'qaA: sala criada pedindo orgB cai na org do criador (A)');
-- O ataque que importa: forjar created_by de alguém da org B para a sala nascer lá.
SELECT rls_test.expect_none('qaA', $q$insert into public.war_rooms (id, name, project, squad, date, created_by) values ('ry', 'plantada', 'x', 'x', '2026-10-01', rls_test.id('qaB'))$q$, 'não planta sala em outra org forjando created_by');
SELECT rls_test.expect_none('qaA', $q$insert into public.projects (id, name, slug, squad, war_room_id, created_by) values (gen_random_uuid(), 'p', 'p', 's', 'room-b1', rls_test.id('qaB'))$q$, 'não cria projeto em nome de outra org');
SELECT rls_test.expect_none('adminA', $q$update public.bugs set title = 'hackeado' where id = 'bug-b1'$q$, 'admin de uma org não edita bug de outra');
SELECT rls_test.expect_none('adminA', $q$delete from public.war_rooms where id = 'room-b1'$q$, 'admin de uma org não apaga sala de outra');
SELECT rls_test.expect_none('adminA', $q$update public.users set role = 'viewer' where id = rls_test.id('qaB')$q$, 'admin de uma org não altera usuário de outra');
SELECT rls_test.expect_none('adminA', $q$delete from public.users where id = rls_test.id('qaB')$q$, 'admin de uma org não apaga usuário de outra');
SELECT rls_test.expect_none('adminA', $q$insert into public.users (id, name, email, role, squad, organization_id) values (gen_random_uuid(), 'x', 'x@x.dev', 'admin', 'x', rls_test.id('orgB'))$q$, 'admin de uma org não cria usuário em outra');

-- ===== Escalonamento de privilégio (qaA tenta virar admin/superadmin/trocar de org) =====
SELECT rls_test.q('qaA', $q$update public.users set is_superadmin = true where id = rls_test.id('qaA')$q$);
SELECT rls_test.expect_value((SELECT is_superadmin::text FROM public.users WHERE id = rls_test.id('qaA')), 'false', 'qaA: não vira superadmin');
SELECT rls_test.q('qaA', $q$update public.users set role = 'admin' where id = rls_test.id('qaA')$q$);
SELECT rls_test.expect_value((SELECT role FROM public.users WHERE id = rls_test.id('qaA')), 'qa', 'qaA: não vira admin');
SELECT rls_test.q('qaA', $q$update public.users set organization_id = rls_test.id('orgB') where id = rls_test.id('qaA')$q$);
SELECT rls_test.expect_value((SELECT organization_id::text FROM public.users WHERE id = rls_test.id('qaA')), rls_test.id('orgA')::text, 'qaA: não troca de organização');
SELECT rls_test.q('qaA', $q$update public.users set is_guest = false, name = 'novo nome' where id = rls_test.id('qaA')$q$);
SELECT rls_test.expect_value((SELECT name FROM public.users WHERE id = rls_test.id('qaA')), 'novo nome', 'qaA: ainda edita o próprio nome');
SELECT rls_test.expect_none('qaA', $q$update public.users set name = 'sequestrado' where id = rls_test.id('devA')$q$, 'não edita o perfil de outra pessoa');
SELECT rls_test.q('guestA', $q$update public.users set is_guest = false where id = rls_test.id('guestA')$q$);
SELECT rls_test.expect_value((SELECT is_guest::text FROM public.users WHERE id = rls_test.id('guestA')), 'true', 'guestA: não deixa de ser convidado');
-- Regressão do achado: convidado sem org não pode virar "interno" (a API o trataria como org padrão).
SELECT rls_test.expect('guestN', $q$update public.users set is_guest = false where id = rls_test.id('guestN')$q$, 'ERR:P0001', 'convidado sem org não se promove a usuário interno');
SELECT rls_test.expect_value((SELECT is_guest::text FROM public.users WHERE id = rls_test.id('guestN')), 'true', 'guestN: continua convidado');
-- O app regrava o perfil inteiro mandando is_guest igual: isso precisa continuar funcionando.
SELECT rls_test.expect_some('guestN', $q$update public.users set name = 'Guest N2', is_guest = true where id = rls_test.id('guestN')$q$, 'convidado regrava o perfil com is_guest igual (fluxo do saveProfile)');
SELECT rls_test.expect_some('qaA', $q$update public.users set squad = 'Pagamentos 2', is_guest = false where id = rls_test.id('qaA')$q$, 'usuário comum regrava o perfil com is_guest igual');
SELECT rls_test.expect_none('qaA', $q$update public.role_permissions set allowed = true where role = 'viewer'$q$, 'não altera a matriz de permissões');
SELECT rls_test.expect_none('adminA', $q$update public.role_permissions set allowed = true where role = 'viewer'$q$, 'admin comum não altera a matriz (só superadmin)');

-- ===== Falsificação de identidade =====
SELECT rls_test.expect_none('qaA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('cf', 'bug-a1', 'room-a1', rls_test.id('devA'), 'dito por outro')$q$, 'não comenta em nome de outra pessoa');
SELECT rls_test.expect_none('qaA', $q$update public.bug_comments set text = 'editado' where id = 'com-a1' and user_id <> rls_test.id('qaA')$q$, 'não edita comentário alheio');
SELECT rls_test.expect_none('devA', $q$update public.bug_comments set text = 'editado' where id = 'com-a1'$q$, 'dev não edita comentário de outra pessoa');

-- ===== Papéis de leitura =====
SELECT rls_test.expect_some('viewerA', $q$select 1 from public.bugs where war_room_id = 'room-a1'$q$, 'viewer lê os bugs da sala');
SELECT rls_test.expect_none('viewerA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('xv', 'room-a1', 'viewer não escreve', 'low', 'new', 'dev', 'bug', rls_test.id('viewerA'))$q$, 'viewer não cria bug');
SELECT rls_test.expect_none('viewerA', $q$update public.bugs set title = 'mudou' where id = 'bug-a1'$q$, 'viewer não edita bug');
SELECT rls_test.expect_none('viewerA', $q$delete from public.bugs where id = 'bug-a1'$q$, 'viewer não apaga bug');
-- Por desenho, comentar só exige ser membro da sala (policy comments_insert; a UI também permite).
SELECT rls_test.expect_some('viewerA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('cv', 'bug-a1', 'room-a1', rls_test.id('viewerA'), 'observador comenta')$q$, 'viewer (membro) pode comentar');
SELECT rls_test.expect_none('viewerA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('cv2', 'bug-a2', 'room-a2', rls_test.id('viewerA'), 'sala em que não é membro')$q$, 'viewer não comenta em sala de que não é membro');

-- ===== Escrita legítima de quem tem permissão =====
SELECT rls_test.expect_some('qaA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('ok1', 'room-a1', 'criado pelo QA', 'low', 'new', 'dev', 'bug', rls_test.id('qaA'))$q$, 'qa cria bug na própria sala');
SELECT rls_test.expect_some('devA', $q$update public.bugs set status = 'in_progress' where id = 'bug-a1'$q$, 'dev move bug da própria sala');
SELECT rls_test.expect_some('qaA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('ok2', 'bug-a1', 'room-a1', rls_test.id('qaA'), 'comentário legítimo')$q$, 'qa comenta na própria sala');

-- ===== Convidado (guest) =====
SELECT rls_test.expect_none('guestA', $q$select 1 from public.war_rooms where id in ('room-b1', 'room-a2')$q$, 'guest só vê a sala a que foi convidado');
SELECT rls_test.expect_none('guestA', $q$select 1 from public.bugs where war_room_id in ('room-b1', 'room-a2')$q$, 'guest não lê bugs de outras salas');
SELECT rls_test.expect_none('guestA', $q$select 1 from public.users where id <> rls_test.id('guestA') and organization_id = rls_test.id('orgB')$q$, 'guest não lista usuários de outra org');
SELECT rls_test.expect_none('guestA', $q$select 1 from public.room_guest_invites$q$, 'guest não lê tokens de convite');
SELECT rls_test.expect_none('devA', $q$select 1 from public.room_guest_invites$q$, 'dev (sem invite_members) não lê tokens de convite');
SELECT rls_test.expect_some('qaA', $q$select 1 from public.room_guest_invites where war_room_id = 'room-a1'$q$, 'qa (com invite_members) lê o convite da própria sala');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.room_guest_invites where war_room_id = 'room-b1'$q$, 'qa não lê convite de sala de outra org');

-- ===== Anônimo (sem login) =====
SELECT rls_test.expect_none('anon', $q$select 1 from public.war_rooms$q$, 'anon não lê salas');
SELECT rls_test.expect_none('anon', $q$select 1 from public.bugs$q$, 'anon não lê bugs');
SELECT rls_test.expect_none('anon', $q$select 1 from public.users$q$, 'anon não lê usuários');
SELECT rls_test.expect_none('anon', $q$select 1 from public.bug_comments$q$, 'anon não lê comentários');
SELECT rls_test.expect_none('anon', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('xa', 'room-a1', 'x', 'low', 'new', 'dev', 'bug', rls_test.id('qaA'))$q$, 'anon não cria bug');
SELECT rls_test.expect_none('anon', $q$select 1 from public.organization_integrations$q$, 'anon não lê integrações');

-- ===== Segredos e tabelas só-servidor =====
SELECT rls_test.expect_none('qaA', $q$select 1 from public.api_rate_limits$q$, 'rate limit: tabela fechada para o cliente');
SELECT rls_test.expect_none('qaA', $q$select public.consume_rate_limit('k', 60, 1)$q$, 'rate limit: função só do service_role');
SELECT rls_test.expect_none('qaB', $q$select 1 from public.organization_integrations where organization_id = rls_test.id('orgA')$q$, 'não lê token de export de outra org');
SELECT rls_test.expect_none('devA', $q$select 1 from public.organization_integrations$q$, 'dev (sem manage_integrations) não lê integrações da própria org');

-- ===== Superadmin atravessa organizações (comportamento esperado e documentado) =====
SELECT rls_test.expect_some('superadmin', $q$select 1 from public.war_rooms where id = 'room-b1'$q$, 'superadmin vê salas de qualquer org');

-- ===== Storage de evidências (bucket privado; a pasta = id da sala) =====
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence', 'room-a1/print-a.png'), ('evidence', 'room-a2/print-a2.png'), ('evidence', 'room-b1/print-b.png');
SELECT rls_test.expect_some('qaA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a1/%'$q$, 'storage: lê evidência da própria sala');
SELECT rls_test.expect_none('qaA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-b1/%'$q$, 'storage: não lê evidência de outra org');
SELECT rls_test.expect_some('adminA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a2/%'$q$, 'storage: criador da sala lê a evidência dela (a seed prova que o objeto existe)');
SELECT rls_test.expect_none('qaA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a2/%'$q$, 'storage: não lê evidência de sala em que não é membro');
SELECT rls_test.expect_none('qaA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-b1/intruso.png')$q$, 'storage: não envia arquivo para sala de outra org');
SELECT rls_test.expect_some('qaA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a1/novo.png')$q$, 'storage: qa envia arquivo para a própria sala');
SELECT rls_test.expect_none('viewerA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a1/viewer.png')$q$, 'storage: viewer não envia arquivo');
SELECT rls_test.expect_some('viewerA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a1/%'$q$, 'storage: viewer lê evidências da sala');
SELECT rls_test.expect_none('qaA', $q$delete from storage.objects where bucket_id = 'evidence' and name like 'room-b1/%'$q$, 'storage: não apaga evidência de outra org');
SELECT rls_test.expect_none('anon', $q$select 1 from storage.objects$q$, 'storage: anon não lista arquivos');

-- ===== Resultado =====
DO $$
DECLARE
  total int; failed int; r record;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT ok) INTO total, failed FROM rls_test.results;
  FOR r IN SELECT name, detail FROM rls_test.results WHERE NOT ok ORDER BY name LOOP
    RAISE WARNING 'FALHA: % (%)', r.name, r.detail;
  END LOOP;
  RAISE NOTICE '% asserções, % falhas', total, failed;
  IF failed > 0 THEN
    RAISE EXCEPTION 'RLS: % de % asserções falharam', failed, total;
  END IF;
END $$;
