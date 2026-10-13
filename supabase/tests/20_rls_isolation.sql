-- Auditoria de RLS. Cada linha roda como um usuário real (role "authenticated" + claim sub),
-- exatamente como o PostgREST faz. Falha (exit != 0) se qualquer asserção não bater.
-- Legenda: expect_none = NÃO pode ler/alterar; expect_some = caminho legítimo continua aberto.

-- Convidado realista: a API cria sem organização (migration 18). Fica fora do seed comum.
INSERT INTO rls_test.ids VALUES ('guestN', 'a6000000-0000-4000-8000-000000000006');
INSERT INTO auth.users (id, email) VALUES (rls_test.id('guestN'), 'guestN@teste.dev');
INSERT INTO public.users (id, name, email, role, squad, is_guest) VALUES (rls_test.id('guestN'), 'Guest N', 'guestN@teste.dev', 'viewer', 'Externo', true);
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
SELECT rls_test.expect_msg('superadmin', $q$update public.role_permissions set allowed = false where role = 'admin' and capability = 'manage_users'$q$, 'O papel admin sempre', 'nem o superadmin tira permissão do papel admin');
SELECT rls_test.expect_msg('superadmin', $q$delete from public.role_permissions where role = 'admin' and capability = 'write_cards'$q$, 'O papel admin sempre', 'nem apaga uma permissão do admin');
SELECT rls_test.expect_msg('superadmin', $q$update public.role_permissions set allowed = true where role = 'admin' and capability = 'manage_users'$q$, 'ok', 'regravar o admin com tudo ligado continua permitido (a tela salva a matriz inteira)');

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

-- ===== Último admin, papel por sala, convidado somente leitura, auditoria =====
-- (Mutações em sequência: ficam depois das asserções de isolamento acima.)

-- Último admin: orgB só tem adminB. Conferimos a MENSAGEM (last_admin), porque outro trigger
-- (protect_user_role) também recusa com o mesmo SQLSTATE quando não há JWT de admin.
SELECT rls_test.expect_msg('superadmin', $q$update public.users set role = 'viewer' where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: não pode ser rebaixado');
SELECT rls_test.expect_msg('superadmin', $q$delete from public.users where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: não pode ser apagado');
SELECT rls_test.expect_msg('service', $q$delete from public.users where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: nem a API (service_role) apaga');
SELECT rls_test.expect_msg('superadmin', $q$update public.users set organization_id = rls_test.id('orgA') where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: não pode ser movido de organização');
SELECT rls_test.expect_msg('superadmin', $q$update public.users set is_guest = true where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: não pode virar convidado');
SELECT rls_test.expect_msg('adminB', $q$update public.users set role = 'viewer' where id = rls_test.id('adminB')$q$, 'last_admin', 'último admin: nem ele mesmo se rebaixa');
SELECT rls_test.expect_msg('superadmin', $q$update public.users set name = 'Admin B (renomeado)' where id = rls_test.id('adminB')$q$, 'ok', 'último admin: editar o nome continua permitido');
SELECT rls_test.expect_some('superadmin', $q$update public.users set role = 'admin' where id = rls_test.id('qaB')$q$, 'promover um segundo admin na orgB');
SELECT rls_test.expect_msg('superadmin', $q$update public.users set role = 'qa' where id = rls_test.id('adminB')$q$, 'ok', 'com 2 admins, um pode ser rebaixado');
SELECT rls_test.expect_msg('superadmin', $q$update public.users set role = 'qa' where id = rls_test.id('qaB')$q$, 'last_admin', 'e o que sobrou vira o último e fica protegido');

-- Papel por sala: qaA vira somente leitura na sala A1 (só nela).
UPDATE public.room_members SET read_only = true WHERE war_room_id = 'room-a1' AND user_id = rls_test.id('qaA');
SELECT rls_test.expect_none('qaA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('ro1', 'room-a1', 'x', 'low', 'new', 'dev', 'bug', rls_test.id('qaA'))$q$, 'somente leitura na sala: não cria card');
SELECT rls_test.expect_none('qaA', $q$update public.bugs set title = 'mudou' where id = 'bug-a1'$q$, 'somente leitura na sala: não edita card');
SELECT rls_test.expect_none('qaA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a1/ro.png')$q$, 'somente leitura na sala: não envia arquivo');
SELECT rls_test.expect_some('qaA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('ro-c', 'bug-a1', 'room-a1', rls_test.id('qaA'), 'ainda comento')$q$, 'somente leitura na sala: ainda comenta');
SELECT rls_test.expect_some('qaA', $q$select 1 from public.bugs where war_room_id = 'room-a1'$q$, 'somente leitura na sala: ainda lê');
UPDATE public.room_members SET read_only = false WHERE war_room_id = 'room-a1' AND user_id = rls_test.id('qaA');
SELECT rls_test.expect_some('qaA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('ro2', 'room-a1', 'volta a escrever', 'low', 'new', 'dev', 'bug', rls_test.id('qaA'))$q$, 'sem a restrição volta a criar card');

-- Quem pode alterar o "somente leitura" de alguém.
SELECT rls_test.expect_some('qaA', $q$update public.room_members set read_only = true where war_room_id = 'room-a1' and user_id = rls_test.id('devA')$q$, 'quem convida (qa) restringe outro membro');
SELECT rls_test.expect_none('devA', $q$update public.room_members set read_only = false where war_room_id = 'room-a1' and user_id = rls_test.id('devA')$q$, 'ninguém se libera sozinho');
SELECT rls_test.expect_none('qaA', $q$update public.room_members set read_only = true where war_room_id = 'room-a1' and user_id = rls_test.id('qaA')$q$, 'nem altera a si mesmo');
SELECT rls_test.expect_none('qaA', $q$update public.room_members set read_only = true where war_room_id = 'room-b1'$q$, 'não altera membros de sala de outra org');
SELECT rls_test.expect_none('qaA', $q$update public.room_members set war_room_id = 'room-a2' where war_room_id = 'room-a1' and user_id = rls_test.id('devA')$q$, 'a linha não muda de sala');
SELECT rls_test.expect_none('devA', $q$update public.room_members set read_only = true where war_room_id = 'room-a1' and user_id = rls_test.id('viewerA')$q$, 'dev (sem convidar) não restringe ninguém');
SELECT rls_test.expect_some('adminA', $q$update public.room_members set read_only = false where war_room_id = 'room-a1' and user_id = rls_test.id('devA')$q$, 'admin da org libera');

-- Convidado: sala nova nasce somente leitura/comentário.
SELECT rls_test.expect_value((SELECT guest_permission FROM public.war_rooms WHERE id = 'room-a1'), 'read', 'sala nova: convidado nasce somente leitura');
SELECT rls_test.expect_value((SELECT visibility FROM public.war_rooms WHERE id = 'room-a3'), 'organization', 'sala nova (sem valor explícito): visível à organização por padrão');
SELECT rls_test.expect_none('guestA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('g1', 'room-a1', 'convidado', 'low', 'new', 'dev', 'bug', rls_test.id('guestA'))$q$, 'convidado (sala read): não cria card');
SELECT rls_test.expect_none('guestA', $q$update public.bugs set title = 'x' where id = 'bug-a1'$q$, 'convidado (sala read): não edita card');
SELECT rls_test.expect_none('guestA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a1/g.png')$q$, 'convidado (sala read): não envia arquivo');
SELECT rls_test.expect_some('guestA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('g-c', 'bug-a1', 'room-a1', rls_test.id('guestA'), 'convidado comenta')$q$, 'convidado (sala read): comenta');
SELECT rls_test.expect_some('guestA', $q$select 1 from public.bugs where war_room_id = 'room-a1'$q$, 'convidado (sala read): lê');
UPDATE public.war_rooms SET guest_permission = 'write' WHERE id = 'room-a1';
SELECT rls_test.expect_some('guestA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('g2', 'room-a1', 'convidado escreve', 'low', 'new', 'dev', 'bug', rls_test.id('guestA'))$q$, 'convidado (sala write): cria card');
SELECT rls_test.expect_some('guestA', $q$update public.bugs set title = 'editado pelo convidado' where id = 'g2'$q$, 'convidado (sala write): edita o card que criou');
SELECT rls_test.expect_none('guestA', $q$update public.bugs set title = 'sequestrado' where id = 'bug-a1'$q$, 'convidado (sala write): NÃO edita card de outra pessoa');
SELECT rls_test.expect_none('guestA', $q$delete from public.bugs where id = 'bug-a1'$q$, 'convidado (sala write): NÃO apaga card de outra pessoa');
SELECT rls_test.expect_none('guestA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('g3', 'room-a2', 'sala sem acesso', 'low', 'new', 'dev', 'bug', rls_test.id('guestA'))$q$, 'convidado (sala write): não escreve em sala a que não foi convidado');
SELECT rls_test.expect_some('guestA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a1/g-ok.png')$q$, 'convidado (sala write): envia print para a sala');
SELECT rls_test.expect_none('guestA', $q$update public.war_rooms set guest_permission = 'write' where id = 'room-a1'$q$, 'convidado não muda a própria permissão');
SELECT rls_test.expect_none('qaA', $q$update public.war_rooms set guest_permission = 'write', visibility = 'members' where id = 'room-a1'$q$, 'membro comum não altera visibilidade/permissão da sala');
SELECT rls_test.expect_some('adminA', $q$update public.war_rooms set visibility = 'members' where id = 'room-a1'$q$, 'admin muda a visibilidade da sala');
SELECT rls_test.expect_none('adminA', $q$update public.war_rooms set visibility = 'publica' where id = 'room-a1'$q$, 'visibilidade inválida é recusada');
SELECT rls_test.expect_none('adminA', $q$update public.war_rooms set guest_permission = 'admin' where id = 'room-a1'$q$, 'permissão de convidado inválida é recusada');

-- Convite com validade.
SELECT rls_test.expect_some('adminA', $q$update public.room_guest_invites set expires_at = now() + interval '7 days' where war_room_id = 'room-a1'$q$, 'admin define a validade do convite');
SELECT rls_test.expect_none('devA', $q$update public.room_guest_invites set expires_at = null where war_room_id = 'room-a1'$q$, 'dev não altera a validade do convite');
SELECT rls_test.expect_none('qaA', $q$update public.room_guest_invites set expires_at = null where war_room_id = 'room-b1'$q$, 'não altera convite de sala de outra org');

-- Auditoria.
SELECT rls_test.expect_some('adminA', $q$update public.users set role = 'dba' where id = rls_test.id('devA')$q$, 'admin muda o papel de devA');
SELECT rls_test.expect_some('adminA', $q$select 1 from public.audit_events where action = 'user.role_changed' and target_id = rls_test.id('devA')::text$q$, 'auditoria: admin vê a mudança de papel na própria org');
SELECT rls_test.expect_some('adminA', $q$select 1 from public.audit_events where action = 'room.visibility_changed' and target_id = 'room-a1'$q$, 'auditoria: mudança de visibilidade registrada');
SELECT rls_test.expect_some('adminA', $q$select 1 from public.audit_events where action = 'room.member_read_only'$q$, 'auditoria: mudança de somente leitura registrada');
SELECT rls_test.expect_some('adminA', $q$select 1 from public.audit_events where action = 'room.guest_invite_changed' and target_id = 'room-a1'$q$, 'auditoria: validade do convite registrada');
SELECT rls_test.expect_none('adminA', $q$select 1 from public.audit_events where detail::text like '%token%'$q$, 'auditoria: nunca grava o token do convite');
SELECT rls_test.expect_none('adminB', $q$select 1 from public.audit_events where organization_id = rls_test.id('orgA')$q$, 'auditoria: admin de outra org não vê');
SELECT rls_test.expect_none('qaA', $q$select 1 from public.audit_events$q$, 'auditoria: qa (não admin) não vê');
SELECT rls_test.expect_none('devA', $q$select 1 from public.audit_events$q$, 'auditoria: dev não vê');
SELECT rls_test.expect_none('anon', $q$select 1 from public.audit_events$q$, 'auditoria: anon não vê');
SELECT rls_test.expect_none('adminA', $q$insert into public.audit_events (organization_id, action) values (rls_test.id('orgA'), 'forjado')$q$, 'auditoria: nem admin grava evento falso');
SELECT rls_test.expect_none('adminA', $q$delete from public.audit_events$q$, 'auditoria: nem admin apaga');
SELECT rls_test.expect_none('adminA', $q$update public.audit_events set action = 'x'$q$, 'auditoria: nem admin edita');
SELECT rls_test.expect_none('adminA', $q$select public.log_audit_event(rls_test.id('orgA'), null, 'x', 'forjado')$q$, 'auditoria: função de gravar não é chamável pelo cliente');
SELECT rls_test.expect_some('superadmin', $q$select 1 from public.audit_events where organization_id = rls_test.id('orgA')$q$, 'auditoria: superadmin vê qualquer org');
-- Ações da API (service_role, sem JWT) não são registradas pelo trigger: a API registra com o ator real.
SELECT rls_test.record(
  (SELECT count(*) FROM public.audit_events WHERE actor_id IS NULL) = 0,
  'auditoria: nenhum evento sem ator (ações sem JWT são registradas pela API, com o ator real)');

-- ===== Sala visível à organização: quem não é membro lê e comenta, mas não escreve =====
-- room-a3 é "organization"; devA e qaA NÃO são membros dela. room-a2 é "link" e room-a4 "members".
SELECT rls_test.expect_some('devA', $q$select 1 from public.war_rooms where id = 'room-a3'$q$, 'org-visível: não-membro vê a sala listada');
SELECT rls_test.expect_some('devA', $q$select 1 from public.bugs where war_room_id = 'room-a3'$q$, 'org-visível: não-membro lê os cards');
SELECT rls_test.expect_some('devA', $q$select 1 from public.bug_comments where war_room_id = 'room-a3'$q$, 'org-visível: não-membro lê os comentários');
SELECT rls_test.expect_some('viewerA', $q$select 1 from public.war_rooms where id = 'room-a3'$q$, 'org-visível: viewer também vê');
SELECT rls_test.expect_some('devA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('nm-c', 'bug-a3', 'room-a3', rls_test.id('devA'), 'comento sem ser membro')$q$, 'org-visível: não-membro comenta');
SELECT rls_test.expect_some('devA', $q$insert into public.activity_logs (id, bug_id, war_room_id, user_id, user_name, type, description) values ('nm-l', 'bug-a3', 'room-a3', rls_test.id('devA'), 'Dev A', 'comment', 'comentou')$q$, 'org-visível: o registro de atividade do comentário também grava');
SELECT rls_test.expect_none('devA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('nm-c2', 'bug-a3', 'room-a3', rls_test.id('qaA'), 'em nome de outro')$q$, 'org-visível: não comenta em nome de outra pessoa');
SELECT rls_test.expect_none('devA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('nm-b', 'room-a3', 'sem ser membro', 'low', 'new', 'dev', 'bug', rls_test.id('devA'))$q$, 'org-visível: não-membro NÃO cria card');
SELECT rls_test.expect_none('devA', $q$update public.bugs set title = 'mudou' where id = 'bug-a3'$q$, 'org-visível: não-membro NÃO edita card');
SELECT rls_test.expect_none('devA', $q$delete from public.bugs where id = 'bug-a3'$q$, 'org-visível: não-membro NÃO apaga card');
SELECT rls_test.expect_none('qaA', $q$insert into storage.objects (bucket_id, name) values ('evidence', 'room-a3/intruso.png')$q$, 'org-visível: não-membro NÃO envia arquivo');
SELECT rls_test.expect_none('devA', $q$select 1 from public.room_members where war_room_id = 'room-a3'$q$, 'org-visível: não vê a lista de membros');
SELECT rls_test.expect_none('devA', $q$select 1 from public.room_guest_invites where war_room_id = 'room-a3'$q$, 'org-visível: não vê o convite de convidado');
SELECT rls_test.expect_none('devA', $q$insert into public.room_members (war_room_id, user_id) values ('room-a3', rls_test.id('devA'))$q$, 'org-visível: não se adiciona pelo banco (entra pela API)');
-- Fora da organização, e quem não é "interno", nunca enxerga.
SELECT rls_test.expect_none('qaB', $q$select 1 from public.war_rooms where id = 'room-a3'$q$, 'org-visível: outra organização NÃO vê');
SELECT rls_test.expect_none('qaB', $q$select 1 from public.bugs where war_room_id = 'room-a3'$q$, 'org-visível: outra organização NÃO lê cards');
SELECT rls_test.expect_none('guestN', $q$select 1 from public.war_rooms where id = 'room-a3'$q$, 'org-visível: convidado NÃO vê sala só por ser "da org"');
SELECT rls_test.expect_none('guestN', $q$select 1 from public.bugs where war_room_id = 'room-a3'$q$, 'org-visível: convidado NÃO lê cards');
SELECT rls_test.expect_none('anon', $q$select 1 from public.bugs where war_room_id = 'room-a3'$q$, 'org-visível: anon NÃO lê');
-- Os outros níveis seguem fechados para não-membros.
SELECT rls_test.expect_none('devA', $q$select 1 from public.war_rooms where id = 'room-a2'$q$, 'link: não-membro NÃO vê (comportamento de antes)');
SELECT rls_test.expect_none('devA', $q$select 1 from public.bugs where war_room_id = 'room-a2'$q$, 'link: não-membro NÃO lê cards');
SELECT rls_test.expect_none('devA', $q$select 1 from public.war_rooms where id = 'room-a4'$q$, 'members: não-membro NÃO vê');
SELECT rls_test.expect_none('devA', $q$select 1 from public.bugs where war_room_id = 'room-a4'$q$, 'members: não-membro NÃO lê cards');
SELECT rls_test.expect_none('devA', $q$insert into public.bug_comments (id, bug_id, war_room_id, user_id, text) values ('nm-c3', 'bug-a4', 'room-a4', rls_test.id('devA'), 'x')$q$, 'members: não-membro NÃO comenta');
-- Evidência: lê em sala org-visível, não em link/members.
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence', 'room-a3/print-a3.png'), ('evidence', 'room-a4/print-a4.png');
SELECT rls_test.expect_some('devA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a3/%'$q$, 'org-visível: não-membro vê os prints');
SELECT rls_test.expect_none('devA', $q$select 1 from storage.objects where bucket_id = 'evidence' and name like 'room-a4/%'$q$, 'members: não-membro NÃO vê os prints');
-- Constraint e padrão
SELECT rls_test.expect_none('adminA', $q$update public.war_rooms set visibility = 'publica' where id = 'room-a3'$q$, 'visibilidade inválida continua recusada');
SELECT rls_test.expect_some('adminA', $q$update public.war_rooms set visibility = 'link' where id = 'room-a3'$q$, 'admin pode fechar a sala de volta para "link"');
SELECT rls_test.expect_none('devA', $q$select 1 from public.war_rooms where id = 'room-a3'$q$, 'depois de fechar, o não-membro deixa de ver');
UPDATE public.war_rooms SET visibility = 'organization' WHERE id = 'room-a3';
-- Virar membro libera a escrita (papel dev escreve)
INSERT INTO public.room_members (war_room_id, user_id) VALUES ('room-a3', rls_test.id('devA'));
SELECT rls_test.expect_some('devA', $q$insert into public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by) values ('nm-b2', 'room-a3', 'agora sou membro', 'low', 'new', 'dev', 'bug', rls_test.id('devA'))$q$, 'ao entrar na sala, o mesmo dev passa a criar cards');
SELECT rls_test.record((SELECT count(*) FROM public.war_rooms WHERE visibility = 'organization') >= 1, 'padrão: sala nova nasce "organization" (migration 23)');

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
