-- Dados e helpers para os testes de RLS. Roda como superusuário (ignora RLS) só para semear.

DROP SCHEMA IF EXISTS rls_test CASCADE;
CREATE SCHEMA rls_test;
GRANT USAGE ON SCHEMA rls_test TO authenticated, anon;

CREATE TABLE rls_test.ids (name text PRIMARY KEY, id uuid NOT NULL);
CREATE TABLE rls_test.results (ok boolean NOT NULL, name text NOT NULL, detail text);
GRANT SELECT ON rls_test.ids TO authenticated, anon;

CREATE FUNCTION rls_test.id(p_name text) RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT id FROM rls_test.ids WHERE name = p_name $$;
GRANT EXECUTE ON FUNCTION rls_test.id(text) TO authenticated, anon;

-- Executa um comando como o usuário dado (mesmo mecanismo do PostgREST: role + claims JWT).
-- SELECT devolve a contagem de linhas; DML devolve as linhas afetadas; erro devolve "ERR:<sqlstate>".
CREATE FUNCTION rls_test.q(who text, stmt text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN who = 'anon' THEN '' ELSE rls_test.id(who)::text END, true);
  PERFORM set_config('request.jwt.claim.role', CASE WHEN who = 'anon' THEN 'anon' ELSE 'authenticated' END, true);
  EXECUTE CASE WHEN who = 'anon' THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    IF stmt ~* '^\s*select' THEN
      EXECUTE 'SELECT count(*) FROM (' || stmt || ') s' INTO n;
    ELSE
      EXECUTE stmt;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
    res := n::text;
  EXCEPTION WHEN OTHERS THEN
    res := 'ERR:' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN res;
END $$;

CREATE FUNCTION rls_test.record(p_ok boolean, p_name text, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS
  $$ INSERT INTO rls_test.results VALUES (p_ok, p_name, p_detail) $$;

-- Afirma que o comando devolve exatamente `expected` (contagem de linhas ou "ERR:xxxxx").
CREATE FUNCTION rls_test.expect(who text, stmt text, expected text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text := rls_test.q(who, stmt);
BEGIN
  PERFORM rls_test.record(got = expected, who || ': ' || p_name, CASE WHEN got = expected THEN NULL ELSE 'esperado ' || expected || ', veio ' || got END);
END $$;

-- Afirma que NADA foi lido/alterado (0 linhas ou erro de permissão).
CREATE FUNCTION rls_test.expect_none(who text, stmt text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text := rls_test.q(who, stmt);
BEGIN
  PERFORM rls_test.record(got = '0' OR got LIKE 'ERR:%', who || ': ' || p_name, CASE WHEN got = '0' OR got LIKE 'ERR:%' THEN NULL ELSE 'vazou/alterou ' || got || ' linha(s)' END);
END $$;

-- Afirma que o comando FUNCIONOU e afetou/leu pelo menos 1 linha (caminho legítimo continua aberto).
CREATE FUNCTION rls_test.expect_some(who text, stmt text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text := rls_test.q(who, stmt);
BEGIN
  PERFORM rls_test.record(got ~ '^[1-9][0-9]*$', who || ': ' || p_name, CASE WHEN got ~ '^[1-9][0-9]*$' THEN NULL ELSE 'esperava >=1, veio ' || got END);
END $$;

-- Afirma sobre um valor lido como superusuário (estado final depois de uma tentativa de ataque).
CREATE FUNCTION rls_test.expect_value(p_actual text, p_expected text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM rls_test.record(p_actual IS NOT DISTINCT FROM p_expected, p_name, CASE WHEN p_actual IS NOT DISTINCT FROM p_expected THEN NULL ELSE 'esperado ' || coalesce(p_expected,'NULL') || ', veio ' || coalesce(p_actual,'NULL') END);
END $$;

-- ---------------------------------------------------------------------------
-- Semeadura: duas organizações isoladas (A e B) + superadmin na org padrão.
-- ---------------------------------------------------------------------------
INSERT INTO rls_test.ids (name, id) VALUES
  ('orgA', '0a0a0a0a-0000-4000-8000-00000000000a'),
  ('orgB', '0b0b0b0b-0000-4000-8000-00000000000b'),
  ('adminA', 'a1000000-0000-4000-8000-000000000001'),
  ('qaA', 'a2000000-0000-4000-8000-000000000002'),
  ('devA', 'a3000000-0000-4000-8000-000000000003'),
  ('viewerA', 'a4000000-0000-4000-8000-000000000004'),
  ('guestA', 'a5000000-0000-4000-8000-000000000005'),
  ('qaB', 'b2000000-0000-4000-8000-000000000002'),
  ('adminB', 'b1000000-0000-4000-8000-000000000001'),
  ('superadmin', 'c1000000-0000-4000-8000-000000000001');

INSERT INTO public.organizations (id, name, slug)
SELECT id, 'Org ' || right(name, 1), lower(name) FROM rls_test.ids WHERE name IN ('orgA', 'orgB');

INSERT INTO auth.users (id, email) SELECT id, name || '@teste.dev' FROM rls_test.ids WHERE name NOT LIKE 'org%';

INSERT INTO public.users (id, name, email, role, squad, organization_id, is_guest, is_superadmin) VALUES
  (rls_test.id('adminA'), 'Admin A', 'adminA@teste.dev', 'admin', 'Pagamentos', rls_test.id('orgA'), false, false),
  (rls_test.id('qaA'), 'QA A', 'qaA@teste.dev', 'qa', 'Pagamentos', rls_test.id('orgA'), false, false),
  (rls_test.id('devA'), 'Dev A', 'devA@teste.dev', 'developer', 'Pagamentos', rls_test.id('orgA'), false, false),
  (rls_test.id('viewerA'), 'Viewer A', 'viewerA@teste.dev', 'viewer', 'Pagamentos', rls_test.id('orgA'), false, false),
  (rls_test.id('guestA'), 'Guest A', 'guestA@teste.dev', 'qa', 'Externo', rls_test.id('orgA'), true, false),
  (rls_test.id('qaB'), 'QA B', 'qaB@teste.dev', 'qa', 'Mobile', rls_test.id('orgB'), false, false),
  (rls_test.id('adminB'), 'Admin B', 'adminB@teste.dev', 'admin', 'Mobile', rls_test.id('orgB'), false, false),
  (rls_test.id('superadmin'), 'Super', 'super@teste.dev', 'admin', 'Plataforma', public.default_organization_id(), false, true);

INSERT INTO public.war_rooms (id, name, project, squad, date, created_by, organization_id) VALUES
  ('room-a1', 'Sala A1', 'Loja', 'Pagamentos', '2026-10-01', rls_test.id('adminA'), rls_test.id('orgA')),
  ('room-a2', 'Sala A2 (privada)', 'Loja', 'Pagamentos', '2026-10-01', rls_test.id('adminA'), rls_test.id('orgA')),
  ('room-b1', 'Sala B1', 'Mobile', 'Mobile', '2026-10-01', rls_test.id('adminB'), rls_test.id('orgB'));

-- add_creator_as_room_member já coloca os criadores; acrescenta os demais.
INSERT INTO public.room_members (war_room_id, user_id) VALUES
  ('room-a1', rls_test.id('qaA')), ('room-a1', rls_test.id('devA')), ('room-a1', rls_test.id('viewerA')), ('room-a1', rls_test.id('guestA')),
  ('room-b1', rls_test.id('qaB'))
ON CONFLICT DO NOTHING;

INSERT INTO public.bugs (id, war_room_id, title, criticism, status, environment, type, created_by, created_by_name) VALUES
  ('bug-a1', 'room-a1', 'Bug da sala A1', 'high', 'new', 'dev', 'bug', rls_test.id('qaA'), 'QA A'),
  ('bug-a2', 'room-a2', 'Bug da sala A2', 'high', 'new', 'dev', 'bug', rls_test.id('adminA'), 'Admin A'),
  ('bug-b1', 'room-b1', 'Bug da sala B1', 'high', 'new', 'dev', 'bug', rls_test.id('qaB'), 'QA B');

INSERT INTO public.bug_comments (id, bug_id, war_room_id, user_id, user_name, text) VALUES
  ('com-a1', 'bug-a1', 'room-a1', rls_test.id('qaA'), 'QA A', 'comentário A'),
  ('com-b1', 'bug-b1', 'room-b1', rls_test.id('qaB'), 'QA B', 'comentário B');
